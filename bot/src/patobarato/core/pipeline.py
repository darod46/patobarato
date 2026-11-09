"""Orchestration: turns parsed offers into stored and published offers."""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Protocol

from patobarato.config import Settings
from patobarato.core.decision import decide
from patobarato.models import OfferStatus, ParsedOffer, PublicationStatus, SourceMessage
from patobarato.parsing.extract import extract_offers
from patobarato.parsing.links import UrlResolver
from patobarato.parsing.title_match import titles_mismatch
from patobarato.publishing.format import format_caption
from patobarato.publishing.telegram_publisher import can_retry_without_photo
from patobarato.storage.repository import Repository
from patobarato.stores.base import Store
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.pipeline")

# Minimum gap between two publications in the channel.
MIN_PUBLISH_INTERVAL_SECONDS = 3.0
# Cap on a store price fetch (offers without a text price): the worker is single.
PRICE_FETCH_TIMEOUT_SECONDS = 5.0
# Stores whose API price is before the coupons a message advertises, and whose API
# "original price" is an inflated list price (never shown as the previous price).
STORES_PRICED_BEFORE_COUPON = frozenset({"aliexpress"})


class DraftError(Exception):
    """A pasted link cannot become a draft; the message is shown to the admin."""


class Publisher(Protocol):
    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]:
        """Publish the offer and return ``(chat_id, message_id)``; raise on failure."""
        ...


# Downloads an image URL into bytes, or None (last-resort post photo).
ImageDownloader = Callable[[str], Awaitable[bytes | None]]


def utcnow() -> datetime:
    return datetime.now(UTC)


@dataclass(frozen=True)
class OfferResult:
    status: OfferStatus
    offer_id: int | None  # None when the offer was already stored (duplicate)
    publication_id: int | None  # set only when the offer was published


