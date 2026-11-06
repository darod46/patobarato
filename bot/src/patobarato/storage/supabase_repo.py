import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from postgrest.exceptions import APIError
from supabase import Client

from patobarato.models import (
    ApiSource,
    CouponUpsert,
    LastPublication,
    OfferStatus,
    ParsedOffer,
    PublicationChannel,
    PublicationStatus,
    Source,
)
from patobarato.storage.repository import clean_hashtags

UNIQUE_VIOLATION = "23505"


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
            "category": None,
            "brand": None,
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

    async def get_products_without_image(self) -> list[tuple[int, str, str, str]]:
        def run():
            return (
                self._client.table("products")
                .select("id, asin, country, store")
                .is_("image_url", "null")
                .order("id")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            (row["id"], row["asin"], row["country"], row["store"])
            for row in response.data
        ]

    async def get_last_publication(
        self, product_id: int, country: str
    ) -> LastPublication | None:
        def run():
            return (
                self._client.table("publications")
                .select("published_price::text, published_at, status")
                .eq("product_id", product_id)
                .eq("country", country)
                .order("published_at", desc=True)
                .limit(1)
                .execute()
            )

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
    ) -> int:
        row = {
            "offer_id": offer_id,
            "product_id": product_id,
            "country": country,
            "channel": channel,
            "published_price": str(published_price),
            "affiliate_url": affiliate_url,
            "status": PublicationStatus.ACTIVE.value,
            "published_at": published_at.isoformat(),
        }
        if chat_id is not None:
            row["chat_id"] = chat_id
        if message_id is not None:
            row["message_id"] = message_id

        def run():
            return self._client.table("publications").insert(row).execute()

        response = await asyncio.to_thread(run)
        return response.data[0]["id"]

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
