import asyncio
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from postgrest.exceptions import APIError
from supabase import Client

from patobarato.models import (
    AdminJob,
    ApiSource,
    CatalogRow,
    CouponUpsert,
    DealToCheck,
    EventPromoRow,
    EventRef,
    GuideProduct,
    GuideToAnnounce,
    LastPublication,
    OfferStatus,
    ParsedOffer,
    PostData,
    ProductToEnrich,
    PublicationChannel,
    PublicationStatus,
    Source,
)
from patobarato.storage.repository import clean_hashtags

UNIQUE_VIOLATION = "23505"
CATALOG_PAGE = 1000
CATALOG_UPDATE_CHUNK = 500  # ids travel in the URL of the update request

logger = logging.getLogger("patobarato.supabase_repo")


def _parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


class SupabaseRepository:
    def __init__(self, client: Client) -> None:
        self._client = client
        self._manual_source_id: int | None = None

    async def sync_sources(self, channels: dict[str, str], country: str) -> list[Source]:
        if not channels:
            return []
        rows = [
            {"identifier": identifier, "name": name, "country": country}
            for identifier, name in channels.items()
        ]

        def run():
            self._client.table("sources").upsert(
                rows, on_conflict="type,identifier", ignore_duplicates=True
            ).execute()
            return (
                self._client.table("sources")
                .select("id, identifier, country")
                .in_("identifier", list(channels))
                .eq("active", True)
                .order("id")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            Source(id=row["id"], identifier=row["identifier"], country=row["country"])
            for row in response.data
        ]

    async def upsert_product(self, offer: ParsedOffer) -> int:
        row = {
            "store": offer.store,
            "country": offer.country,
            "asin": offer.asin,
            "title": offer.title,
            "url": offer.product_url,
            "updated_at": datetime.now(UTC).isoformat(),
        }

        def run():
            return (
                self._client.table("products")
                .upsert(row, on_conflict="store,country,asin")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return response.data[0]["id"]

    async def find_product_id(self, store: str, country: str, asin: str) -> int | None:
        def run():
            return (
                self._client.table("products")
                .select("id")
                .eq("store", store)
                .eq("country", country)
                .eq("asin", asin)
                .limit(1)
                .execute()
            )

        response = await asyncio.to_thread(run)
        return response.data[0]["id"] if response.data else None

    async def insert_offer(
        self,
        product_id: int,
        source_id: int,
        source_message_id: int,
        offer: ParsedOffer,
        raw_text: str,
        detected_at: datetime,
    ) -> int | None:
        row = {
            "product_id": product_id,
            "source_id": source_id,
            "source_message_id": source_message_id,
            "country": offer.country,
            "price": _money(offer.price),
            "previous_price": _money(offer.previous_price),
            "currency": "EUR",
            "coupon": offer.coupon,
            "hashtags": clean_hashtags(offer.hashtags),
            "raw_text": raw_text,
            "status": OfferStatus.PENDING.value,
            "detected_at": detected_at.isoformat(),
        }

        def run():
            return self._client.table("offers").insert(row).execute()

        try:
            response = await asyncio.to_thread(run)
        except APIError as error:
            if error.code == UNIQUE_VIOLATION:
                return None
            raise
        return response.data[0]["id"]

    async def set_offer_status(self, offer_id: int, status: OfferStatus) -> None:
        def run():
            return (
                self._client.table("offers")
                .update({"status": status.value})
                .eq("id", offer_id)
                .execute()
            )

        await asyncio.to_thread(run)

    async def set_product_image(self, product_id: int, image_url: str) -> None:
        def run():
            return (
                self._client.table("products")
                .update(
                    {
                        "image_url": image_url,
                        "updated_at": datetime.now(UTC).isoformat(),
                    }
                )
                .eq("id", product_id)
                .execute()
            )

        await asyncio.to_thread(run)

    async def get_products_without_image(self) -> list[tuple[int, str, str, str, str]]:
        def run():
            return (
                self._client.table("products")
                .select("id, asin, country, store, url")
                .is_("image_url", "null")
                .order("id")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            (row["id"], row["asin"], row["country"], row["store"], row.get("url") or "")
            for row in response.data
        ]

    async def get_last_publication(
        self, product_id: int, country: str, channel: PublicationChannel | None = None
    ) -> LastPublication | None:
        def run():
            query = (
                self._client.table("publications")
                .select("published_price::text, published_at, status")
                .eq("product_id", product_id)
                .eq("country", country)
                .neq("status", PublicationStatus.DRAFT.value)
            )
            if channel is not None:
                query = query.eq("channel", channel)
            return query.order("published_at", desc=True).limit(1).execute()

        response = await asyncio.to_thread(run)
        if not response.data:
            return None
        row = response.data[0]
        return LastPublication(
            published_price=Decimal(row["published_price"]),
            published_at=_parse_timestamp(row["published_at"]),
            status=PublicationStatus(row["status"]),
        )

    async def insert_publication(
        self,
        offer_id: int,
        product_id: int,
        country: str,
        chat_id: int | None,
        message_id: int | None,
        published_price: Decimal,
        affiliate_url: str,
        published_at: datetime,
        channel: PublicationChannel = "telegram",
        price_before_coupon: bool = False,
        status: PublicationStatus = PublicationStatus.ACTIVE,
    ) -> int:
        row = {
            "offer_id": offer_id,
            "product_id": product_id,
            "country": country,
            "channel": channel,
            "published_price": str(published_price),
            "affiliate_url": affiliate_url,
            "status": status.value,
            "published_at": published_at.isoformat(),
        }
        if chat_id is not None:
            row["chat_id"] = chat_id
        if message_id is not None:
            row["message_id"] = message_id
        if price_before_coupon:  # the column defaults to false
            row["price_before_coupon"] = True

        def run():
            return self._client.table("publications").insert(row).execute()

        response = await asyncio.to_thread(run)
        return response.data[0]["id"]

    async def get_post(self, publication_id: int) -> PostData | None:
        def run():
            return (
                self._client.table("publications")
                .select(
                    "id, offer_id, product_id, status, chat_id, message_id, country, published_at, "
                    "published_price::text, price_before_coupon, affiliate_url, "
                    "offers(previous_price::text, coupon, hashtags), "
                    "products(title, store, image_url, asin, slug)"
                )
                .eq("id", publication_id)
                .limit(1)
                .execute()
            )

        response = await asyncio.to_thread(run)
        if not response.data:
            return None
        row = response.data[0]
        offer, product = row["offers"], row["products"]
        previous = offer["previous_price"]
        return PostData(
            publication_id=row["id"],
            offer_id=row["offer_id"],
            product_id=row["product_id"],
            status=PublicationStatus(row["status"]),
            chat_id=row["chat_id"],
            message_id=row["message_id"],
            title=product["title"],
            price=Decimal(row["published_price"]),
            previous_price=Decimal(previous) if previous is not None else None,
            coupon=offer["coupon"],
            hashtags=offer["hashtags"] or [],
            price_before_coupon=bool(row["price_before_coupon"]),
            affiliate_url=row["affiliate_url"],
            store=product["store"],
            country=row["country"],
            image_url=product["image_url"],
            published_at=_parse_timestamp(row["published_at"]) if row.get("published_at") else None,
            asin=product.get("asin") or "",
            slug=product.get("slug"),
        )

    async def get_product_slug(self, product_id: int) -> str | None:
        def run():
            return (
                self._client.table("products").select("slug").eq("id", product_id).limit(1).execute()
            )

        response = await asyncio.to_thread(run)
        return response.data[0]["slug"] if response.data else None

    async def delete_publication(self, publication_id: int) -> None:
        def run():
            return self._client.table("publications").delete().eq("id", publication_id).execute()

        await asyncio.to_thread(run)

    async def mark_post_published(
        self, publication_id: int, chat_id: int, message_id: int, published_at: datetime
    ) -> None:
        def run():
            updated = (
                self._client.table("publications")
                .update(
                    {
                        "channel": "telegram",
                        "chat_id": chat_id,
                        "message_id": message_id,
                        "published_at": published_at.isoformat(),
                        "status": PublicationStatus.ACTIVE.value,
                    }
                )
                .eq("id", publication_id)
                .execute()
            )
            for row in updated.data:
                self._client.table("offers").update(
                    {"status": OfferStatus.PUBLISHED.value}
                ).eq("id", row["offer_id"]).execute()

        await asyncio.to_thread(run)

    async def manual_source_id(self) -> int:
        if self._manual_source_id is None:

            def run():
                return (
                    self._client.table("sources")
                    .select("id")
                    .eq("type", "manual")
                    .eq("identifier", "admin")
                    .limit(1)
                    .execute()
                )

            response = await asyncio.to_thread(run)
            if not response.data:
                raise RuntimeError(
                    "No manual source (type='manual', identifier='admin') in sources; "
                    "apply the admin migration"
                )
            self._manual_source_id = response.data[0]["id"]
        return self._manual_source_id

    async def claim_jobs(self, limit: int) -> list[AdminJob]:
        def run():
            pending = (
                self._client.table("admin_jobs")
                .select("id")
                .eq("status", "pending")
                .order("id")
                .limit(limit)
                .execute()
            )
            claimed = []
            for row in pending.data:
                updated = (
                    self._client.table("admin_jobs")
                    .update({"status": "running"})
                    .eq("id", row["id"])
                    .eq("status", "pending")
                    .execute()
                )
                claimed.extend(updated.data)
            return claimed

        rows = await asyncio.to_thread(run)
        return [AdminJob(id=r["id"], type=r["type"], payload=r["payload"] or {}) for r in rows]

    async def finish_job(
        self, job_id: int, *, result: dict | None = None, error: str | None = None
    ) -> None:
        def run():
            return (
                self._client.table("admin_jobs")
                .update(
                    {
                        "status": "done" if error is None else "error",
                        "result": result,
                        "error": error,
                    }
                )
                .eq("id", job_id)
                .execute()
            )

        await asyncio.to_thread(run)

    async def fail_running_jobs(self, error: str) -> int:
        def run():
            return (
                self._client.table("admin_jobs")
                .update({"status": "error", "error": error})
                .eq("status", "running")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return len(response.data)

    async def add_admin_user(self, user_id: str, email: str) -> None:
        def run():
            return (
                self._client.table("admin_users")
                .upsert(
                    {"user_id": user_id, "email": email, "is_owner": False},
                    on_conflict="user_id",
                )
                .execute()
            )

        await asyncio.to_thread(run)

    async def owner_ids(self) -> list[str]:
        def run():
            return (
                self._client.table("admin_users")
                .select("user_id")
                .eq("is_owner", True)
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [r["user_id"] for r in response.data]

    async def list_api_sources(self) -> list[ApiSource]:
        def run():
            return (
                self._client.table("sources")
                .select(
                    "id, type, identifier, country, config, every_minutes, "
                    "hashtags, last_run_at"
                )
                .eq("active", True)
                .neq("type", "telegram_channel")
                .order("id")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            ApiSource(
                id=row["id"],
                type=row["type"],
                identifier=row["identifier"],
                country=row["country"],
                config=row["config"] or {},
                every_minutes=row["every_minutes"],
                hashtags=row["hashtags"] or [],
                last_run_at=(
                    _parse_timestamp(row["last_run_at"]) if row["last_run_at"] else None
                ),
            )
            for row in response.data
        ]

    async def mark_source_run(
        self, source_id: int, ran_at: datetime, error: str | None
    ) -> None:
        def run():
            return (
                self._client.table("sources")
                .update({"last_run_at": ran_at.isoformat(), "last_error": error})
                .eq("id", source_id)
                .execute()
            )

        await asyncio.to_thread(run)

    async def upsert_coupon(self, c: CouponUpsert) -> int:
        row = {
            "store": c.store,
            "code": c.code,
            "title": c.title,
            "conditions": c.conditions,
            "url": c.url,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "active": True,
        }
        if c.starts_at is not None:  # otherwise the column default (now()) applies
            row["starts_at"] = c.starts_at.isoformat()

        def run() -> int:
            # Select-then-write: PostgREST on_conflict cannot target the partial unique index.
            existing = (
                self._client.table("coupons")
                .select("id")
                .eq("source_id", c.source_id)
                .eq("external_id", c.external_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                coupon_id = existing.data[0]["id"]
                self._client.table("coupons").update(row).eq("id", coupon_id).execute()
                return coupon_id
            inserted = (
                self._client.table("coupons")
                .insert({**row, "source_id": c.source_id, "external_id": c.external_id})
                .execute()
            )
            return inserted.data[0]["id"]

        return await asyncio.to_thread(run)

    async def deactivate_coupons_not_in(
        self, source_id: int, external_ids: set[str]
    ) -> int:
        """Deactivates the source's coupons missing from ``external_ids``; returns how many.

        An EMPTY ``external_ids`` deactivates every active coupon of the source, so
        never call it after a FAILED fetch (an empty but successful fetch is fine:
        it means everything expired).
        """

        def run():
            query = (
                self._client.table("coupons")
                .update({"active": False})
                .eq("source_id", source_id)
                .eq("active", True)
            )
            if external_ids:
                query = query.not_.in_("external_id", sorted(external_ids))
            return query.execute()

        response = await asyncio.to_thread(run)
        return len(response.data)

    async def list_guide_products(self) -> list[GuideProduct]:
        def run():
            return (
                self._client.table("guide_item_stores")
                .select(
                    "store, external_id, url, guide_items!inner(name, image_url, guides!inner(status, published_at))"
                )
                .eq("guide_items.guides.status", "published")
                .order("store")
                .order("external_id")
                .order("guide_item_id")
                .execute()
            )

        from patobarato.core import pipeline  # lazy: pipeline imports the repository module

        response = await asyncio.to_thread(run)
        horizon = pipeline.utcnow() + timedelta(days=7)
        unique: dict[tuple[str, str], GuideProduct] = {}
        for row in response.data:
            item = row["guide_items"]
            raw_published_at = (item.get("guides") or {}).get("published_at")
            if raw_published_at:
                published_at = datetime.fromisoformat(raw_published_at.replace("Z", "+00:00"))
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=UTC)
                if published_at > horizon:
                    continue
            unique.setdefault(
                (row["store"], row["external_id"]),
                GuideProduct(
                    store=row["store"],
                    external_id=row["external_id"],
                    url=row["url"],
                    name=item["name"],
                    image_url=item.get("image_url"),
                ),
            )
        return [unique[key] for key in sorted(unique)]

    async def upsert_product_price(
        self,
        product_id: int,
        *,
        checked_at: datetime,
        price: Decimal | None = None,
        previous_price: Decimal | None = None,
        currency: str = "EUR",
        error: str | None = None,
        affiliate_url: str | None = None,
    ) -> None:
        def run():
            if error is not None:
                # Only these columns: the upsert merge leaves the stored price untouched.
                row = {
                    "product_id": product_id,
                    "checked_at": checked_at.isoformat(),
                    "error": error,
                }
                if affiliate_url is not None:
                    row["affiliate_url"] = affiliate_url
                return (
                    self._client.table("product_prices")
                    .upsert(row, on_conflict="product_id")
                    .execute()
                )
            row = {
                "product_id": product_id,
                "price": _money(price),
                "previous_price": _money(previous_price),
                "currency": currency,
                "checked_at": checked_at.isoformat(),
                "error": None,
                "affiliate_url": affiliate_url,
            }
            return (
                self._client.table("product_prices")
                .upsert(row, on_conflict="product_id")
                .execute()
            )

        await asyncio.to_thread(run)

    async def upsert_catalog_products(self, rows: list[CatalogRow]) -> None:
        if not rows:
            return
        now = datetime.now(UTC).isoformat()
        payload = [
            {
                "store": r.store,
                "external_id": r.external_id,
                "title": r.title,
                "description": r.description,
                "brand": r.brand,
                "gtin": r.gtin,
                "category": r.category,
                "price": _money(r.price),
                "sale_price": _money(r.sale_price),
                "currency": r.currency,
                "in_stock": r.in_stock,
                "image_url": r.image_url,
                "url": r.url,
                "affiliate_url": r.affiliate_url,
                "feed_updated_at": r.feed_updated_at.isoformat() if r.feed_updated_at else None,
                "updated_at": now,
            }
            for r in rows
        ]

        def run():
            self._client.table("catalog_products").upsert(
                payload, on_conflict="store,external_id"
            ).execute()

        await asyncio.to_thread(run)

    async def list_events_with_promo(self) -> list[EventRef]:
        def run():
            return (
                self._client.table("events")
                .select("id, slug, aliexpress_promo")
                .not_.is_("aliexpress_promo", "null")
                .neq("aliexpress_promo", "")
                .order("id")
                .execute()
            )

        result = await asyncio.to_thread(run)
        return [
            EventRef(r["id"], r["slug"], r["aliexpress_promo"]) for r in result.data or []
        ]

    async def replace_event_promos(self, event_id: int, rows: list[EventPromoRow]) -> None:
        synced_at = datetime.now(UTC).isoformat()
        payload = [
            {
                "event_id": event_id,
                "external_id": r.external_id,
                "title": r.title,
                "price": _money(r.price),
                "original_price": _money(r.original_price),
                "currency": r.currency,
                "image_url": r.image_url,
                "affiliate_url": r.affiliate_url,
                "position": r.position,
                "synced_at": synced_at,
            }
            for r in rows
        ]

        def run():
            self._client.table("event_promos").delete().eq("event_id", event_id).execute()
            if payload:
                self._client.table("event_promos").insert(payload).execute()

        await asyncio.to_thread(run)

    async def mark_catalog_out_of_stock(self, store: str, seen_ids: set[str]) -> int:
        if not seen_ids:
            logger.warning("Catalog: empty feed for %s; nothing marked out of stock", store)
            return 0

        def run() -> int:
            in_stock: list[str] = []
            start = 0
            while True:
                page = (
                    self._client.table("catalog_products")
                    .select("external_id")
                    .eq("store", store)
                    .eq("in_stock", True)
                    .order("external_id")
                    .range(start, start + CATALOG_PAGE - 1)
                    .execute()
                    .data
                )
                in_stock.extend(row["external_id"] for row in page)
                if len(page) < CATALOG_PAGE:
                    break
                start += CATALOG_PAGE
            missing = sorted(set(in_stock) - seen_ids)
            updated = 0
            for i in range(0, len(missing), CATALOG_UPDATE_CHUNK):
                chunk = missing[i : i + CATALOG_UPDATE_CHUNK]
                response = (
                    self._client.table("catalog_products")
                    .update({"in_stock": False})
                    .eq("store", store)
                    .in_("external_id", chunk)
                    .execute()
                )
                updated += len(response.data)
            return updated

        return await asyncio.to_thread(run)

    async def record_feed_run(
        self,
        store: str,
        advertiser_id: int,
        ran_at: datetime,
        products: int,
        error: str | None,
    ) -> None:
        def run():
            self._client.table("catalog_feeds").upsert(
                {
                    "store": store,
                    "advertiser_id": advertiser_id,
                    "last_run_at": ran_at.isoformat(),
                    "products": products,
                    "last_error": error,
                },
                on_conflict="store,advertiser_id",
            ).execute()

        await asyncio.to_thread(run)

    async def products_to_enrich(self, limit: int) -> list[ProductToEnrich]:
        def run():
            return (
                self._client.table("products")
                .select("id, title, enrich_attempts, publications!inner(id)")
                .is_("description", "null")
                .eq("description_manual", False)
                .lt("enrich_attempts", 3)
                .neq("publications.status", "draft")
                .order("id", desc=True)
                .limit(limit)
                .limit(1, foreign_table="publications")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            ProductToEnrich(r["id"], r["title"] or "", r["enrich_attempts"] or 0)
            for r in response.data or []
        ]

    async def save_product_text(
        self,
        product_id: int,
        description: str,
        category: str,
        at: datetime,
        short_title: str | None = None,
    ) -> None:
        row = {"description": description, "category": category, "enriched_at": at.isoformat()}
        if short_title:
            row["short_title"] = short_title

        def run():
            self._client.table("products").update(row).eq("id", product_id).eq(
                "description_manual", False
            ).execute()

        await asyncio.to_thread(run)

    async def record_enrich_failure(self, product_id: int, attempts: int) -> None:
        def run():
            self._client.table("products").update({"enrich_attempts": attempts}).eq(
                "id", product_id
            ).execute()

        await asyncio.to_thread(run)

    async def upsert_channel_stats(self, members: int, checked_at: datetime) -> None:
        def run():
            self._client.table("channel_stats").upsert(
                {"id": 1, "members": members, "checked_at": checked_at.isoformat()}
            ).execute()

        await asyncio.to_thread(run)

    async def list_deals_to_check(
        self, now: datetime, max_age_days: int, recheck_hours: int, limit: int
    ) -> list[DealToCheck]:
        oldest = (now - timedelta(days=max_age_days)).isoformat()
        recheck_before = (now - timedelta(hours=recheck_hours)).isoformat()

        def run():
            return (
                self._client.table("publications")
                .select(
                    "id, product_id, published_price::text, "
                    "offers!inner(coupon), products!inner(asin, url, store)"
                )
                .eq("status", "active")
                .eq("channel", "telegram")
                .eq("products.store", "amazon")
                .is_("offers.coupon", "null")
                .gt("published_at", oldest)
                .or_(f"checked_at.is.null,checked_at.lt.{recheck_before}")
                .order("checked_at", desc=False, nullsfirst=True)
                .order("published_at", desc=True)
                .limit(limit)
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            DealToCheck(
                publication_id=row["id"],
                product_id=row["product_id"],
                asin=row["products"]["asin"],
                url=row["products"]["url"] or "",
                published_price=Decimal(row["published_price"]),
            )
            for row in response.data
        ]

    async def list_stale_deals(self, now: datetime, max_age_days: int) -> list[int]:
        oldest = (now - timedelta(days=max_age_days)).isoformat()

        def run():
            ids: list[int] = []
            start = 0
            while True:
                page = (
                    self._client.table("publications")
                    .select("id, products!inner(store)")
                    .eq("status", "active")
                    .eq("channel", "telegram")
                    .eq("products.store", "amazon")
                    .lte("published_at", oldest)
                    .order("id")
                    .range(start, start + CATALOG_PAGE - 1)
                    .execute()
                    .data
                )
                ids.extend(row["id"] for row in page)
                if len(page) < CATALOG_PAGE:
                    return ids
                start += CATALOG_PAGE

        return await asyncio.to_thread(run)

    async def end_stale_deals(self, now: datetime, max_age_days: int) -> list[int]:
        ids = await self.list_stale_deals(now, max_age_days)
        if not ids:
            return []

        def run():
            for i in range(0, len(ids), CATALOG_UPDATE_CHUNK):
                self._client.table("publications").update(
                    {
                        "status": PublicationStatus.ENDED.value,
                        "ended_at": now.isoformat(),
                        "post_synced_at": None,
                    }
                ).in_("id", ids[i : i + CATALOG_UPDATE_CHUNK]).execute()

        await asyncio.to_thread(run)
        return ids

    async def _update_publication(self, publication_id: int, values: dict) -> None:
        def run():
            self._client.table("publications").update(values).eq("id", publication_id).execute()

        await asyncio.to_thread(run)

    async def end_publication(self, publication_id: int, now: datetime) -> None:
        iso = now.isoformat()
        await self._update_publication(
            publication_id,
            {
                "status": PublicationStatus.ENDED.value,
                "ended_at": iso,
                "checked_at": iso,
                "post_synced_at": None,
            },
        )

    async def mark_checked(self, publication_id: int, now: datetime) -> None:
        await self._update_publication(publication_id, {"checked_at": now.isoformat()})

    async def list_ended_posts_to_edit(self, limit: int) -> list[int]:
        def run():
            return (
                self._client.table("publications")
                .select("id")
                .eq("status", "ended")
                .not_.is_("message_id", "null")
                .is_("post_synced_at", "null")
                .order("ended_at", desc=True)
                .order("published_at", desc=True)
                .limit(limit)
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [row["id"] for row in response.data]

    async def count_ended_posts_to_edit(self) -> int:
        def run():
            return (
                self._client.table("publications")
                .select("id", count="exact", head=True)
                .eq("status", "ended")
                .not_.is_("message_id", "null")
                .is_("post_synced_at", "null")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return response.count or 0

    async def mark_post_synced(self, publication_id: int, now: datetime) -> None:
        await self._update_publication(publication_id, {"post_synced_at": now.isoformat()})

    async def list_guides_to_announce(self, now: datetime) -> list[GuideToAnnounce]:
        def run():
            # lte also leaves out guides without published_at.
            return (
                self._client.table("guides")
                .select("id, slug, title, subtitle")
                .eq("status", "published")
                .lte("published_at", now.isoformat())
                .is_("announced_at", "null")
                .order("published_at")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            GuideToAnnounce(row["id"], row["slug"], row["title"], row.get("subtitle"))
            for row in response.data
        ]

    async def last_announced_guide_message(self) -> int | None:
        def run():
            return (
                self._client.table("guides")
                .select("announce_message_id")
                .not_.is_("announce_message_id", "null")
                .order("announced_at", desc=True)
                .limit(1)
                .execute()
            )

        data = (await asyncio.to_thread(run)).data
        return data[0]["announce_message_id"] if data else None

    async def mark_guide_announced(
        self, guide_id: int, message_id: int | None, now: datetime
    ) -> None:
        def run():
            return (
                self._client.table("guides")
                .update({"announced_at": now.isoformat(), "announce_message_id": message_id})
                .eq("id", guide_id)
                .execute()
            )

        await asyncio.to_thread(run)

    async def find_catalog_product(self, store: str, url: str) -> CatalogRow | None:
        def run():
            return (
                self._client.table("catalog_products")
                .select("*")
                .eq("store", store)
                .eq("url", url)
                .eq("in_stock", True)
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )

        data = (await asyncio.to_thread(run)).data
        if not data:
            return None
        r = data[0]
        return CatalogRow(
            store=r["store"],
            external_id=r["external_id"],
            title=r["title"],
            description=r.get("description"),
            brand=r.get("brand"),
            gtin=r.get("gtin"),
            category=r.get("category"),
            price=Decimal(str(r["price"])),
            sale_price=None if r.get("sale_price") is None else Decimal(str(r["sale_price"])),
            currency=r.get("currency") or "EUR",
            in_stock=bool(r["in_stock"]),
            image_url=r.get("image_url"),
            url=r["url"],
            affiliate_url=r["affiliate_url"],
            feed_updated_at=_parse_timestamp(r["feed_updated_at"]) if r.get("feed_updated_at") else None,
            updated_at=_parse_timestamp(r["updated_at"]) if r.get("updated_at") else None,
        )
