import httpx
import pytest

from patobarato.stores.amazon import AmazonStore
from patobarato.stores.registry import StoreRegistry

URL = "https://www.amazon.es/dp/B09XS7JWHH"


@pytest.fixture
def amazon() -> AmazonStore:
    return AmazonStore("patobarato-21", None)


def test_identity(amazon):
    assert amazon.id == "amazon"
    assert amazon.name == "Amazon"


def test_matches(amazon):
    assert amazon.matches(URL)
    assert not amazon.matches("https://es.aliexpress.com/item/1.html")


def test_product_id(amazon):
    assert amazon.product_id(URL) == "B09XS7JWHH"
    assert amazon.product_id("https://www.amazon.es/") is None


def test_canonical_url(amazon):
    assert amazon.canonical_url("B09XS7JWHH", "ES") == URL


def test_canonical_for_defaults_to_product_id(amazon):
    assert amazon.canonical_for(f"{URL}?tag=x&ref=y", "ES") == URL


async def test_affiliate_url(amazon):
    assert await amazon.affiliate_url(URL, "B09XS7JWHH") == f"{URL}?tag=patobarato-21"


async def test_find_image_without_http_is_none(amazon):
    assert await amazon.find_image("B09XS7JWHH", URL) is None


async def test_find_image_none_when_no_finder_has_one():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        store = AmazonStore("patobarato-21", client)
        assert await store.find_image("B09XS7JWHH", URL) is None


async def test_find_image_uses_amazon_page():
    page = (
        '<img id="landingImage" '
        'data-old-hires="https://m.media-amazon.com/images/I/abc._AC_SL1500_.jpg">'
    )

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=page)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        store = AmazonStore("patobarato-21", client)
        image = await store.find_image("B09XS7JWHH", URL)
    assert image is not None and image.startswith("https://m.media-amazon.com/images/I/abc")


def test_registry(amazon):
    registry = StoreRegistry([amazon])
    assert registry.store_for(URL) is amazon
    assert registry.store_for("https://example.com/x") is None
    assert registry.get("amazon") is amazon
    assert registry.get("nope") is None
    assert registry.ids == ["amazon"]


# --- fetch_price --------------------------------------------------------------------

from decimal import Decimal  # noqa: E402
from pathlib import Path  # noqa: E402

_FIXTURES = Path(__file__).parent / "fixtures"


def _serve(name: str):
    page = (_FIXTURES / name).read_text(encoding="utf-8")
    return httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, text=page))
    )


async def test_amazon_store_fetch_price_returns_quote_with_image():
    async with _serve("amazon_price.html") as client:
        quote = await AmazonStore("patobarato-21", client).fetch_price("B09XS7JWHH", URL)
    assert quote is not None
    assert quote.price == Decimal("1234.56")
    assert quote.previous_price == Decimal("1499.00")
    assert quote.image_url == "https://m.media-amazon.com/images/I/71ESx2oXXVL._AC_SL500_.jpg"


async def test_amazon_store_fetch_price_captcha_is_none():
    async with _serve("amazon_captcha.html") as client:
        assert await AmazonStore("patobarato-21", client).fetch_price("B09XS7JWHH", URL) is None


async def test_amazon_store_fetch_price_without_buybox_or_http_is_none(amazon):
    async with _serve("amazon_no_price.html") as client:
        assert await AmazonStore("patobarato-21", client).fetch_price("B09XS7JWHH", URL) is None
    assert await amazon.fetch_price("B09XS7JWHH", URL) is None


async def test_fetch_price_no_buybox_log_includes_page_title(caplog):
    import logging

    async with _serve("amazon_no_price.html") as client:
        with caplog.at_level(logging.WARNING, logger="patobarato.amazon"):
            await AmazonStore("patobarato-21", client).fetch_price("B09XS7JWHH", URL)
    assert any("Producto agotado" in r.getMessage() for r in caplog.records)
