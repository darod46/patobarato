from datetime import datetime
from decimal import Decimal
from typing import Protocol

from patobarato.models import (
    LastPublication,
    OfferStatus,
    ParsedOffer,
    PublicationStatus,
    Source,
)


class Repository(Protocol):
    async def get_active_sources(self) -> list[Source]: ...

    async def upsert_product(self, offer: ParsedOffer) -> int: ...

    async def insert_offer(
        self,
        product_id: int,
        source_id: int,
        source_message_id: int,
        offer: ParsedOffer,
        raw_text: str,
        detected_at: datetime,
    ) -> int | None: ...

    async def set_offer_status(self, offer_id: int, status: OfferStatus) -> None: ...

    async def get_last_publication(
        self, product_id: int, country: str
    ) -> LastPublication | None: ...

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
    ) -> int: ...


class InMemoryRepository(Repository):
    """Test double that mirrors the database uniqueness rules."""

    def __init__(self) -> None:
        self._sources: list[tuple[Source, bool]] = []
        self._products: dict[tuple[str, str, str], int] = {}
        self.product_titles: dict[int, str] = {}
        self._offers: dict[int, dict] = {}
        self._offer_keys: dict[tuple[int, int, int], int] = {}
        self._publications: list[dict] = []
        self._next_id = {"source": 1, "product": 1, "offer": 1, "publication": 1}

    def _new_id(self, kind: str) -> int:
        value = self._next_id[kind]
        self._next_id[kind] = value + 1
        return value

    def add_source(
        self, identifier: str, country: str = "ES", active: bool = True
    ) -> Source:
        source = Source(
            id=self._new_id("source"), identifier=identifier, country=country
        )
        self._sources.append((source, active))
        return source

    async def get_active_sources(self) -> list[Source]:
        return [source for source, active in self._sources if active]

    async def upsert_product(self, offer: ParsedOffer) -> int:
        key = (offer.store, offer.country, offer.asin)
        product_id = self._products.get(key)
        if product_id is None:
            product_id = self._new_id("product")
            self._products[key] = product_id
        self.product_titles[product_id] = offer.title
        return product_id

    async def insert_offer(
        self,
        product_id: int,
        source_id: int,
        source_message_id: int,
        offer: ParsedOffer,
        raw_text: str,
        detected_at: datetime,
    ) -> int | None:
        key = (source_id, source_message_id, product_id)
        if key in self._offer_keys:
            return None
        offer_id = self._new_id("offer")
        self._offer_keys[key] = offer_id
        self._offers[offer_id] = {
            "product_id": product_id,
            "source_id": source_id,
            "source_message_id": source_message_id,
            "country": offer.country,
            "price": offer.price,
            "previous_price": offer.previous_price,
            "coupon": offer.coupon,
            "raw_text": raw_text,
            "status": OfferStatus.PENDING,
            "detected_at": detected_at,
        }
        return offer_id

    async def set_offer_status(self, offer_id: int, status: OfferStatus) -> None:
        offer = self._offers.get(offer_id)
        if offer is not None:
            offer["status"] = status

    def offer_statuses(self) -> list[OfferStatus]:
        """Offer statuses in insertion order (for tests)."""
        return [offer["status"] for offer in self._offers.values()]

    def publications(self) -> list[dict]:
        """Copies of the stored publications in insertion order (for tests)."""
        return [dict(p) for p in self._publications]

    async def get_last_publication(
        self, product_id: int, country: str
    ) -> LastPublication | None:
        matches = [
            p
            for p in self._publications
            if p["product_id"] == product_id and p["country"] == country
        ]
        if not matches:
            return None
        latest = max(matches, key=lambda p: p["published_at"])
        return LastPublication(
            published_price=latest["published_price"],
            published_at=latest["published_at"],
            status=latest["status"],
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
        publication_id = self._new_id("publication")
        self._publications.append(
            {
                "id": publication_id,
                "offer_id": offer_id,
                "product_id": product_id,
                "country": country,
                "chat_id": chat_id,
                "message_id": message_id,
                "published_price": published_price,
                "affiliate_url": affiliate_url,
                "status": PublicationStatus.ACTIVE,
                "published_at": published_at,
            }
        )
        return publication_id
