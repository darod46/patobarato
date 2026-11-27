import dataclasses
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Protocol

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
from patobarato.publishing.format import normalize_hashtag
from patobarato.publishing.web_links import product_slug

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

    async def get_product_slug(self, product_id: int) -> str | None:
        """The product's fixed URL slug (set by the database when the product is created)."""
        ...

    async def delete_publication(self, publication_id: int) -> None:
        """Removes a publication that never reached the channel."""
        ...

    async def products_to_enrich(self, limit: int) -> list[ProductToEnrich]:
        """Newest products with a non-draft publication, no description, not edited by hand and < 3 attempts."""
        ...

    async def save_product_text(
        self, product_id: int, description: str, category: str, at: datetime
    ) -> None:
        """Stores the generated text unless an admin edited it meanwhile (``description_manual``)."""
        ...

    async def record_enrich_failure(self, product_id: int, attempts: int) -> None:
        """Sets ``enrich_attempts``; the product leaves the queue at 3."""
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

    async def fail_running_jobs(self, error: str) -> int:
        """Marks every ``running`` job as ``error`` (left over by a crash); returns how many."""
        ...

    async def add_admin_user(self, user_id: str, email: str) -> None: ...

    async def owner_ids(self) -> list[str]:
        """User ids of the admin users flagged ``is_owner``."""
        ...

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
        """Products of guides that are published OR scheduled within the next 7 days.

        A guide counts when its status is ``published`` and its ``published_at`` is
        null or ``<= now + 7 days``; later-scheduled guides and drafts are excluded.
        Deduplicated by (store, external_id), ordered by both.
        """
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
        """Stores the last-known price; with ``error`` set, an existing price is kept.

        On the error path ``affiliate_url`` is written only when given (not None).
        """
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

    async def upsert_channel_stats(self, members: int, checked_at: datetime) -> None:
        """Stores the channel member count in the single ``channel_stats`` row."""
        ...

    async def list_deals_to_check(
        self, now: datetime, max_age_days: int, recheck_hours: int, limit: int
    ) -> list[DealToCheck]:
        """Active Telegram Amazon publications (offer without coupon) worth re-checking.

        ``published_at > now - max_age_days`` and never checked or checked more than
        ``recheck_hours`` ago; ordered by ``checked_at`` (never first), then newest first.
        """
        ...

    async def list_stale_deals(self, now: datetime, max_age_days: int) -> list[int]:
        """Ids of active Telegram Amazon publications with ``published_at <= now - max_age_days``."""
        ...

    async def end_stale_deals(self, now: datetime, max_age_days: int) -> list[int]:
        """Ends the publications of ``list_stale_deals``; returns ids.

        Sets status ``ended`` and ``ended_at``, and clears ``post_synced_at`` so the post is edited.
        """
        ...

    async def end_publication(self, publication_id: int, now: datetime) -> None:
        """Status ``ended``; ``ended_at`` and ``checked_at`` set to ``now``.

        Clears ``post_synced_at`` so the post is edited.
        """
        ...

    async def mark_checked(self, publication_id: int, now: datetime) -> None: ...

    async def list_ended_posts_to_edit(self, limit: int) -> list[int]:
        """Ended publications with a Telegram message not yet edited.

        Newest ``ended_at`` first, ties by newest ``published_at``.
        """
        ...

    async def count_ended_posts_to_edit(self) -> int:
        """How many publications ``list_ended_posts_to_edit`` would return without a limit."""
        ...

    async def mark_post_synced(self, publication_id: int, now: datetime) -> None: ...

    async def list_guides_to_announce(self, now: datetime) -> list[GuideToAnnounce]:
        """Published guides with ``published_at <= now`` not yet announced, oldest first."""
        ...

    async def last_announced_guide_message(self) -> int | None:
        """``announce_message_id`` of the most recently announced guide that has one."""
        ...

    async def mark_guide_announced(
        self, guide_id: int, message_id: int | None, now: datetime
    ) -> None: ...


