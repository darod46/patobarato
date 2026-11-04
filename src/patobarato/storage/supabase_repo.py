import asyncio
from datetime import UTC, datetime
from decimal import Decimal

from postgrest.exceptions import APIError
from supabase import Client

from patobarato.models import (
    LastPublication,
    OfferStatus,
    ParsedOffer,
    PublicationStatus,
    Source,
)

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

    async def get_active_sources(self) -> list[Source]:
        def run():
            return (
                self._client.table("sources")
                .select("id, identifier, country, invite_link")
                .eq("active", True)
                .order("id")
                .execute()
            )

        response = await asyncio.to_thread(run)
        return [
            Source(
                id=row["id"],
                identifier=row["identifier"],
                country=row["country"],
                invite_link=row.get("invite_link"),
            )
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
        chat_id: int,
        message_id: int,
        published_price: Decimal,
        affiliate_url: str,
        published_at: datetime,
    ) -> int:
        row = {
            "offer_id": offer_id,
            "product_id": product_id,
            "country": country,
            "chat_id": chat_id,
            "message_id": message_id,
            "published_price": str(published_price),
            "affiliate_url": affiliate_url,
            "status": PublicationStatus.ACTIVE.value,
            "published_at": published_at.isoformat(),
        }

        def run():
            return self._client.table("publications").insert(row).execute()

        response = await asyncio.to_thread(run)
        return response.data[0]["id"]
