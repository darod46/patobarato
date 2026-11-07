"""Refreshes the prices of the products listed in published buying guides."""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta

from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource, CatalogRow, GuideProduct, ParsedOffer
from patobarato.storage.repository import Repository
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.guide_prices")

COUNTRY = "ES"
DEFAULT_DELAY_SECONDS = 1.5
CATALOG_FRESH_HOURS = 36
_URL = re.compile(r"https?://\S+")


class GuidePriceRefresher:
    type = "guide_prices"

    def __init__(
        self,
        registry: StoreRegistry,
        repo: Repository,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        delay_seconds: float = DEFAULT_DELAY_SECONDS,
    ) -> None:
        self._registry = registry
        self._repo = repo
        self._clock = clock
        self._sleep = sleep
        self._delay = delay_seconds
        self._imageless: set[int] = set()
        self._network = False

    async def run(self, source: ApiSource) -> None:
        products = await self._repo.list_guide_products()
        # Images already stored (Telegram, backfill) are never overwritten.
        self._imageless = {row[0] for row in await self._repo.get_products_without_image()}
        updated = failed = skipped = from_catalog = 0
        fetched_before = False
        for product in products:
            self._network = False
            if fetched_before:
                await self._sleep(self._delay)
            try:
                outcome = await self._refresh(product)
            except Exception as e:
                # No traceback: HTTP errors may carry a request URL.
                logger.error(
                    "GuidePrices: %s %s failed: %s: %s",
                    product.store,
                    product.external_id,
                    type(e).__name__,
                    _URL.sub("<url>", str(e)),
                )
                outcome = "failed"
            fetched_before = self._network
            if outcome == "catalog":
                updated += 1
                from_catalog += 1
            elif outcome == "updated":
                updated += 1
            elif outcome == "skipped":
                skipped += 1
            else:
                failed += 1
        logger.info(
            "GuidePrices: %d products, %d updated (%d from_catalog), %d failed, %d skipped",
            len(products),
            updated,
            from_catalog,
            failed,
            skipped,
        )

    async def _refresh(self, product: GuideProduct) -> str:
        now = self._clock()
        store = self._registry.get(product.store)
        if store is None:
            product_id = await self._repo.find_product_id(
                product.store, COUNTRY, product.external_id
            )
            if product_id is None:
                logger.debug("GuidePrices: store %s not enabled, skipped", product.store)
                return "skipped"
            await self._repo.upsert_product_price(
                product_id, checked_at=now, error="store_disabled"
            )
            return "failed"
        canonical = store.canonical_for(product.url, COUNTRY)
        # An existing product keeps its title and url; only new ones take the guide name.
        product_id = await self._repo.find_product_id(
            product.store, COUNTRY, product.external_id
        )
        created = product_id is None
        if product_id is None:
            product_id = await self._repo.upsert_product(
                ParsedOffer(
                    asin=product.external_id,
                    country=COUNTRY,
                    store=product.store,
                    title=product.name,
                    price=None,
                    previous_price=None,
                    coupon=None,
                    hashtags=[],
                    canonical_url=canonical,
                    product_url=product.url,
                )
            )
        row = await self._repo.find_catalog_product(product.store, canonical)
        if row is not None and self._is_fresh(row, now):
            await self._repo.upsert_product_price(
                product_id,
                checked_at=now,
                price=row.sale_price or row.price,
                previous_price=row.price if row.sale_price else None,
                currency=row.currency,
                affiliate_url=row.affiliate_url,
                error=None,
            )
            if row.image_url and (created or product_id in self._imageless):
                await self._repo.set_product_image(product_id, row.image_url)
            return "catalog"
        self._network = True
        quote = await store.fetch_price(product.external_id, canonical)
        if quote is None:
            await self._repo.upsert_product_price(product_id, checked_at=now, error="no price")
            return "failed"
        try:
            affiliate = await store.affiliate_url(canonical, product.external_id)
        except Exception as e:
            affiliate = None
            logger.warning(
                "GuidePrices: %s %s affiliate=missing (%s: %s)",
                product.store,
                product.external_id,
                type(e).__name__,
                _URL.sub("<url>", str(e)),
            )
        await self._repo.upsert_product_price(
            product_id,
            checked_at=now,
            price=quote.price,
            previous_price=quote.previous_price,
            currency=quote.currency,
            affiliate_url=affiliate,
        )
        if quote.image_url and (created or product_id in self._imageless):
            await self._repo.set_product_image(product_id, quote.image_url)
        return "updated"

    @staticmethod
    def _is_fresh(row: CatalogRow, now: datetime) -> bool:
        if row.updated_at is None:
            return False
        return now - row.updated_at < timedelta(hours=CATALOG_FRESH_HOURS)
