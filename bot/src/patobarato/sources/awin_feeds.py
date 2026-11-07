"""Awin product feeds synced into the ``catalog_products`` table."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime

from patobarato.config import Settings
from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource, CatalogRow
from patobarato.sources.awin_source import AwinClient
from patobarato.storage.repository import Repository
from patobarato.stores.awin import canonical_awin_url

logger = logging.getLogger("patobarato.awin_feeds")


class AwinFeedsSource:
    """Downloads each configured merchant's feed, one at a time (Awin allows 5 requests/minute)."""

    type = "awin_feeds"

    def __init__(
        self,
        client: AwinClient,
        repo: Repository,
        settings: Settings,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        batch_size: int = 500,
        pause_seconds: float = 15.0,
    ) -> None:
        self._client = client
        self._repo = repo
        self._settings = settings
        self._clock = clock
        self._sleep = sleep
        self._batch_size = batch_size
        self._pause_seconds = pause_seconds

    async def run(self, source: ApiSource) -> None:
        merchants = source.config.get("merchants") or self._settings.awin_merchants
        feeds = [(store, int(mid)) for store, mid in merchants.items() if mid is not None]
        if not feeds:
            logger.warning("Awin feeds: no merchant ids configured for source %s; nothing to sync", source.id)
            return
        failed = 0
        for index, (store, advertiser_id) in enumerate(feeds):
            if index:
                await self._sleep(self._pause_seconds)
            if not await self._sync_feed(store, advertiser_id):
                failed += 1
        if failed == len(feeds):
            # Lets the scheduler record sources.last_error; partial failures live in catalog_feeds.
            raise RuntimeError(f"Awin feeds: all {failed} feeds failed")

    async def _sync_feed(self, store: str, advertiser_id: int) -> bool:
        """Syncs one feed; True on success, False when it failed (already logged and recorded)."""
        ran_at = self._clock()
        seen: set[str] = set()
        batch: dict[str, CatalogRow] = {}
        duplicates = 0  # same-batch repeats only (the only duplicates an upsert cannot take)
        try:
            async for product in self._client.download_feed(advertiser_id):
                if product.external_id in batch:
                    # One upsert statement cannot touch the same key twice; the last line wins.
                    duplicates += 1
                seen.add(product.external_id)
                batch[product.external_id] = CatalogRow(
                    store=store,
                    external_id=product.external_id,
                    title=product.title,
                    description=product.description,
                    brand=product.brand,
                    gtin=product.gtin,
                    category=product.category,
                    price=product.price,
                    sale_price=product.sale_price,
                    currency="EUR",
                    in_stock=product.in_stock,
                    image_url=product.image_url,
                    url=canonical_awin_url(product.url),
                    affiliate_url=product.affiliate_url,
                    feed_updated_at=ran_at,
                )
                if len(batch) >= self._batch_size:
                    await self._repo.upsert_catalog_products(list(batch.values()))
                    batch = {}
            if batch:
                await self._repo.upsert_catalog_products(list(batch.values()))
            # Only after a complete feed: a partial one must not hide products.
            out_of_stock = await self._repo.mark_catalog_out_of_stock(store, seen)
            await self._repo.record_feed_run(store, advertiser_id, ran_at, len(seen), None)
        except Exception as e:
            # Message only, no traceback: it could carry the signed feed URL.
            logger.error("Awin feed of %s failed: %s: %s", store, type(e).__name__, e)
            if batch:
                # Products already read are good data: keep them (stock is left untouched).
                try:
                    await self._repo.upsert_catalog_products(list(batch.values()))
                except Exception as flush_error:
                    logger.error(
                        "Could not save the pending products of %s: %s: %s",
                        store,
                        type(flush_error).__name__,
                        flush_error,
                    )
            try:
                await self._repo.record_feed_run(
                    store, advertiser_id, ran_at, len(seen), f"{type(e).__name__}: {e}"
                )
            except Exception as record_error:
                logger.error(
                    "Could not record the feed error of %s: %s: %s",
                    store,
                    type(record_error).__name__,
                    record_error,
                )
            return False
        if not seen:
            logger.warning("Awin feed of %s was empty; nothing marked out of stock", store)
        logger.info(
            "Awin feed of %s: products=%d dropped=%d out_of_stock=%d",
            store,
            len(seen),
            duplicates,
            out_of_stock,
        )
        return True