class Pipeline:
    """Stores and publishes parsed offers.

    Callers must feed it one offer at a time: that is what guarantees that the
    same offer arriving twice is published only once.
    """

    def __init__(
        self,
        repo: Repository,
        resolver: UrlResolver,
        publisher: Publisher,
        settings: Settings,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        monotonic: Callable[[], float] = time.monotonic,
        publish_interval_seconds: float = MIN_PUBLISH_INTERVAL_SECONDS,
        *,
        registry: StoreRegistry,
        image_downloader: ImageDownloader | None = None,
        price_fetch_timeout_seconds: float = PRICE_FETCH_TIMEOUT_SECONDS,
    ) -> None:
        self._repo = repo
        self._resolver = resolver
        self._publisher = publisher
        self._settings = settings
        self._clock = clock
        self._sleep = sleep
        self._monotonic = monotonic
        self._publish_interval = publish_interval_seconds
        self._registry = registry
        self._image_downloader = image_downloader
        self._price_fetch_timeout = price_fetch_timeout_seconds
        self._last_publish: float | None = None

    async def process_offer(
        self,
        source_id: int,
        external_id: int,
        offer: ParsedOffer,
        raw_text: str,
        detected_at: datetime,
    ) -> OfferResult:
        store_title: str | None = None
        if offer.price is None and not self._is_stale(detected_at):
            offer, store_title = await self._with_store_price(offer)
        product_id = await self._repo.upsert_product(offer)
        offer_id = await self._repo.insert_offer(
            product_id, source_id, external_id, offer, raw_text, detected_at
        )
        if offer_id is None:
            return OfferResult(OfferStatus.SKIPPED_DUPLICATE, None, None)
        if store_title is not None and titles_mismatch(offer.title, store_title):
            # The link points at another product: its price is not this one.
            logger.warning(
                "Title mismatch store=%s product=%s message=%r store=%r — not published",
                offer.store,
                offer.asin,
                offer.title,
                store_title,
            )
            await self._repo.set_offer_status(offer_id, OfferStatus.SKIPPED_MISMATCH)
            return OfferResult(OfferStatus.SKIPPED_MISMATCH, offer_id, None)

        last = await self._repo.get_last_publication(
            product_id, offer.country, channel="telegram"
        )
        status = decide(
            offer.price,
            detected_at,
            last,
            self._clock(),
            timedelta(days=self._settings.republish_after_days),
            timedelta(minutes=self._settings.stale_after_minutes),
        )
        if status == OfferStatus.PUBLISHED:
            status, publication_id = await self._publish(offer, offer_id, product_id)
            if status == OfferStatus.PUBLISHED:
                return OfferResult(status, offer_id, publication_id)  # _publish stored it
        await self._repo.set_offer_status(offer_id, status)
        return OfferResult(status, offer_id, None)

    async def create_draft(self, url: str, job_id: int) -> int:
        """Stores a draft publication for a pasted product link and returns its id.

        Skips the duplicate/worth-it decision and never publishes. Nothing is
        written until the price and the affiliate link are known.
        """
        msg = SourceMessage(
            source_id=await self._repo.manual_source_id(),
            message_id=job_id,
            text=url,
            urls=[url],
            hashtags=[],
            received_at=self._clock(),
        )
        offers = await extract_offers(msg, self._resolver, self._registry)
        if not offers:
            raise DraftError("No reconozco la tienda de ese enlace")
        offer = offers[0]
        if offer.price is None:
            offer, _ = await self._with_store_price(offer)
        price = offer.price
        if price is None:
            raise DraftError("No he encontrado el precio en la tienda")
        store = self._registry.get(offer.store)
        if store is None:  # extract_offers only yields registered stores
            raise DraftError("No reconozco la tienda de ese enlace")
        affiliate_url = await self._affiliate_url(offer, store)
        if affiliate_url is None:
            raise DraftError("No se pudo generar el enlace de afiliado")

        product_id = await self._repo.upsert_product(offer)
        offer_id = await self._repo.insert_offer(
            product_id, msg.source_id, msg.message_id, offer, msg.text, msg.received_at
        )
        if offer_id is None:
            raise DraftError("Este enlace ya se procesó")
        publication_id = await self._repo.insert_publication(
            offer_id,
            product_id,
            offer.country,
            None,
            None,
            price,
            affiliate_url,
            self._clock(),
            price_before_coupon=offer.price_before_coupon,
            status=PublicationStatus.DRAFT,
        )
        await self._repo.set_offer_status(offer_id, OfferStatus.PENDING)
        image_url = offer.image_url or await self._find_image(offer, store)
        if image_url:
            try:
                await self._repo.set_product_image(product_id, image_url)
            except Exception:
                logger.error("Image store failed for %s", offer.asin, exc_info=True)
        return publication_id

    async def _publish(
        self, offer: ParsedOffer, offer_id: int, product_id: int
    ) -> tuple[OfferStatus, int | None]:
        """Publishes the offer; returns its status and the stored publication id."""
        if offer.price is None:  # decide() never publishes without a price
            return OfferStatus.SKIPPED_NO_PRICE, None
        store = self._registry.get(offer.store)
        if store is None:  # extract_offers only yields registered stores
            logger.error("No store %s for offer %s", offer.store, offer_id)
            return OfferStatus.PUBLISH_FAILED, None
        # Never publish without a monetised link: resolve it before any other work.
        affiliate_url = await self._affiliate_url(offer, store)
        if affiliate_url is None:
            logger.warning(
                "affiliate=missing store=%s product=%s — not published", offer.store, offer.asin
            )
            return OfferStatus.SKIPPED_NO_AFFILIATE, None
        photo: bytes | None = None
        # The store's image serves as the post photo (last resort) and as the product image.
        image_url = offer.image_url
        looked_up = image_url is not None
        if photo is None and self._image_downloader is not None:
            if not looked_up:
                image_url, looked_up = await self._find_image(offer, store), True
            if image_url:
                photo = await self._download_photo(image_url)
        await self._wait_publish_slot()
        caption = format_caption(offer, affiliate_url, store.name)
        try:
            try:
                chat_id, message_id = await self._publisher.publish(caption, photo)
            except Exception as exc:
                if photo is None or not can_retry_without_photo(exc):
                    raise
                logger.warning(
                    "Offer %s (%s) rejected with photo (%s: %s); publishing without photo",
                    offer_id,
                    offer.asin,
                    type(exc).__name__,
                    exc,
                )
                chat_id, message_id = await self._publisher.publish(caption, None)
        except Exception:
            logger.exception("Failed to publish offer %s (%s)", offer_id, offer.asin)
            return OfferStatus.PUBLISH_FAILED, None
        finally:
            self._last_publish = self._monotonic()

        # The post is already live: a storage failure must not crash the worker.
        what = f"offer {offer_id} ({offer.asin}) chat_id={chat_id} message_id={message_id}"
        publication_ids: list[int] = []

        async def store_publication() -> None:
            publication_ids.append(
                await self._repo.insert_publication(
                    offer_id,
                    product_id,
                    offer.country,
                    chat_id,
                    message_id,
                    offer.price,
                    affiliate_url,
                    self._clock(),
                    price_before_coupon=offer.price_before_coupon,
                )
            )

        await self._retry_once(
            store_publication,
            f"Mensaje publicado pero no registrado (publications): {what}",
        )
        await self._retry_once(
            lambda: self._repo.set_offer_status(offer_id, OfferStatus.PUBLISHED),
            f"Mensaje publicado pero no registrado (estado de la oferta): {what}",
        )
        if not looked_up:
            image_url = await self._find_image(offer, store)
        if image_url:
            try:
                await self._repo.set_product_image(product_id, image_url)
            except Exception:
                logger.error("Image store failed for %s", offer.asin, exc_info=True)
        return OfferStatus.PUBLISHED, publication_ids[0] if publication_ids else None

    async def _find_image(self, offer: ParsedOffer, store: Store) -> str | None:
        try:
            return await store.find_image(offer.asin, offer.canonical_url)
        except Exception:
            logger.error("Image lookup failed for %s", offer.asin, exc_info=True)
            return None

    async def _download_photo(self, url: str) -> bytes | None:
        assert self._image_downloader is not None
        try:
            return await self._image_downloader(url)
        except Exception as exc:
            logger.warning("Photo download failed for %s: %s: %s", url, type(exc).__name__, exc)
            return None

    def _is_stale(self, detected_at: datetime) -> bool:
        """An offer decide() would skip anyway: no point fetching its price."""
        stale_after = timedelta(minutes=self._settings.stale_after_minutes)
        return self._clock() - detected_at > stale_after

    async def _with_store_price(self, offer: ParsedOffer) -> tuple[ParsedOffer, str | None]:
        """Fills a price the text lacks (channels that put it in the photo) from the store.

        Also returns the store's own product title, when it reports one.
        """
        store = self._registry.get(offer.store)
        if store is None:
            return offer, None
        try:
            quote = await asyncio.wait_for(
                store.fetch_price(offer.asin, offer.canonical_url), self._price_fetch_timeout
            )
        except TimeoutError:
            logger.warning(
                "Store price for %s %s timed out after %ss",
                offer.store,
                offer.asin,
                self._price_fetch_timeout,
            )
            return offer, None
        except Exception as exc:
            logger.warning(
                "Store price for %s %s failed: %s: %s", offer.store, offer.asin, type(exc).__name__, exc
            )
            return offer, None
        if quote is None or quote.price is None:
            return offer, None
        logger.info("Price for %s %s taken from the store: %s", offer.store, offer.asin, quote.price)
        before_coupon = offer.store in STORES_PRICED_BEFORE_COUPON
        previous = offer.previous_price
        if previous is None and not before_coupon:
            previous = quote.previous_price
        offer = replace(
            offer,
            price=quote.price,
            previous_price=previous if previous is not None and previous > quote.price else None,
            image_url=offer.image_url or quote.image_url,
            price_before_coupon=before_coupon,
        )
        return offer, quote.title

    async def _affiliate_url(self, offer: ParsedOffer, store: Store) -> str | None:
        """The offer's monetised link, or None when it has none (never the plain store URL)."""
        url = offer.affiliate_url
        if not url:
            try:
                url = await store.affiliate_url(offer.canonical_url, offer.asin)
            except Exception as exc:
                # No traceback: HTTP errors may carry a signed request URL.
                logger.warning(
                    "affiliate=missing store=%s product=%s (%s: %s)",
                    offer.store,
                    offer.asin,
                    type(exc).__name__,
                    exc,
                )
                return None
        if not url or url in (offer.canonical_url, offer.product_url):
            return None  # a link equal to the product URL earns nothing
        return url

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
