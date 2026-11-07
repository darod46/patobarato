import json
import logging
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from patobarato.sources import awin_source
from patobarato.sources.awin_source import AwinClient, AwinFeedError, parse_feed_line

FEED = (Path(__file__).parent / "fixtures" / "awin_feed.jsonl").read_bytes()
LINES = FEED.decode().splitlines()


def _client(handler) -> AwinClient:
    return AwinClient(httpx.AsyncClient(transport=httpx.MockTransport(handler)), "999", "tok")


def _ok(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, content=FEED, headers={"content-type": "text/plain"})


def test_parse_feed_line_maps_fields():
    product = parse_feed_line(LINES[0])
    assert product.external_id == "1"
    assert product.title == "Product 1"
    assert product.brand == "Acme"
    assert product.category == "Electronics"
    assert product.price == Decimal("19.99")
    assert product.sale_price == Decimal("14.99")
    assert product.in_stock is True
    assert product.url == "https://shop.example/p/1"
    assert product.affiliate_url.startswith("https://www.awin1.com/")
    assert parse_feed_line(LINES[1]).in_stock is False
    assert parse_feed_line(LINES[1]).category == "Home > Lamps"
    assert len(parse_feed_line(LINES[2]).description) == 500
    assert parse_feed_line(LINES[4]).in_stock is True  # "in_stock"


def test_parse_feed_line_drops_invalid_price():
    assert parse_feed_line(LINES[6]) is None


def test_parse_feed_line_ignores_sale_price_not_lower():
    product = parse_feed_line(LINES[7])
    assert product is not None
    assert product.sale_price is None


def test_parse_feed_line_drops_without_affiliate_link():
    assert parse_feed_line(LINES[8]) is None


def test_parse_feed_line_defaults_in_stock_and_optionals():
    product = parse_feed_line(LINES[5])
    assert product.brand is None and product.gtin is None and product.image_url is None
    line = json.dumps({"id": 1, "title": "t", "price": "1.00", "link": "https://a", "aw_deep_link": "https://b"})
    assert parse_feed_line(line).in_stock is True


async def test_download_feed_streams_products_and_raises_on_error_line():
    client = _client(_ok)
    got = []
    with pytest.raises(AwinFeedError, match="Feed not found"):
        async for product in client.download_feed(123):
            got.append(product)
    assert len(got) == 7


async def test_download_feed_stops_at_line_cap(monkeypatch, caplog):
    monkeypatch.setattr(awin_source, "MAX_FEED_LINES", 3)
    caplog.set_level(logging.WARNING, logger="patobarato.awin_source")
    got = [p async for p in _client(_ok).download_feed(123)]
    assert len(got) == 3
    assert any(r.levelno == logging.WARNING and "123" in r.getMessage() for r in caplog.records)


def test_feed_url_shape():
    assert _client(_ok).feed_url(123, "es_ES") == (
        "https://api.awin.com/publishers/999/awinfeeds/download/123-retail-es_ES.jsonl"
    )


async def test_download_feed_sends_bearer_and_skips_bad_json():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, content=b"\nnot json\n" + LINES[0].encode() + b"\n")

    got = [p async for p in _client(handler).download_feed(1)]
    assert seen["auth"] == "Bearer tok"
    assert len(got) == 1


async def test_download_feed_http_error_raises_feed_error():
    client = _client(lambda _r: httpx.Response(401))
    with pytest.raises(AwinFeedError) as exc:
        async for _ in client.download_feed(123):
            pass
    assert "401" in str(exc.value)
    assert "api.awin.com" not in str(exc.value)


def _line(**kw) -> str:
    d = {"id": 1, "title": "t", "price": "1.00", "link": "https://a", "aw_deep_link": "https://b"}
    d.update(kw)
    return json.dumps(d)


@pytest.mark.parametrize(
    ("price", "expected"),
    [("19.99 EUR", "19.99"), ("1234.50 EUR", "1234.50"), ("1.234,50 EUR", "1234.50"), ("19.99eur", "19.99")],
)
def test_parse_feed_line_accepts_eur_suffixed_price(price, expected):
    assert parse_feed_line(_line(price=price)).price == Decimal(expected)


def test_parse_feed_line_drops_other_currency():
    assert parse_feed_line(_line(price="19.99 USD")) is None


def test_parse_feed_line_accepts_suffixed_sale_price():
    product = parse_feed_line(_line(price="19.99 EUR", sale_price="14.99 EUR"))
    assert product.sale_price == Decimal("14.99")
    assert parse_feed_line(_line(price="19.99 EUR", sale_price="9.99 USD")).sale_price is None


def test_parse_feed_line_availability_normalisation():
    assert parse_feed_line(_line(availability="In_Stock")).in_stock is True
    assert parse_feed_line(_line(availability="preorder")).in_stock is False


async def test_download_feed_network_error_hides_url(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom", request=request)

    caplog.set_level(logging.DEBUG, logger="patobarato.awin_source")
    with pytest.raises(AwinFeedError) as exc:
        async for _ in _client(handler).download_feed(123):
            pass
    assert str(exc.value) == "ConnectError"
    assert all("http" not in r.getMessage() for r in caplog.records)


async def test_download_feed_logs_totals_without_urls(caplog):
    caplog.set_level(logging.DEBUG, logger="patobarato.awin_source")
    with pytest.raises(AwinFeedError):
        async for _ in _client(_ok).download_feed(123):
            pass
    messages = [r.getMessage() for r in caplog.records]
    assert any("yielded=7" in m and "truncated=False" in m for m in messages)
    assert all("http" not in m for m in messages)
