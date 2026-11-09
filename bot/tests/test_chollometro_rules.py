from datetime import UTC, datetime
from decimal import Decimal

import pytest

from patobarato.models import ChollometroThread, PriceQuote
from patobarato.sources.chollometro_rules import (
    discount_of,
    qualifies,
    rank_key,
    reconcile_price,
)


def _thread(
    temperature: float = 0.0,
    price: str | None = "60",
    previous: str | None = None,
    discount: int | None = None,
) -> ChollometroThread:
    return ChollometroThread(
        thread_id=1,
        title="Cosa",
        url="https://www.chollometro.com/ofertas/cosa-1",
        visit_url="https://www.chollometro.com/visit/homenew/1",
        merchant="Amazon",
        price=Decimal(price) if price is not None else None,
        previous_price=Decimal(previous) if previous is not None else None,
        discount=discount,
        temperature=temperature,
        expired=False,
        sold_out=False,
        coupon=None,
        categories=[],
        published_at=datetime(2026, 11, 9, 12, 0, tzinfo=UTC),
    )


@pytest.mark.parametrize(
    ("temperature", "discount", "expected"),
    [(51, None, True), (50, 39, False), (5, 40, True), (50, None, False)],
)
def test_qualifies(temperature, discount, expected):
    thread = _thread(temperature=temperature, price=None, discount=discount)
    assert qualifies(thread, 50, 40) is expected


def test_discount_of_computes_from_prices():
    assert discount_of(_thread(price="60", previous="100")) == 40


def test_discount_of_prefers_chollometro_value():
    assert discount_of(_thread(price="60", previous="100", discount=10)) == 10


def test_discount_of_without_data_is_none():
    assert discount_of(_thread(price="60", previous=None)) is None
    assert discount_of(_thread(price=None, previous="100")) is None
    assert discount_of(_thread(price="60", previous="50")) is None


def test_rank_key_orders_by_temperature_then_discount():
    items = [(60, None), (60, 40), (80, 10), (60, 70)]
    ordered = sorted(items, key=lambda item: rank_key(*item))
    assert ordered == [(80, 10), (60, 70), (60, 40), (60, None)]


def _quote(price: str, previous: str | None = None) -> PriceQuote:
    return PriceQuote(
        price=Decimal(price), previous_price=Decimal(previous) if previous else None
    )


def test_reconcile_lower_store_price_wins():
    assert reconcile_price(Decimal("20"), None, _quote("18", "30")) == (
        Decimal("18"),
        Decimal("30"),
    )


def test_reconcile_higher_store_price_without_coupon_is_mismatch():
    assert reconcile_price(Decimal("20"), None, _quote("25", "30")) is None


def test_reconcile_higher_store_price_with_coupon_keeps_chollometro_price():
    assert reconcile_price(Decimal("20"), "CODIGO", _quote("25", "30")) == (Decimal("20"), None)


def test_reconcile_without_quote_trusts_chollometro():
    assert reconcile_price(Decimal("20"), None, None) == (Decimal("20"), None)


def test_reconcile_store_previous_only_when_above_price():
    assert reconcile_price(Decimal("20"), None, _quote("20", "20")) == (Decimal("20"), None)
