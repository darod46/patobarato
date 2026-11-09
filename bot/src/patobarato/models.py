from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal


class OfferStatus(StrEnum):
    PENDING = "pending"
    PUBLISHED = "published"
    PUBLISHED_WEB = "published_web"
    SKIPPED_DUPLICATE = "skipped_duplicate"
    SKIPPED_NO_PRICE = "skipped_no_price"
    SKIPPED_STALE = "skipped_stale"
    SKIPPED_NO_AFFILIATE = "skipped_no_affiliate"
    SKIPPED_MISMATCH = "skipped_mismatch"
    PUBLISH_FAILED = "publish_failed"


PublicationChannel = Literal["telegram", "web"]


class PublicationStatus(StrEnum):
    ACTIVE = "active"
    ENDED = "ended"
    DRAFT = "draft"


@dataclass(frozen=True)
class SourceMessage:
    source_id: int
    message_id: int
    text: str
    urls: list[str]
    hashtags: list[str]
    received_at: datetime
    preview_photo: Callable[[], Awaitable[bytes | None]] | None = None
    preview_url: str | None = None
    # The photo attached to the message itself (channels that post a photo + caption).
    attached_photo: Callable[[], Awaitable[bytes | None]] | None = None


@dataclass(frozen=True)
class ParsedOffer:
    asin: str  # product id within its store
    country: str
    store: str
    title: str
    price: Decimal | None
    previous_price: Decimal | None
    coupon: str | None
    hashtags: list[str]
    canonical_url: str
    product_url: str
    image_url: str | None = None
    affiliate_url: str | None = None
    # The price came from the store's API and coupons in the message still lower it.
    price_before_coupon: bool = False


@dataclass(frozen=True)
class Source:
    id: int
    identifier: str
    country: str


@dataclass(frozen=True)
class LastPublication:
    published_price: Decimal
    published_at: datetime
    status: PublicationStatus


@dataclass(frozen=True)
class AdminJob:
    id: int
    type: str
    payload: dict


@dataclass(frozen=True)
class PostData:
    publication_id: int
    offer_id: int
    product_id: int
    status: PublicationStatus
    chat_id: int | None
    message_id: int | None
    title: str
    price: Decimal
    previous_price: Decimal | None
    coupon: str | None
    hashtags: list[str]
    price_before_coupon: bool
    affiliate_url: str
    store: str
    country: str
    image_url: str | None


@dataclass(frozen=True)
class ApiSource:
    id: int
    type: str
    identifier: str
    country: str
    config: dict
    every_minutes: int
    hashtags: list[str]
    last_run_at: datetime | None


@dataclass(frozen=True)
class CouponUpsert:
    source_id: int
    external_id: str
    store: str
    code: str
    title: str
    conditions: str | None
    url: str
    starts_at: datetime | None
    expires_at: datetime | None


@dataclass(frozen=True)
class PriceQuote:
    price: Decimal
    previous_price: Decimal | None
    currency: str = "EUR"
    image_url: str | None = None
    # The store's own product title, when it reports one (checked against the message's).
    title: str | None = None


@dataclass(frozen=True)
class GuideProduct:
    store: str
    external_id: str
    url: str
    name: str
    image_url: str | None


@dataclass(frozen=True)
class EventRef:
    """An event with an AliExpress campaign configured (``events``)."""

    id: int
    slug: str
    aliexpress_promo: str


@dataclass(frozen=True)
class EventPromoRow:
    """One promo product of an event (``event_promos``)."""

    external_id: str
    title: str
    price: Decimal
    original_price: Decimal | None
    image_url: str | None
    affiliate_url: str
    position: int
    currency: str = "EUR"


@dataclass(frozen=True)
class AwinFeedProduct:
    external_id: str
    title: str
    description: str | None
    brand: str | None
    gtin: str | None
    category: str | None
    price: Decimal
    sale_price: Decimal | None
    in_stock: bool
    image_url: str | None
    url: str
    affiliate_url: str


@dataclass(frozen=True)
class CatalogRow:
    """One store-catalogue product (``catalog_products``)."""

    store: str
    external_id: str
    title: str
    description: str | None
    brand: str | None
    gtin: str | None
    category: str | None
    price: Decimal
    sale_price: Decimal | None
    currency: str
    in_stock: bool
    image_url: str | None
    url: str
    affiliate_url: str
    feed_updated_at: datetime | None
    updated_at: datetime | None = None


@dataclass(frozen=True)
class ChollometroThread:
    thread_id: int
    title: str
    url: str  # thread page on chollometro.com
    visit_url: str | None  # https://www.chollometro.com/visit/...
    merchant: str | None  # name shown by Chollometro ("Amazon")
    price: Decimal | None
    previous_price: Decimal | None
    discount: int | None  # % given by Chollometro, if any
    temperature: float
    expired: bool
    sold_out: bool
    coupon: str | None
    categories: list[str]
    published_at: datetime  # aware, UTC


class ThreadState(StrEnum):
    WATCHING = "watching"  # not eligible yet, re-evaluated during warm_hours
    QUALIFIED = "qualified"  # eligible, waiting for a free slot (qualified_at set)
    PUBLISHED = "published"  # published; its end is watched
    ENDED = "ended"  # publication marked as ended
    SKIPPED = "skipped"  # dropped for good (unknown store, stale, mismatch, duplicate, no affiliate)


@dataclass(frozen=True)
class TrackedThread:
    """Chollometro thread followed across runs (``chollometro_threads``)."""

    source_id: int
    thread_id: int
    url: str
    state: ThreadState
    temperature: float
    discount: int | None
    first_seen_at: datetime
    published_at: datetime  # on Chollometro
    qualified_at: datetime | None
    store_url: str | None  # result of /visit/ (resolved once)
    publication_id: int | None
    last_checked_at: datetime | None
    skip_reason: str | None = None
    snapshot: dict = field(default_factory=dict)  # latest deal data, JSON-safe
