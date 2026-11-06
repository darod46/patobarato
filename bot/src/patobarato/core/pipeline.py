"""Queue and orchestration: turns source messages into stored and published offers."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Protocol

from patobarato.config import Settings
from patobarato.core.decision import decide
from patobarato.models import OfferStatus, ParsedOffer, SourceMessage
from patobarato.parsing.extract import extract_offers
from patobarato.parsing.links import UrlResolver
from patobarato.publishing.format import format_caption
from patobarato.storage.repository import Repository
from patobarato.stores.base import Store
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.pipeline")

# Minimum gap between two publications in the channel.
MIN_PUBLISH_INTERVAL_SECONDS = 3.0


class Publisher(Protocol):
    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]:
        """Publish the offer and return ``(chat_id, message_id)``; raise on failure."""
        ...


PhotoProvider = Callable[[SourceMessage, str], Awaitable[bytes | None]]


def utcnow() -> datetime:
    return datetime.now(UTC)


class Pipeline:
    """Processes source messages one at a time through a single worker.

    The single sequential worker is what guarantees that the same offer
    arriving from two sources is published only once.
    """

    def __init__(
        self,
        repo: Repository,
        resolver: UrlResolver,
        publisher: Publisher,
        photo_provider: PhotoProvider,
        settings: Settings,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        monotonic: Callable[[], float] = time.monotonic,
        publish_interval_seconds: float = MIN_PUBLISH_INTERVAL_SECONDS,
        *,
        registry: StoreRegistry,
    ) -> None:
        self._repo = repo
        self._resolver = resolver
        self._publisher = publisher
        self._photo_provider = photo_provider
        self._settings = settings
        self._clock = clock
        self._sleep = sleep
        self._monotonic = monotonic
        self._publish_interval = publish_interval_seconds
        self._registry = registry
        self._last_publish: float | None = None
        self._queue: asyncio.Queue[SourceMessage] = asyncio.Queue()

    async def submit(self, msg: SourceMessage) -> None:
        await self._queue.put(msg)

    async def run(self) -> None:
        while True:
            msg = await self._queue.get()
            try:
                await self.process(msg)
            except Exception:
                logger.exception(
                    "Failed to process message %s from source %s",
                    msg.message_id,
                    msg.source_id,
                )
            finally:
                self._queue.task_done()

    async def process(self, msg: SourceMessage) -> list[OfferStatus]:
        offers = await extract_offers(msg, self._resolver, self._registry)
        statuses: list[OfferStatus] = []
        for offer in offers:
            status = await self._process_offer(msg, offer)
            if status is not None:
                statuses.append(status)
        return statuses

    async def _process_offer(
        self, msg: SourceMessage, offer: ParsedOffer
    ) -> OfferStatus | None:
        product_id = await self._repo.upsert_product(offer)
        offer_id = await self._repo.insert_offer(
            product_id,
            msg.source_id,
            msg.message_id,
            offer,
            msg.text,
            msg.received_at,
        )
        if offer_id is None:
            return None

        last = await self._repo.get_last_publication(
            product_id, offer.country, channel="telegram"
        )
        status = decide(
            offer.price,
            msg.received_at,
            last,
            self._clock(),
            timedelta(days=self._settings.republish_after_days),
            timedelta(minutes=self._settings.stale_after_minutes),
        )
        if status == OfferStatus.PUBLISHED:
            status = await self._publish(msg, offer, offer_id, product_id)
            if status == OfferStatus.PUBLISHED:
                return status  # _publish already stored it
        await self._repo.set_offer_status(offer_id, status)
        return status

    async def _publish(
        self, msg: SourceMessage, offer: ParsedOffer, offer_id: int, product_id: int
    ) -> OfferStatus:
        if offer.price is None:  # decide() never publishes without a price
            return OfferStatus.SKIPPED_NO_PRICE
        photo = await self._get_photo(msg, offer)
        store = self._registry.get(offer.store)
        if store is None:  # extract_offers only yields registered stores
            logger.error("No store %s for offer %s", offer.store, offer_id)
            return OfferStatus.PUBLISH_FAILED
        affiliate_url = await self._affiliate_url(offer, store)
        await self._wait_publish_slot()
        try:
            chat_id, message_id = await self._publisher.publish(
                format_caption(offer, affiliate_url, store.name), photo
            )
        except Exception:
            logger.exception("Failed to publish offer %s (%s)", offer_id, offer.asin)
            return OfferStatus.PUBLISH_FAILED
        finally:
            self._last_publish = self._monotonic()

        # The post is already live: a storage failure must not crash the worker.
        what = f"offer {offer_id} ({offer.asin}) chat_id={chat_id} message_id={message_id}"
        await self._retry_once(
            lambda: self._repo.insert_publication(
                offer_id,
                product_id,
                offer.country,
                chat_id,
                message_id,
                offer.price,
                affiliate_url,
                self._clock(),
            ),
            f"Mensaje publicado pero no registrado (publications): {what}",
        )
        await self._retry_once(
            lambda: self._repo.set_offer_status(offer_id, OfferStatus.PUBLISHED),
            f"Mensaje publicado pero no registrado (estado de la oferta): {what}",
        )
        try:
            url = offer.image_url or await store.find_image(offer.asin, offer.canonical_url)
            if url:
                await self._repo.set_product_image(product_id, url)
        except Exception:
            logger.error("Image lookup failed for %s", offer.asin, exc_info=True)
        return OfferStatus.PUBLISHED

    async def _affiliate_url(self, offer: ParsedOffer, store: Store) -> str:
        if offer.affiliate_url:
            return offer.affiliate_url
        try:
            return await store.affiliate_url(offer.canonical_url, offer.asin)
        except Exception as exc:
            # No traceback: HTTP errors may carry a signed request URL.
            logger.warning(
                "affiliate=missing store=%s product=%s (%s: %s); publishing the canonical link",
                offer.store,
                offer.asin,
                type(exc).__name__,
                exc,
            )
            return offer.canonical_url

    async def _wait_publish_slot(self) -> None:
        """Keeps at least ``publish_interval_seconds`` between publications."""
        if self._last_publish is None:
            return
        wait = self._publish_interval - (self._monotonic() - self._last_publish)
        if wait > 0:
            await self._sleep(wait)

    async def _retry_once(
        self, write: Callable[[], Awaitable[object]], failure_message: str
    ) -> None:
        for attempt in (1, 2):
            try:
                await write()
                return
            except Exception:
                if attempt == 2:
                    logger.error("%s", failure_message, exc_info=True)
                else:
                    logger.warning("Storage write failed; retrying", exc_info=True)

    async def _get_photo(self, msg: SourceMessage, offer: ParsedOffer) -> bytes | None:
        try:
            return await self._photo_provider(msg, offer.canonical_url)
        except Exception:
            logger.exception("Photo lookup failed for %s", offer.canonical_url)
            return None
