from datetime import datetime, timedelta
from decimal import Decimal

from patobarato.models import LastPublication, OfferStatus, PublicationStatus


def decide(
    price: Decimal | None,
    detected_at: datetime,
    last: LastPublication | None,
    now: datetime,
    republish_after: timedelta,
    stale_after: timedelta,
) -> OfferStatus:
    if price is None:
        return OfferStatus.SKIPPED_NO_PRICE
    if now - detected_at > stale_after:
        return OfferStatus.SKIPPED_STALE
    if last is None or last.status == PublicationStatus.ENDED:
        return OfferStatus.PUBLISHED
    if now - last.published_at >= republish_after:
        return OfferStatus.PUBLISHED
    if price < last.published_price:
        return OfferStatus.PUBLISHED
    return OfferStatus.SKIPPED_DUPLICATE
