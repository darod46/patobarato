from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import StrEnum


class OfferStatus(StrEnum):
    PENDING = "pending"
    PUBLISHED = "published"
    SKIPPED_DUPLICATE = "skipped_duplicate"
    SKIPPED_NO_PRICE = "skipped_no_price"
    SKIPPED_STALE = "skipped_stale"
    PUBLISH_FAILED = "publish_failed"


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
