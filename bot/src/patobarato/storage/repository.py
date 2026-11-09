import dataclasses
import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Protocol

from patobarato.models import (
    AdminJob,
    ApiSource,
    CatalogRow,
    CouponUpsert,
    EventPromoRow,
    EventRef,
    GuideProduct,
    LastPublication,
    OfferStatus,
    ParsedOffer,
    PostData,
    PublicationChannel,
    PublicationStatus,
    Source,
)
from patobarato.publishing.format import normalize_hashtag

logger = logging.getLogger("patobarato.repository")


def clean_hashtags(tags: list[str]) -> list[str]:
    """Normalize hashtags, dropping empties and duplicates (order kept)."""
    return list(dict.fromkeys(t for t in map(normalize_hashtag, tags) if t))


class Repository(Protocol):
    async def sync_sources(self, channels: dict[str, str], country: str) -> list[Source]:
        """Registers unknown channels (identifier -> name) and returns the active ones."""
        ...

    async def upsert_product(self, offer: ParsedOffer) -> int: ...

    async def find_product_id(self, store: str, country: str, asin: str) -> int | None:
        """The id of an existing product, or None; never writes."""
        ...

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

    async def set_product_image(self, product_id: int, image_url: str) -> None: ...

    async def get_products_without_image(self) -> list[tuple[int, str, str, str, str]]:
        """``(product_id, asin, country, store, url)`` of products with no image yet (``url`` may be empty)."""
        ...

    async def get_last_publication(
        self, product_id: int, country: str, channel: PublicationChannel | None = None
    ) -> LastPublication | None:
        """Latest publication of the product; only of ``channel`` when given, else of any channel."""
        ...

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
    ) -> int: ...

    async def get_post(self, publication_id: int) -> PostData | None:
        """Publication joined with its offer and product, or None."""
        ...

    async def mark_post_published(
        self, publication_id: int, chat_id: int, message_id: int, published_at: datetime
    ) -> None:
        """Sets the Telegram ids and ``published_at``, status ``active``; the offer becomes ``published``."""
        ...

    async def manual_source_id(self) -> int:
        """Id of the ``sources`` row of type ``manual`` (posts made from the admin portal)."""
        ...

    async def claim_jobs(self, limit: int) -> list[AdminJob]:
        """Oldest ``pending`` jobs, set to ``running``; a job is never claimed twice."""
        ...

    async def finish_job(
        self, job_id: int, *, result: dict | None = None, error: str | None = None
    ) -> None:
        """Status ``done``, or ``error`` when ``error`` is given."""
        ...

    async def add_admin_user(self, user_id: str, email: str) -> None: ...

    async def list_api_sources(self) -> list[ApiSource]:
        """Active sources that are not Telegram channels."""
        ...

    async def mark_source_run(
        self, source_id: int, ran_at: datetime, error: str | None
    ) -> None: ...

    async def upsert_coupon(self, c: CouponUpsert) -> int: ...

    async def deactivate_coupons_not_in(
        self, source_id: int, external_ids: set[str]
    ) -> int:
        """Deactivates the source's coupons missing from ``external_ids``; returns how many.

        An EMPTY ``external_ids`` deactivates every active coupon of the source, so
        never call it after a FAILED fetch (an empty but successful fetch is fine:
        it means everything expired).
        """
        ...

    async def list_guide_products(self) -> list[GuideProduct]:
        """Products of PUBLISHED guides, deduplicated by (store, external_id), ordered by both."""
        ...

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
        """Stores the last-known price; with ``error`` set, an existing price is kept."""
        ...

    async def upsert_catalog_products(self, rows: list[CatalogRow]) -> None:
        """Inserts or updates by ``(store, external_id)``; ``updated_at`` is set to now."""
        ...

    async def mark_catalog_out_of_stock(self, store: str, seen_ids: set[str]) -> int:
        """Marks the store's in-stock products missing from ``seen_ids``; returns how many.

        An EMPTY ``seen_ids`` touches nothing (returns 0 with a warning): an empty feed is
        never proof that the whole catalogue is gone.
        """
        ...

    async def list_events_with_promo(self) -> list[EventRef]:
        """Events (any status) with a non-empty ``aliexpress_promo``, ordered by id."""
        ...

    async def replace_event_promos(self, event_id: int, rows: list[EventPromoRow]) -> None:
        """Deletes the event's promos, then inserts ``rows`` with ``synced_at`` = now."""
        ...

    async def record_feed_run(
        self,
        store: str,
        advertiser_id: int,
        ran_at: datetime,
        products: int,
        error: str | None,
    ) -> None: ...

    async def find_catalog_product(self, store: str, url: str) -> CatalogRow | None: ...