class InMemoryRepository(Repository):
    """Test double that mirrors the database uniqueness rules."""

    def __init__(self) -> None:
        self._sources: list[tuple[Source, bool]] = []
        self._source_names: dict[str, str] = {}
        self._products: dict[tuple[str, str, str], int] = {}
        self.product_titles: dict[int, str] = {}
        self.product_images: dict[int, str] = {}
        self.product_urls: dict[int, str] = {}
        self.product_slugs: dict[int, str] = {}
        self.product_texts: dict[int, dict] = {}
        self.enrich_attempts: dict[int, int] = {}
        self.manual_texts: set[int] = set()
        self._offers: dict[int, dict] = {}
        self._offer_keys: dict[tuple[int, int, int], int] = {}
        self._publications: list[dict] = []
        self._api_sources: list[tuple[ApiSource, bool]] = []
        self.source_runs: dict[int, tuple[datetime, str | None]] = {}
        self.coupons: dict[int, dict] = {}
        self._guide_products: list[tuple[GuideProduct, bool, datetime | None]] = []
        self._guides: list[dict] = []
        self.prices: dict[int, dict] = {}
        self.catalog: dict[tuple[str, str], CatalogRow] = {}
        self._events: dict[int, tuple[str, str | None, str]] = {}
        self._event_promos: dict[int, list[EventPromoRow]] = {}
        self.feed_runs: dict[tuple[str, int], dict] = {}
        self.channel_stats: dict | None = None
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
            # Like the database trigger: the slug is fixed when the product is created.
            self.product_slugs[product_id] = product_slug(offer.title)
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
        checked_at: datetime | None = None,
        post_synced_at: datetime | None = None,
        ended_at: datetime | None = None,
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
                "checked_at": checked_at,
                "post_synced_at": post_synced_at,
                "ended_at": ended_at,
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
            published_at=pub.get("published_at"),
            asin=next(k[2] for k, v in self._products.items() if v == product_id),
            slug=self.product_slugs.get(product_id),
        )

    async def get_product_slug(self, product_id: int) -> str | None:
        return self.product_slugs.get(product_id)

    async def delete_publication(self, publication_id: int) -> None:
        self._publications = [p for p in self._publications if p["id"] != publication_id]

    async def products_to_enrich(self, limit: int) -> list[ProductToEnrich]:
        shown = {p["product_id"] for p in self._publications if p["status"] != "draft"}
        queue = [
            ProductToEnrich(pid, self.product_titles.get(pid, ""), self.enrich_attempts.get(pid, 0))
            for pid in sorted(shown, reverse=True)
            if pid not in self.product_texts
            and pid not in self.manual_texts
            and self.enrich_attempts.get(pid, 0) < 3
        ]
        return queue[:limit]

    async def save_product_text(
        self, product_id: int, description: str, category: str, at: datetime
    ) -> None:
        if product_id in self.manual_texts:
            return
        self.product_texts[product_id] = {"description": description, "category": category, "at": at}

    async def record_enrich_failure(self, product_id: int, attempts: int) -> None:
        self.enrich_attempts[product_id] = attempts

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

    async def fail_running_jobs(self, error: str) -> int:
        count = 0
        for job in self._jobs:
            if job["status"] == "running":
                job.update(status="error", error=error)
                count += 1
        return count

    async def add_admin_user(self, user_id: str, email: str, *, is_owner: bool = False) -> None:
        self.admin_users[user_id] = {"email": email, "is_owner": is_owner}

    async def owner_ids(self) -> list[str]:
        return [uid for uid, u in self.admin_users.items() if u["is_owner"]]

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

    def add_guide_product(
        self,
        product: GuideProduct,
        published: bool = True,
        published_at: datetime | None = None,
    ) -> None:
        self._guide_products.append((product, published, published_at))

    async def list_guide_products(self) -> list[GuideProduct]:
        from patobarato.core import pipeline  # lazy: pipeline imports this module

        horizon = pipeline.utcnow() + timedelta(days=7)
        unique: dict[tuple[str, str], GuideProduct] = {}
        for product, published, published_at in self._guide_products:
            if published and (published_at is None or published_at <= horizon):
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
            if affiliate_url is None:
                affiliate_url = existing["affiliate_url"]
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

    async def upsert_channel_stats(self, members: int, checked_at: datetime) -> None:
        self.channel_stats = {"members": members, "checked_at": checked_at}

    def _amazon_telegram_active(self, pub: dict) -> bool:
        store = next(k[0] for k, v in self._products.items() if v == pub["product_id"])
        return (
            pub["status"] == PublicationStatus.ACTIVE
            and pub["channel"] == "telegram"
            and store == "amazon"
        )

    async def list_deals_to_check(
        self, now: datetime, max_age_days: int, recheck_hours: int, limit: int
    ) -> list[DealToCheck]:
        oldest = now - timedelta(days=max_age_days)
        recheck_before = now - timedelta(hours=recheck_hours)
        picked = [
            p
            for p in self._publications
            if self._amazon_telegram_active(p)
            and self._offers[p["offer_id"]]["coupon"] is None
            and p["published_at"] > oldest
            and (p["checked_at"] is None or p["checked_at"] < recheck_before)
        ]
        picked.sort(key=lambda p: p["published_at"], reverse=True)
        # stable sorts: checked_at asc with never-checked first, ties by newest published
        picked.sort(
            key=lambda p: (p["checked_at"] is not None, p["checked_at"] or datetime.min.replace(tzinfo=UTC))
        )
        result = []
        for p in picked[:limit]:
            asin = next(k[2] for k, v in self._products.items() if v == p["product_id"])
            result.append(
                DealToCheck(
                    publication_id=p["id"],
                    product_id=p["product_id"],
                    asin=asin,
                    url=self.product_urls.get(p["product_id"], ""),
                    published_price=p["published_price"],
                )
            )
        return result

    async def list_stale_deals(self, now: datetime, max_age_days: int) -> list[int]:
        oldest = now - timedelta(days=max_age_days)
        return [
            p["id"]
            for p in self._publications
            if self._amazon_telegram_active(p) and p["published_at"] <= oldest
        ]

    async def end_stale_deals(self, now: datetime, max_age_days: int) -> list[int]:
        ids = await self.list_stale_deals(now, max_age_days)
        for pub in self._publications:
            if pub["id"] in ids:
                pub.update(status=PublicationStatus.ENDED, ended_at=now, post_synced_at=None)
        return ids

    def _pub_by_id(self, publication_id: int) -> dict:
        return next(p for p in self._publications if p["id"] == publication_id)

    async def end_publication(self, publication_id: int, now: datetime) -> None:
        self._pub_by_id(publication_id).update(
            status=PublicationStatus.ENDED, ended_at=now, checked_at=now, post_synced_at=None
        )

    async def mark_checked(self, publication_id: int, now: datetime) -> None:
        self._pub_by_id(publication_id)["checked_at"] = now

    def _ended_posts_to_edit(self) -> list[dict]:
        return [
            p
            for p in self._publications
            if p["status"] == PublicationStatus.ENDED
            and p["message_id"] is not None
            and p["post_synced_at"] is None
        ]

    async def list_ended_posts_to_edit(self, limit: int) -> list[int]:
        picked = self._ended_posts_to_edit()
        oldest = datetime.min.replace(tzinfo=UTC)
        picked.sort(
            key=lambda p: (p["ended_at"] or oldest, p["published_at"] or oldest), reverse=True
        )
        return [p["id"] for p in picked[:limit]]

    async def count_ended_posts_to_edit(self) -> int:
        return len(self._ended_posts_to_edit())

    async def mark_post_synced(self, publication_id: int, now: datetime) -> None:
        self._pub_by_id(publication_id)["post_synced_at"] = now

    def add_guide(
        self,
        guide_id: int,
        slug: str,
        title: str,
        subtitle: str | None = None,
        *,
        status: str = "published",
        published_at: datetime | None = None,
        announced_at: datetime | None = None,
        announce_message_id: int | None = None,
    ) -> None:
        self._guides.append(
            {
                "id": guide_id,
                "slug": slug,
                "title": title,
                "subtitle": subtitle,
                "status": status,
                "published_at": published_at,
                "announced_at": announced_at,
                "announce_message_id": announce_message_id,
            }
        )

    async def list_guides_to_announce(self, now: datetime) -> list[GuideToAnnounce]:
        picked = [
            g
            for g in self._guides
            if g["status"] == "published"
            and g["published_at"] is not None
            and g["published_at"] <= now
            and g["announced_at"] is None
        ]
        picked.sort(key=lambda g: g["published_at"])
        return [GuideToAnnounce(g["id"], g["slug"], g["title"], g["subtitle"]) for g in picked]

    async def last_announced_guide_message(self) -> int | None:
        announced = [
            g
            for g in self._guides
            if g["announced_at"] is not None and g["announce_message_id"] is not None
        ]
        if not announced:
            return None
        return max(announced, key=lambda g: g["announced_at"])["announce_message_id"]

    async def mark_guide_announced(
        self, guide_id: int, message_id: int | None, now: datetime
    ) -> None:
        guide = next(g for g in self._guides if g["id"] == guide_id)
        guide.update(announced_at=now, announce_message_id=message_id)

    async def find_catalog_product(self, store: str, url: str) -> CatalogRow | None:
        matches = [r for (s, _), r in self.catalog.items() if s == store and r.url == url]
        return next((r for r in matches if r.in_stock), matches[0] if matches else None)
