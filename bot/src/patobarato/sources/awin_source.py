"""Awin promotions (vouchers) synced into the ``coupons`` table."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx

from patobarato.config import Settings
from patobarato.models import ApiSource, CouponUpsert
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.awin_source")

API_BASE = "https://api.awin.com"
PAGE_SIZE = 200
MAX_PAGES = 50  # safety bound against an API that never returns a short page
REGION = "ES"


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