class InMemoryRepository(Repository):
    """Test double that mirrors the database uniqueness rules."""

    def __init__(self) -> None:
        self._sources: list[tuple[Source, bool]] = []
        self._source_names: dict[str, str] = {}
        self._products: dict[tuple[str, str, str], int] = {}
        self.product_titles: dict[int, str] = {}
        self.product_images: dict[int, str] = {}
        self.product_urls: dict[int, str] = {}
        self._offers: dict[int, dict] = {}
        self._offer_keys: dict[tuple[int, int, int], int] = {}
        self._publications: list[dict] = []
        self._api_sources: list[tuple[ApiSource, bool]] = []
        self.source_runs: dict[int, tuple[datetime, str | None]] = {}
        self.coupons: dict[int, dict] = {}
        self._guide_products: list[tuple[GuideProduct, bool]] = []
        self.prices: dict[int, dict] = {}
        self.catalog: dict[tuple[str, str], CatalogRow] = {}
        self._events: dict[int, tuple[str, str | None, str]] = {}
        self._event_promos: dict[int, list[EventPromoRow]] = {}
        self.feed_runs: dict[tuple[str, int], dict] = {}
        self._jobs: list[dict] = []
        self.admin_users: dict[str, dict] = {}
        self._manual_source_id: int | None = None
        self._next_id = {
            "source": 1,
            "product": 1,
            "offer": 1,
            "publication": 1,
            "coupon": 1,
            "job": 1,
        }

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

    def add_api_source(
        self,
        type: str,
        identifier: str,
        country: str = "ES",
        active: bool = True,
        config: dict | None = None,
        every_minutes: int = 60,
        hashtags: list[str] | None = None,
    ) -> ApiSource:
        source = ApiSource(
            id=self._new_id("source"),
            type=type,
            identifier=identifier,
            country=country,
            config=config or {},
            every_minutes=every_minutes,
            hashtags=hashtags or [],
            last_run_at=None,
        )
        self._api_sources.append((source, active))
        return source

    def source_names(self) -> dict[str, str]:
        return dict(self._source_names)

    async def sync_sources(self, channels: dict[str, str], country: str) -> list[Source]:
        known = {source.identifier for source, _ in self._sources}
        for identifier, name in channels.items():
            if identifier not in known:
                self.add_source(identifier, country=country)
                self._source_names[identifier] = name
        return [
            source
            for source, active in self._sources
            if active and source.identifier in channels
        ]

    async def upsert_product(self, offer: ParsedOffer) -> int:
        key = (offer.store, offer.country, offer.asin)
        product_id = self._products.get(key)
        if product_id is None:
            product_id = self._new_id("product")
            self._products[key] = product_id
        self.product_titles[product_id] = offer.title
        self.product_urls[product_id] = offer.product_url
        return product_id

    async def find_product_id(self, store: str, country: str, asin: str) -> int | None:
        return self._products.get((store, country, asin))

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
            "hashtags": clean_hashtags(offer.hashtags),
            "raw_text": raw_text,
            "status": OfferStatus.PENDING,
            "detected_at": detected_at,
        }
        return offer_id

    def offer_hashtags(self, offer_id: int) -> list[str]:
        """Stored hashtags of an offer (for tests)."""
        return list(self._offers[offer_id]["hashtags"])

    async def set_offer_status(self, offer_id: int, status: OfferStatus) -> None:
        offer = self._offers.get(offer_id)
        if offer is not None:
            offer["status"] = status

    async def set_product_image(self, product_id: int, image_url: str) -> None:
        self.product_images[product_id] = image_url

    async def get_products_without_image(self) -> list[tuple[int, str, str, str, str]]:
        return sorted(
            (product_id, asin, country, store, self.product_urls.get(product_id, ""))
            for (store, country, asin), product_id in self._products.items()
            if product_id not in self.product_images
        )

    def offer_statuses(self) -> list[OfferStatus]:
        """Offer statuses in insertion order (for tests)."""
        return [offer["status"] for offer in self._offers.values()]

    def publications(self) -> list[dict]:
        """Copies of the stored publications in insertion order (for tests)."""
        return [dict(p) for p in self._publications]

    async def get_last_publication(
        self, product_id: int, country: str, channel: PublicationChannel | None = None
    ) -> LastPublication | None:
        matches = [
            p
            for p in self._publications
            if p["product_id"] == product_id
            and p["country"] == country
            and p["status"] != PublicationStatus.DRAFT
            and (channel is None or p["channel"] == channel)
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
        chat_id: int | None,
        message_id: int | None,
        published_price: Decimal,
        affiliate_url: str,
        published_at: datetime,
        channel: PublicationChannel = "telegram",
        price_before_coupon: bool = False,
        status: PublicationStatus = PublicationStatus.ACTIVE,
    ) -> int:
        publication_id = self._new_id("publication")
        self._publications.append(
            {
                "id": publication_id,
                "offer_id": offer_id,
                "product_id": product_id,
                "country": country,
                "channel": channel,
                "chat_id": chat_id,
                "message_id": message_id,
                "published_price": published_price,
                "price_before_coupon": price_before_coupon,
                "affiliate_url": affiliate_url,
                "status": status,
                "published_at": published_at,
            }
        )
        return publication_id

    async def get_post(self, publication_id: int) -> PostData | None:
        pub = next((p for p in self._publications if p["id"] == publication_id), None)
        if pub is None:
            return None
        offer = self._offers[pub["offer_id"]]
        product_id = pub["product_id"]
        store = next(k[0] for k, v in self._products.items() if v == product_id)
        return PostData(
            publication_id=publication_id,
            offer_id=pub["offer_id"],
            product_id=product_id,
            status=pub["status"],
            chat_id=pub["chat_id"],
            message_id=pub["message_id"],
            title=self.product_titles[product_id],
            price=pub["published_price"],
            previous_price=offer["previous_price"],
            coupon=offer["coupon"],
            hashtags=list(offer["hashtags"]),
            price_before_coupon=pub["price_before_coupon"],
            affiliate_url=pub["affiliate_url"],
            store=store,
            country=pub["country"],
            image_url=self.product_images.get(product_id),
        )

    async def mark_post_published(
        self, publication_id: int, chat_id: int, message_id: int, published_at: datetime
    ) -> None:
        for pub in self._publications:
            if pub["id"] == publication_id:
                pub.update(
                    chat_id=chat_id,
                    message_id=message_id,
                    published_at=published_at,
                    status=PublicationStatus.ACTIVE,
                )
                await self.set_offer_status(pub["offer_id"], OfferStatus.PUBLISHED)

    async def manual_source_id(self) -> int:
        if self._manual_source_id is None:
            self._manual_source_id = self._new_id("source")
        return self._manual_source_id

    def add_job(self, type: str, payload: dict) -> int:
        job_id = self._new_id("job")
        self._jobs.append(
            {
                "id": job_id,
                "type": type,
                "payload": payload,
                "status": "pending",
                "result": None,
                "error": None,
            }
        )
        return job_id

    def jobs(self) -> list[dict]:
        """Copies of the stored jobs in insertion order (for tests)."""
        return [dict(j) for j in self._jobs]

    async def claim_jobs(self, limit: int) -> list[AdminJob]:
        claimed = []
        for job in self._jobs:
            if len(claimed) >= limit:
                break
            if job["status"] == "pending":
                job["status"] = "running"
                claimed.append(AdminJob(job["id"], job["type"], job["payload"]))
        return claimed

    async def finish_job(
        self, job_id: int, *, result: dict | None = None, error: str | None = None
    ) -> None:
        for job in self._jobs:
            if job["id"] == job_id:
                job.update(
                    status="done" if error is None else "error", result=result, error=error
                )

    async def add_admin_user(self, user_id: str, email: str) -> None:
        self.admin_users[user_id] = {"email": email, "is_owner": False}

    async def list_api_sources(self) -> list[ApiSource]:
        result = []
        for source, active in self._api_sources:
            if not active:
                continue
            run = self.source_runs.get(source.id)
            result.append(
                dataclasses.replace(source, last_run_at=run[0]) if run else source
            )
        return result

    async def mark_source_run(
        self, source_id: int, ran_at: datetime, error: str | None
    ) -> None:
        self.source_runs[source_id] = (ran_at, error)

    async def upsert_coupon(self, c: CouponUpsert) -> int:
        for coupon_id, row in self.coupons.items():
            if row["source_id"] == c.source_id and row["external_id"] == c.external_id:
                row.update(dataclasses.asdict(c), active=True)
                return coupon_id
        coupon_id = self._new_id("coupon")
        self.coupons[coupon_id] = {**dataclasses.asdict(c), "active": True}
        return coupon_id

    async def deactivate_coupons_not_in(
        self, source_id: int, external_ids: set[str]
    ) -> int:
        count = 0
        for row in self.coupons.values():
            if (
                row["source_id"] == source_id
                and row["active"]
                and row["external_id"] not in external_ids
            ):
                row["active"] = False
                count += 1
        return count

    def add_guide_product(self, product: GuideProduct, published: bool = True) -> None:
        self._guide_products.append((product, published))

    async def list_guide_products(self) -> list[GuideProduct]:
        unique: dict[tuple[str, str], GuideProduct] = {}
        for product, published in self._guide_products:
            if published:
                unique.setdefault((product.store, product.external_id), product)
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
        existing = self.prices.get(product_id)
        if error is not None and existing is not None:
            price = existing["price"]
            previous_price = existing["previous_price"]
            currency = existing["currency"]
        self.prices[product_id] = {
            "price": price,
            "previous_price": previous_price,
            "currency": currency,
            "checked_at": checked_at,
            "error": error,
            "affiliate_url": affiliate_url,
        }

    async def upsert_catalog_products(self, rows: list[CatalogRow]) -> None:
        now = datetime.now(UTC)
        for row in rows:
            self.catalog[(row.store, row.external_id)] = dataclasses.replace(row, updated_at=now)

    async def mark_catalog_out_of_stock(self, store: str, seen_ids: set[str]) -> int:
        if not seen_ids:
            logger.warning("Catalog: empty feed for %s; nothing marked out of stock", store)
            return 0
        count = 0
        for key, row in list(self.catalog.items()):
            if key[0] == store and row.in_stock and key[1] not in seen_ids:
                self.catalog[key] = dataclasses.replace(row, in_stock=False)
                count += 1
        return count

    def add_event(
        self, slug: str, aliexpress_promo: str | None = None, status: str = "published"
    ) -> int:
        event_id = max(self._events, default=0) + 1
        self._events[event_id] = (slug, aliexpress_promo, status)
        return event_id

    @property
    def event_promos(self) -> dict[int, list[EventPromoRow]]:
        return self._event_promos

    async def list_events_with_promo(self) -> list[EventRef]:
        return [
            EventRef(event_id, slug, promo)
            for event_id, (slug, promo, _status) in sorted(self._events.items())
            if promo
        ]

    async def replace_event_promos(self, event_id: int, rows: list[EventPromoRow]) -> None:
        self._event_promos[event_id] = list(rows)

    async def record_feed_run(
        self,
        store: str,
        advertiser_id: int,
        ran_at: datetime,
        products: int,
        error: str | None,
    ) -> None:
        self.feed_runs[(store, advertiser_id)] = {
            "last_run_at": ran_at,
            "products": products,
            "last_error": error,
        }

    async def find_catalog_product(self, store: str, url: str) -> CatalogRow | None:
        matches = [r for (s, _), r in self.catalog.items() if s == store and r.url == url]
        return next((r for r in matches if r.in_stock), matches[0] if matches else None)
