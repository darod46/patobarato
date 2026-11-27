"""AliExpress hot products as a web-only deal source."""

import dataclasses
import hashlib
import json
import logging
import re
from collections.abc import Callable
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Protocol

from patobarato.config import Settings
from patobarato.core.decision import decide
from patobarato.models import ApiSource, CouponUpsert, OfferStatus, ParsedOffer
from patobarato.storage.repository import Repository
from patobarato.stores.aliexpress_client import AliExpressError, AliProduct, AliPromoCode

logger = logging.getLogger("patobarato.aliexpress_source")

DEFAULT_MIN_DISCOUNT = 30
DEFAULT_MAX_RESULTS = 20
MAX_PAGE_SIZE = 50  # API limit per page
STORE_ID = "aliexpress"
# A code with no end date stays on the web this long after the last time the API showed it.
UNDATED_COUPON_DAYS = 3


class _HotProductsClient(Protocol):
    async def hot_products(
        self,
        category_ids: list[str],
        keywords: str | None,
        page_size: int,
        page_no: int,
    ) -> list[AliProduct]: ...

    async def product_query(
        self,
        keywords: str | None,
        category_ids: list[str],
        page_size: int,
        page_no: int,
        sort: str = "LAST_VOLUME_DESC",
    ) -> list[AliProduct]: ...

    async def link_generate(self, url: str) -> str: ...


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
        keywords = cfg.get("keywords") or None
        category_ids = _category_ids(cfg.get("category_ids"))
        page_size = min(max(max_results * 3, 20), MAX_PAGE_SIZE)
        query = cfg.get("query", "hot")
        if query == "search":
            if not keywords and not category_ids:
                logger.warning(
                    "AliExpress source %s: query=search needs keywords or category_ids",
                    source.id,
                )
                return
            products = await self._client.product_query(keywords, category_ids, page_size, 1)
        else:
            try:
                products = await self._client.hot_products(category_ids, keywords, page_size, 1)
            except AliExpressError as e:
                if e.code != "InsufficientPermission":
                    raise
                if not keywords and not category_ids:
                    logger.error(
                        "AliExpress source %s: hotproduct.query not permitted for this app; "
                        "set keywords or category_ids in config (or request the hotproduct "
                        "permission)",
                        source.id,
                    )
                    return
                logger.warning(
                    "AliExpress source %s: hotproduct.query not permitted for this app; "
                    "falling back to product.query",
                    source.id,
                )
                products = await self._client.product_query(keywords, category_ids, page_size, 1)
        wanted = [
            p
            for p in products
            if _discount(p) >= min_discount
            and (min_price is None or p.price >= min_price)
            and (max_price is None or p.price <= max_price)
        ][:max_results]
        with_code = sum(1 for p in products if p.promo_code is not None)
        logger.info(
            "AliExpress source %s: %d products, %d with promo code", source.id, len(products), with_code
        )
        await self._sync_coupons(source, products)
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
            # The API's original_price is often an inflated list price (a fake -50 %):
            # it only filters by discount above, never shown as the previous price.
            previous_price=None,
            coupon=promo.code if (promo := _usable(product.promo_code, now)) else None,
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
            affiliate = product.promotion_link or await self._generate_link(offer)
            if not affiliate:
                logger.warning(
                    "affiliate=missing store=%s product=%s — not published",
                    STORE_ID,
                    product.product_id,
                )
                await self._repo.set_offer_status(offer_id, OfferStatus.SKIPPED_NO_AFFILIATE)
                return
            try:
                await self._repo.insert_publication(
                    offer_id,
                    product_id,
                    offer.country,
                    None,
                    None,
                    product.price,
                    affiliate,
                    now,
                    channel="web",
                    # The API sale price is before any coupon AliExpress offers.
                    price_before_coupon=True,
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

    async def _sync_coupons(self, source: ApiSource, products: list[AliProduct]) -> None:
        """Stores every usable promo code the API returned (not only the published products')."""
        now = self._clock()
        for product in products:
            coupon = aliexpress_coupon(source.id, product, now)
            if coupon is None:
                continue
            try:
                await self._repo.upsert_coupon(coupon)
            except Exception as e:
                logger.error("AliExpress coupon %s failed: %s: %s", coupon.code, type(e).__name__, e)

    async def _generate_link(self, offer: ParsedOffer) -> str | None:
        try:
            return await self._client.link_generate(offer.canonical_url)
        except Exception as e:
            # No traceback: HTTP errors may carry a signed request URL.
            logger.warning(
                "AliExpress link_generate for %s failed: %s: %s", offer.asin, type(e).__name__, e
            )
            return None


def _decimal(value: object) -> Decimal | None:
    return None if value in (None, "") else Decimal(str(value))


def _category_ids(value: object) -> list[str]:
    if not value:
        return []
    if isinstance(value, (str, int)):
        return [str(value)]
    return [str(c) for c in value]  # type: ignore[attr-defined]


def _usable(promo: AliPromoCode | None, now: datetime) -> AliPromoCode | None:
    """The code if it can still be used: not run out, not expired."""
    if promo is None or promo.quantity == 0:
        return None
    if promo.ends_at is not None and promo.ends_at <= now:
        return None
    return promo


_AMOUNT_RE = re.compile(r"get\s*(?:EUR|€)\s*([\d.,]+)\s*off|get\s*([\d.,]+)\s*(?:EUR|€)\s*off", re.IGNORECASE)
_PCT_RE = re.compile(r"([\d.,]+)\s*%")


def _number(text: str) -> Decimal | None:
    try:
        return Decimal(text.replace(",", "."))
    except Exception:
        return None


def _euros(value: Decimal) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text.replace(".", ",")


def coupon_values(promo: AliPromoCode) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    """``(discount_amount, discount_pct, min_purchase)`` in euros, or all None when the code's text is in
    another currency (USD) or says nothing we can read."""
    text = promo.value_text or ""
    if re.search(r"USD|US\$|\$", text):
        return None, None, None
    amount = pct = None
    if promo.campaign_type == "2" or "%" in text:
        match = _PCT_RE.search(text)
        pct = _number(match.group(1)) if match else None
    else:
        match = _AMOUNT_RE.search(text)
        amount = _number(match.group(1) or match.group(2)) if match else None
    if amount is None and pct is None:
        return None, None, None
    minimum = promo.min_spend if promo.min_spend and promo.min_spend > 1 else None
    return amount, pct, minimum


def aliexpress_coupon(source_id: int, product: AliProduct, now: datetime) -> CouponUpsert | None:
    """The product's promo code as a coupon of the web, or None when there is none or it is used up."""
    promo = _usable(product.promo_code, now)
    link = (promo.url if promo else None) or product.promotion_link
    if promo is None or not link:
        return None
    amount, pct, minimum = coupon_values(promo)
    if amount is not None:
        title = f"−{_euros(amount)} €" + (f" en pedidos desde {_euros(minimum)} €" if minimum else "")
    elif pct is not None:
        title = f"−{_euros(pct)} %" + (f" en pedidos desde {_euros(minimum)} €" if minimum else "")
    else:
        title = promo.value_text or "Cupón de AliExpress"
    name = product.title if len(product.title) <= 90 else product.title[:89].rstrip() + "…"
    return CouponUpsert(
        source_id=source_id,
        external_id=promo.code,
        store=STORE_ID,
        code=promo.code,
        title=title,
        conditions=f"Para «{name}».",
        url=link,
        starts_at=promo.starts_at,
        expires_at=promo.ends_at or now + timedelta(days=UNDATED_COUPON_DAYS),
        discount_amount=amount,
        discount_pct=pct,
        min_purchase=minimum,
    )
