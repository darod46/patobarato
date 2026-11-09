from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from patobarato.sources.chollometro_parse import (
    parse_euros,
    parse_listing,
    parse_thread_page,
)

FIX = Path(__file__).parent / "fixtures"


def _read(name: str) -> str:
    return (FIX / name).read_text(encoding="utf-8")


def test_listing_parses_all_threads():
    threads = parse_listing(_read("chollometro_nuevos.html"))
    assert len(threads) == 30
    assert len({t.thread_id for t in threads}) == 30


def test_listing_thread_fields():
    t = parse_listing(_read("chollometro_nuevos.html"))[0]
    assert t.thread_id == 2060930
    assert t.title == "One Piece Calendario Perpetuo Going Merry"
    assert t.merchant == "Amazon"
    assert t.price == Decimal("27.29")
    assert t.previous_price == Decimal("34.95")
    assert t.temperature == 0
    assert t.visit_url == "https://www.chollometro.com/visit/homenew/2060930"
    assert t.url == (
        "https://www.chollometro.com/ofertas/"
        "one-piece-calendario-perpetuo-going-merry-2060930"
    )
    assert t.published_at == datetime.fromtimestamp(1794238244, UTC)
    assert t.published_at.tzinfo is not None
    assert t.expired is False
    assert t.sold_out is False
    assert t.categories and len(set(t.categories)) == len(t.categories)


def test_listing_all_have_visit_url_and_null_merchant_ok():
    threads = parse_listing(_read("chollometro_nuevos.html"))
    assert all(t.visit_url and t.visit_url.startswith("https://") for t in threads)
    assert any(t.merchant is None for t in threads)
    assert any(t.price is None for t in threads)  # the voucher


def test_listing_voucher_has_discount_and_coupon():
    by_id = {t.thread_id: t for t in parse_listing(_read("chollometro_nuevos.html"))}
    assert by_id[2060912].discount == 10
    assert by_id[2060912].coupon


def test_listing_expired_thread():
    by_id = {
        t.thread_id: t for t in parse_listing(_read("chollometro_nuevos_old.html"))
    }
    assert by_id[2049042].expired is True
    assert by_id[2049042].coupon == "EXTRA30"
    assert by_id[2049042].price == Decimal("50")


def test_thread_page_active():
    t = parse_thread_page(_read("chollometro_thread_active.html"))
    assert t is not None
    assert t.expired is False
    assert t.thread_id == 2060928
    assert t.title == "LEGO Botanicals Margaritas"
    assert t.merchant == "Amazon"
    assert t.price == Decimal("10.49")
    assert t.previous_price == Decimal("14.99")
    assert t.url == (
        "https://www.chollometro.com/ofertas/lego-botanicals-margaritas-2060928"
    )
    assert t.visit_url == "https://www.chollometro.com/visit/threadmain/2060928"
    assert len(t.categories) >= 2
    assert t.published_at.tzinfo is not None


def test_thread_page_expired():
    t = parse_thread_page(_read("chollometro_thread_expired.html"))
    assert t is not None
    assert t.expired is True
    assert t.thread_id == 2049042
    assert t.coupon == "EXTRA30"


def test_thread_page_sold_out_is_never_set():
    t = parse_thread_page(_read("chollometro_thread_expired.html"))
    assert t is not None and t.sold_out is False


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("7,79€", Decimal("7.79")),
        ("1.299,00 €", Decimal("1299.00")),
        ("669€", Decimal("669")),
        (12.5, Decimal("12.5")),
        (0, None),
        (None, None),
        ("", None),
        ("Gratis", None),
    ],
)
def test_parse_euros(raw, expected):
    assert parse_euros(raw) == expected


def test_garbage_html_returns_empty():
    assert parse_listing("<html></html>") == []
    assert parse_thread_page("") is None
    assert parse_thread_page("<html>window.__INITIAL_STATE__ = {oops};</html>") is None


def test_malformed_thread_json_is_skipped():
    good = _read("chollometro_nuevos.html")
    bad = (
        "<div data-vue3='{\"name\":\"ThreadMainListItemNormalizer\","
        '"props":{broken\'></div>'
    )
    assert len(parse_listing(bad + good)) == 30
