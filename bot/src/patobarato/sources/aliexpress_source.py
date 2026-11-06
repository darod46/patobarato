"""AliExpress hot products as a web-only deal source."""

import dataclasses
import hashlib
import json
import logging
from collections.abc import Callable
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Protocol

from patobarato.config import Settings
from patobarato.core.decision import decide
from patobarato.models import ApiSource, OfferStatus, ParsedOffer
from patobarato.storage.repository import Repository
from patobarato.stores.aliexpress_client import AliProduct

logger = logging.getLogger("patobarato.aliexpress_source")

DEFAULT_MIN_DISCOUNT = 30
DEFAULT_MAX_RESULTS = 20
MAX_PAGE_SIZE = 50  # API limit per page
STORE_ID = "aliexpress"


class _HotProductsClient(Protocol):
    async def hot_products(
        self,
        category_ids: list[str],
        keywords: str | None,
        page_size: int,
        page_no: int,
    ) -> list[AliProduct]: ...


def offer_message_id(product_id: str, day: date) -> int:
    """Stable 63-bit offer key per (product, day): one offer a day, reconsidered daily."""
    digest = hashlib.blake2b(f"{product_id}:{day.isoformat()}".encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big") >> 1


def _discount(product: AliProduct) -> int:
    if product.discount is not None:
        return product.discount
    original, price = product.original_price, product.price
    if original and original > 0 and price is not None:
        return int((original - price) / original * 100)
    return 0


class AliExpressSource:
    type = "aliexpress_api"

    def __init__(
        self,
        client: _HotProductsClient,
        repo: Repository,
        settings: Settings,
        clock: Callable[[], datetime],
    ) -> None:
        self._client = client
        self._repo = repo
        self._settings = settings
        self._clock = clock

    async def run(self, source: ApiSource) -> None:
        cfg = source.config
        max_results = int(cfg.get("max_results", DEFAULT_MAX_RESULTS))
        min_discount = int(cfg.get("min_discount", DEFAULT_MIN_DISCOUNT))
        min_price = _decimal(cfg.get("min_price"))
        max_price = _decimal(cfg.get("max_price"))
        # There is no search endpoint wrapped yet: query='search' reuses hot_products
        # with the configured keywords.
        keywords = cfg.get("keywords") if cfg.get("query", "hot") in ("hot", "search") else None
        products = await self._client.hot_products(
            _category_ids(cfg.get("category_ids")),
            keywords or None,
            min(max(max_results * 3, 20), MAX_PAGE_SIZE),
            1,
        )
        wanted = [
            p
            for p in products
            if _discount(p) >= min_discount
            and (min_price is None or p.price >= min_price)
            and (max_price is None or p.price <= max_price)
        ][:max_results]
        for product in wanted:
            try:
                await self._process(source, product)
            except Exception as e:
                # No traceback: HTTP errors may carry a signed request URL.
                logger.error(
                    "AliExpress product %s failed: %s: %s",
                    product.product_id,
                    type(e).__name__,
                    e,
                )

    async def _process(self, source: ApiSource, product: AliProduct) -> None:
        now = self._clock()
        offer = ParsedOffer(
            asin=product.product_id,
            country=source.country,
            store=STORE_ID,
            title=product.title,
            price=product.price,
            previous_price=product.original_price,
            coupon=None,
            hashtags=[*source.hashtags, "aliexpress"],
            canonical_url=f"https://es.aliexpress.com/item/{product.product_id}.html",
            product_url=product.url,
            image_url=product.image_url,
            affiliate_url=product.promotion_link,
        )
        product_id = await self._repo.upsert_product(offer)
        offer_id = await self._repo.insert_offer(
            product_id,
            source.id,
            offer_message_id(product.product_id, now.date()),
            offer,
            json.dumps(dataclasses.asdict(product), default=str),
            now,
        )
        if offer_id is None:  # already processed today
            logger.debug("AliExpress product %s already processed", product.product_id)
            return
        last = await self._repo.get_last_publication(
            product_id, offer.country, channel=None  # any channel: web and Telegram share dedup here
        )
        status = decide(
            product.price,
            now,
            last,
            now,
            timedelta(days=self._settings.republish_after_days),
            timedelta(minutes=self._settings.stale_after_minutes),
        )
        if status == OfferStatus.PUBLISHED:
            try:
                await self._repo.insert_publication(
                    offer_id,
                    product_id,
                    offer.country,
                    None,
                    None,
                    product.price,
                    product.promotion_link or offer.canonical_url,
                    now,
                    channel="web",
                )
            except Exception:
                await self._repo.set_offer_status(offer_id, OfferStatus.PUBLISH_FAILED)
                raise
            if product.image_url:
                try:
                    await self._repo.set_product_image(product_id, product.image_url)
                except Exception as e:
                    logger.error(
                        "Image update failed for %s: %s: %s",
                        product.product_id,
                        type(e).__name__,
                        e,
                    )
            status = OfferStatus.PUBLISHED_WEB
        await self._repo.set_offer_status(offer_id, status)


def _decimal(value: object) -> Decimal | None:
    return None if value in (None, "") else Decimal(str(value))


def _category_ids(value: object) -> list[str]:
    if not value:
        return []
    if isinstance(value, (str, int)):
        return [str(value)]
    return [str(c) for c in value]  # type: ignore[attr-defined]
