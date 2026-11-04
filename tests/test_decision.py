from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.core.decision import decide
from patobarato.models import LastPublication, OfferStatus, PublicationStatus

R = timedelta(days=7)
S = timedelta(minutes=30)
NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
FRESH = NOW - timedelta(minutes=1)


def last(price="10.00", age=timedelta(days=1), status=PublicationStatus.ACTIVE):
    return LastPublication(Decimal(price), NOW - age, status)


def run(price, last_pub=None, detected_at=FRESH):
    return decide(price, detected_at, last_pub, NOW, R, S)


def test_no_price():
    assert run(None) == OfferStatus.SKIPPED_NO_PRICE


def test_first_time():
    assert run(Decimal("10.00")) == OfferStatus.PUBLISHED


def test_same_price_within_window_is_duplicate():
    l = last(age=timedelta(days=6, hours=23))
    assert run(Decimal("10.00"), l) == OfferStatus.SKIPPED_DUPLICATE


def test_higher_price_within_window_is_duplicate():
    assert run(Decimal("10.01"), last()) == OfferStatus.SKIPPED_DUPLICATE


def test_lower_by_one_cent_publishes():
    assert run(Decimal("9.99"), last()) == OfferStatus.PUBLISHED


def test_exactly_seven_days_publishes():
    assert run(Decimal("10.00"), last(age=timedelta(days=7))) == OfferStatus.PUBLISHED


def test_after_window_higher_price_publishes():
    assert run(Decimal("20.00"), last(age=timedelta(days=8))) == OfferStatus.PUBLISHED


def test_ended_publishes():
    l = last(status=PublicationStatus.ENDED)
    assert run(Decimal("10.00"), l) == OfferStatus.PUBLISHED


def test_stale_31_minutes():
    assert run(Decimal("10.00"), None, NOW - timedelta(minutes=31)) == OfferStatus.SKIPPED_STALE
    assert run(Decimal("10.00"), None, NOW - timedelta(minutes=30)) == OfferStatus.PUBLISHED


def test_no_price_wins_over_stale():
    assert run(None, None, NOW - timedelta(hours=2)) == OfferStatus.SKIPPED_NO_PRICE
