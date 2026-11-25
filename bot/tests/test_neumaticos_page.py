from decimal import Decimal
from pathlib import Path

import httpx
import pytest

from patobarato.sources.neumaticos_page import extract_min_price
from patobarato.stores.awin import awin_store

FIXTURES = Path(__file__).parent / "fixtures"
URL = "https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2/108+200+201+202+205"


def load_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def store(http=None):
    return awin_store("neumaticos", None, None, http)


def test_extract_min_price_fixture():
    assert extract_min_price(load_fixture("neumaticos_model_size.html")) == Decimal("98.01")


def test_extract_min_price_text_and_attribute_forms():
    assert extract_min_price('<span itemprop="price">1.098,01 €</span><span itemprop="price">120,50 €</span>') == Decimal("120.50")
    assert extract_min_price('<meta itemprop="price" content="98.01"><meta itemprop="price" content="101.5">') == Decimal("98.01")


def test_extract_min_price_none_without_itemprop():
    assert extract_min_price("<html>98,01 €</html>") is None


def test_product_id_accepts_model_size():
    s = store()
    assert s.product_id(URL) == "michelin-205-55-16-crossclimate_2"
    assert s.product_id("https://neumaticos.es/neumaticos/hankook-215-65-16c-vantra_lt/1+2") == "hankook-215-65-16c-vantra_lt"


@pytest.mark.parametrize(
    "url",
    [
        "https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2",
        "https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2/",
        "https://www.neumaticos.es/neumaticos/michelin/108",
        "https://www.neumaticos.es/neumaticos/michelin-205-55-16-crossclimate_2/abc",
        "https://www.neumaticos.es/",
    ],
)
def test_product_id_rejects(url):
    assert store().product_id(url) is None


@pytest.mark.asyncio
async def test_fetch_price_returns_min():
    text = load_fixture("neumaticos_model_size.html")
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text=text)))
    s = store(http)
    quote = await s.fetch_price("michelin-205-55-16-crossclimate_2", URL)
    assert quote is not None
    assert (quote.price, quote.previous_price, quote.currency, quote.image_url) == (Decimal("98.01"), None, "EUR", None)
    assert s.last_failure is None


@pytest.mark.asyncio
async def test_fetch_price_without_price_sets_last_failure():
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, text="<html></html>")))
    s = store(http)
    assert await s.fetch_price("x", URL) is None
    assert s.last_failure == "no price in page"


@pytest.mark.asyncio
async def test_fetch_price_http_error_sets_status_failure():
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(403, text="blocked")))
    s = store(http)
    assert await s.fetch_price("x", URL) is None
    assert s.last_failure == "HTTP 403"


@pytest.mark.asyncio
async def test_fetch_price_network_error_sets_exception_failure():
    def boom(request):
        raise httpx.ConnectError("down")

    s = store(httpx.AsyncClient(transport=httpx.MockTransport(boom)))
    assert await s.fetch_price("x", URL) is None
    assert s.last_failure == "ConnectError"


def test_product_id_accepts_brand_with_underscore():
    assert store().product_id("https://www.neumaticos.es/neumaticos/bf_goodrich-205-55-16-g_grip/1+2") == "bf_goodrich-205-55-16-g_grip"


def test_extract_min_price_reads_dot_thousands_without_decimals():
    assert extract_min_price('<span itemprop="price">1.098 €</span>') == Decimal("1098")
    assert extract_min_price('<span itemprop="price">12.345.678 €</span>') == Decimal("12345678")
    assert extract_min_price('<meta itemprop="price" content="98.01">') == Decimal("98.01")
