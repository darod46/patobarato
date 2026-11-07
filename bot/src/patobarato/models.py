from collections.abc import Awaitable, Callable
from dataclasses import dataclass
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
    PUBLISH_FAILED = "publish_failed"


PublicationChannel = Literal["telegram", "web"]


class PublicationStatus(StrEnum):
    ACTIVE = "active"
    ENDED = "ended"


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


@dataclass(frozen=True)
class GuideProduct:
    store: str
    external_id: str
    url: str
    name: str
    image_url: str | None


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
