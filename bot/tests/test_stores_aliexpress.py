import json
from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from patobarato.models import PriceQuote
from patobarato.stores.aliexpress import AliExpressStore
from patobarato.stores.aliexpress_client import AliExpressClient, AliExpressError, AliProduct
from patobarato.stores.registry import StoreRegistry

FIX = Path(__file__).parent / "fixtures"
URL = "https://es.aliexpress.com/item/1005006123456789.html"


def store_with(handler) -> AliExpressStore:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AliExpressStore(AliExpressClient(http, "k", "s", "t"))


@pytest.fixture
def ali() -> AliExpressStore:
    return store_with(lambda r: httpx.Response(500))


def test_identity(ali):
    assert (ali.id, ali.name) == ("aliexpress", "AliExpress")


def test_matches(ali):
    assert ali.matches("https://www.aliexpress.com/item/1.html")
    assert ali.matches("https://es.aliexpress.com/item/1.html")
    assert ali.matches("https://aliexpress.us/item/1.html")
    assert not ali.matches("https://s.click.aliexpress.com/e/_abc")
    assert not ali.matches("https://a.aliexpress.com/_abc")
    assert not ali.matches("https://www.amazon.es/dp/B09XS7JWHH")
    assert not ali.matches("https://notaliexpress.com/item/1.html")


def test_shorteners(ali):
    assert ali.is_shortener("https://s.click.aliexpress.com/e/_abc")
    assert ali.is_shortener("https://a.aliexpress.com/_abc")
    assert not ali.is_shortener(URL)


def test_product_id(ali):
    assert ali.product_id(f"{URL}?spm=x") == "1005006123456789"
    assert ali.product_id("https://www.aliexpress.com/i/1005006123456789.html") == "1005006123456789"
    assert ali.product_id("https://www.aliexpress.com/") is None


def test_canonical(ali):
    assert ali.canonical_url("1005006123456789", "ES") == URL
    assert ali.canonical_for(f"https://www.aliexpress.com/item/1005006123456789.html?x=1", "ES") == URL


async def test_affiliate_url():
    body = json.loads((FIX / "aliexpress_link_generate.json").read_text())
    store = store_with(lambda r: httpx.Response(200, json=body))
    assert await store.affiliate_url(URL, "1005006123456789") == "https://s.click.aliexpress.com/e/_oAbCdEf"


async def test_affiliate_url_error_propagates():
    store = store_with(lambda r: httpx.Response(500))
    with pytest.raises(httpx.HTTPStatusError):
        await store.affiliate_url(URL, "1")


async def test_find_image():
    body = json.loads((FIX / "aliexpress_productdetail.json").read_text())
    store = store_with(lambda r: httpx.Response(200, json=body))
    assert await store.find_image("1005006123456789", URL) == "https://ae01.alicdn.com/kf/Sabc.jpg"


async def test_find_image_errors_are_none():
    assert await store_with(lambda r: httpx.Response(500)).find_image("1", URL) is None
    err = {"error_response": {"code": "x", "msg": "y"}}
    assert await store_with(lambda r: httpx.Response(200, json=err)).find_image("1", URL) is None


class FakeClient:
    def __init__(self, product=None, error=None):
        self.product = product
        self.error = error

    async def product_detail(self, product_id):
        if self.error is not None:
            raise self.error
        return self.product


def product(price: str, original: str | None) -> AliProduct:
    return AliProduct(
        product_id="1005006123456789",
        title="Auriculares",
        price=Decimal(price),
        original_price=Decimal(original) if original else None,
        discount=None,
        image_url="https://ae01.alicdn.com/kf/Sabc.jpg",
        url=URL,
        promotion_link=None,
    )


async def test_fetch_price_maps_product_detail():
    store = AliExpressStore(FakeClient(product=product("89.99", "119.99")))
    quote = await store.fetch_price("1005006123456789", URL)
    assert quote == PriceQuote(
        price=Decimal("89.99"),
        previous_price=Decimal("119.99"),
        image_url="https://ae01.alicdn.com/kf/Sabc.jpg",
    )


async def test_fetch_price_without_original_has_no_previous():
    store = AliExpressStore(FakeClient(product=product("89.99", None)))
    quote = await store.fetch_price("1005006123456789", URL)
    assert quote is not None
    assert quote.price == Decimal("89.99")
    assert quote.previous_price is None


async def test_fetch_price_api_error_is_none_and_logged(caplog):
    store = AliExpressStore(FakeClient(error=AliExpressError("50001", "invalid session")))
    assert await store.fetch_price("1005006123456789", URL) is None
    assert "AliExpressError" in caplog.text
    assert URL not in caplog.text


def test_registry(ali):
    assert StoreRegistry([ali]).store_for(URL) is ali
