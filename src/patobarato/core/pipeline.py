"""Queue and orchestration: turns source messages into stored and published offers."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Protocol

from patobarato.config import Settings
from patobarato.core.decision import decide
from patobarato.models import OfferStatus, ParsedOffer, SourceMessage
from patobarato.parsing.extract import extract_offers
from patobarato.parsing.links import UrlResolver, build_affiliate_url
from patobarato.publishing.format import format_caption
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.pipeline")


class Publisher(Protocol):
    async def publish(
        self, caption: str, button_url: str, photo: bytes | None
    ) -> tuple[int, int]:
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
    ) -> None:
        self._repo = repo
        self._resolver = resolver
        self._publisher = publisher
        self._photo_provider = photo_provider
        self._settings = settings
        self._clock = clock
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
        offers = await extract_offers(msg, self._resolver)
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

        last = await self._repo.get_last_publication(product_id, offer.country)
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
        await self._repo.set_offer_status(offer_id, status)
        return status

    async def _publish(
        self, msg: SourceMessage, offer: ParsedOffer, offer_id: int, product_id: int
    ) -> OfferStatus:
        if offer.price is None:  # decide() never publishes without a price
            return OfferStatus.SKIPPED_NO_PRICE
        photo = await self._get_photo(msg, offer)
        affiliate_url = build_affiliate_url(
            offer.asin, offer.country, self._settings.affiliate_tag
        )
        try:
            chat_id, message_id = await self._publisher.publish(
                format_caption(offer), affiliate_url, photo
            )
        except Exception:
            logger.exception("Failed to publish offer %s (%s)", offer_id, offer.asin)
            return OfferStatus.PUBLISH_FAILED
        await self._repo.insert_publication(
            offer_id,
            product_id,
            offer.country,
            chat_id,
            message_id,
            offer.price,
            affiliate_url,
            self._clock(),
        )
        return OfferStatus.PUBLISHED

    async def _get_photo(self, msg: SourceMessage, offer: ParsedOffer) -> bytes | None:
        try:
            return await self._photo_provider(msg, offer.canonical_url)
        except Exception:
            logger.exception("Photo lookup failed for %s", offer.canonical_url)
            return None
