"""Awin promotions (vouchers) synced into the ``coupons`` table."""

import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import httpx

from patobarato.config import Settings
from patobarato.models import ApiSource, AwinFeedProduct, CouponUpsert
from patobarato.sources.generic_page import parse_price
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.awin_source")

API_BASE = "https://api.awin.com"
PAGE_SIZE = 200
MAX_PAGES = 50  # safety bound against an API that never returns a short page
REGION = "ES"
MAX_FEED_LINES = 200_000  # safety bound against an endless feed
DESCRIPTION_MAX = 500


class AwinFeedError(Exception):
    """The product feed could not be downloaded or reported an error."""


@dataclass
class AwinPromotion:
    promotion_id: str
    advertiser_id: int
    title: str
    description: str | None
    terms: str | None
    code: str | None
    url_tracking: str
    start: datetime | None
    end: datetime | None


def _date(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    # Naive values (e.g. date-only strings) are taken as UTC.
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _promotion(raw: dict[str, Any]) -> AwinPromotion:
    voucher = raw.get("voucher") or {}
    advertiser = raw.get("advertiser") or {}
    return AwinPromotion(
        promotion_id=str(raw.get("promotionId")),
        advertiser_id=int(advertiser.get("id") or 0),
        title=raw.get("title") or "",
        description=raw.get("description") or None,
        terms=raw.get("terms") or None,
        code=voucher.get("code") or None,
        url_tracking=raw.get("urlTracking") or "",
        start=_date(raw.get("startDate")),
        end=_date(raw.get("endDate")),
    )


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


_CURRENCY_SUFFIX = re.compile(r"^\s*(.*?\d)\s*([A-Za-z]{3})\s*$")


def _split_currency(value: Any) -> tuple[Any, str | None]:
    """Split a trailing ISO currency code ("19.99 EUR") off a price string."""
    if isinstance(value, str):
        match = _CURRENCY_SUFFIX.match(value)
        if match:
            return match.group(1), match.group(2).upper()
    return value, None


def _feed_price(value: Any) -> Decimal | None:
    """Strict price parse that tolerates an EUR suffix; other currencies yield None."""
    number, currency = _split_currency(value)
    if currency is not None and currency != "EUR":
        return None
    return parse_price(number)


def _parse_feed_object(raw: dict[str, Any]) -> AwinFeedProduct | None:
    _, currency = _split_currency(raw.get("price"))
    if currency is not None and currency != "EUR":
        logger.debug("Awin feed: dropped product (reason=unsupported_currency)")
        return None
    price = _feed_price(raw.get("price"))
    if price is None:
        logger.debug("Awin feed: dropped product (reason=invalid_price)")
        return None
    url = _text(raw.get("link"))
    if url is None:
        logger.debug("Awin feed: dropped product (reason=no_link)")
        return None
    affiliate_url = _text(raw.get("aw_deep_link"))
    if affiliate_url is None:
        logger.debug("Awin feed: dropped product (reason=no_affiliate_link)")
        return None
    sale_price = _feed_price(raw.get("sale_price"))
    if sale_price is not None and sale_price >= price:
        sale_price = None
    availability = str(raw.get("availability") or "").strip().lower().replace("_", " ")
    # Missing availability defaults to in stock; "preorder" and the like do not count.
    in_stock = True if not availability else availability.startswith("in stock")
    description = _text(raw.get("description"))
    return AwinFeedProduct(
        external_id=str(raw.get("id")),
        title=_text(raw.get("title")) or "",
        description=description[:DESCRIPTION_MAX] if description else None,
        brand=_text(raw.get("brand")),
        gtin=_text(raw.get("gtin")),
        category=_text(raw.get("google_product_category")) or _text(raw.get("product_type")),
        price=price,
        sale_price=sale_price,
        in_stock=in_stock,
        image_url=_text(raw.get("image_link")),
        url=url,
        affiliate_url=affiliate_url,
    )


def _decode_feed_line(line: str) -> dict[str, Any] | None:
    try:
        raw = json.loads(line)
    except ValueError:
        logger.debug("Awin feed: invalid JSON line skipped")
        return None
    return raw if isinstance(raw, dict) else None


def _product_from_dict(raw: dict[str, Any]) -> AwinFeedProduct | None:
    if raw.get("id") in (None, ""):
        logger.debug("Awin feed: dropped line (reason=no_id)")
        return None
    return _parse_feed_object(raw)


def parse_feed_line(line: str) -> AwinFeedProduct | None:
    """Map one JSONL feed line to a product; None when unusable (logged at DEBUG)."""
    raw = _decode_feed_line(line)
    return None if raw is None else _product_from_dict(raw)


class AwinClient:
    def __init__(self, http: httpx.AsyncClient, publisher_id: str, api_token: str) -> None:
        self._http = http
        self._publisher_id = publisher_id
        self._token = api_token

    async def promotions(self, advertiser_ids: list[int]) -> list[AwinPromotion]:
        """Joined ES vouchers of the given advertisers; raises on any HTTP error."""
        url = f"{API_BASE}/publishers/{self._publisher_id}/promotions/"
        result: list[AwinPromotion] = []
        page = 1
        while page <= MAX_PAGES:
            response = await self._http.post(
                url,
                headers={"Authorization": f"Bearer {self._token}"},
                json={
                    "filters": {
                        "advertiserIds": advertiser_ids,
                        "regionCodes": [REGION],
                        "type": "voucher",
                        "membership": "joined",
                    },
                    "pagination": {"page": page, "pageSize": PAGE_SIZE},
                },
            )
            response.raise_for_status()
            items = response.json().get("data") or []
            result.extend(_promotion(item) for item in items)
            if len(items) < PAGE_SIZE:
                return result
            page += 1
        raise RuntimeError(f"Awin promotions: more than {MAX_PAGES} pages; aborting")


    def feed_url(self, advertiser_id: int, locale: str = "es_ES") -> str:
        return (
            f"{API_BASE}/publishers/{self._publisher_id}/awinfeeds/download/"
            f"{advertiser_id}-retail-{locale}.jsonl"
        )

    async def download_feed(self, advertiser_id: int, locale: str = "es_ES") -> AsyncIterator[AwinFeedProduct]:
        """Stream the advertiser's JSONL feed; raises AwinFeedError on HTTP or feed-reported errors."""
        url = self.feed_url(advertiser_id, locale)
        yielded = dropped = lines = 0
        truncated = False
        try:
            async with self._http.stream(
                "GET", url, headers={"Authorization": f"Bearer {self._token}"}
            ) as response:
                if not response.is_success:
                    raise AwinFeedError(f"HTTP {response.status_code}")
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    if lines >= MAX_FEED_LINES:
                        truncated = True
                        logger.warning(
                            "Awin feed of advertiser %s exceeded %d lines; truncated",
                            advertiser_id,
                            MAX_FEED_LINES,
                        )
                        # A partial feed must not look complete: the caller keeps what it read and
                        # skips the out-of-stock marking.
                        raise AwinFeedError("truncated")
                    lines += 1
                    raw = _decode_feed_line(line)
                    if raw is not None and raw.get("id") is None and ("error" in raw or "message" in raw):
                        raise AwinFeedError(str(raw.get("message") or raw.get("error")))
                    product = None if raw is None else _product_from_dict(raw)
                    if product is None:
                        dropped += 1
                        continue
                    yielded += 1
                    yield product
        except httpx.HTTPError as exc:
            # Only the exception type: httpx messages can embed the URL.
            raise AwinFeedError(type(exc).__name__) from None
        finally:
            logger.info(
                "Awin feed of advertiser %s: yielded=%d dropped=%d truncated=%s",
                advertiser_id,
                yielded,
                dropped,
                truncated,
            )


class AwinPromotionsSource:
    type = "awin_promotions"

    def __init__(self, client: AwinClient, repo: Repository, settings: Settings) -> None:
        self._client = client
        self._repo = repo
        self._settings = settings

    async def run(self, source: ApiSource) -> None:
        merchants = source.config.get("merchants") or self._settings.awin_merchants
        store_by_mid = {int(mid): store for store, mid in merchants.items() if mid is not None}
        if not store_by_mid:
            logger.warning("Awin: no merchant ids configured for source %s; nothing to sync", source.id)
            return
        # A failed fetch raises here, before anything is deactivated.
        promotions = await self._client.promotions(list(store_by_mid))
        seen: set[str] = set()
        for promo in promotions:
            store = store_by_mid.get(promo.advertiser_id)
            if store is None:
                logger.debug("Awin: promotion %s of unmapped advertiser skipped", promo.promotion_id)
                continue
            if not promo.code or not promo.url_tracking:
                logger.debug("Awin: promotion %s has no code or link; skipped", promo.promotion_id)
                continue
            await self._repo.upsert_coupon(
                CouponUpsert(
                    source_id=source.id,
                    external_id=promo.promotion_id,
                    store=store,
                    code=promo.code,
                    title=promo.title,
                    conditions=promo.terms or promo.description,
                    url=promo.url_tracking,
                    starts_at=promo.start,
                    expires_at=promo.end,
                )
            )
            seen.add(promo.promotion_id)
        # Reached only after a successful fetch: an empty set means all vouchers expired.
        deactivated = await self._repo.deactivate_coupons_not_in(source.id, seen)
        logger.info("Awin: %d coupons synced, %d deactivated", len(seen), deactivated)
