import hmac
import json
from datetime import date
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from urllib.parse import parse_qs

import httpx
import pytest

from patobarato.stores.aliexpress_client import AliExpressClient, AliExpressError, AliProduct

FIX = Path(__file__).parent / "fixtures"


def fixture(name: str) -> dict:
    return json.loads((FIX / name).read_text())


def make_client(handler, http=None) -> AliExpressClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AliExpressClient(http, "key", "secret", "track", clock=lambda: 1700000000.123)


def form(request: httpx.Request) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(request.content.decode()).items()}


def test_sign_vector():
    client = AliExpressClient(None, "k", "s3cret", "t")  # type: ignore[arg-type]
    params = {"timestamp": "1", "method": "x", "app_key": "k"}
    expected = hmac.new(b"s3cret", b"app_keykmethodxtimestamp1", sha256).hexdigest().upper()
    assert client.sign(params) == expected


def test_sign_ignores_sign_param():
    client = AliExpressClient(None, "k", "s", "t")  # type: ignore[arg-type]
    assert client.sign({"a": "1", "sign": "zzz"}) == client.sign({"a": "1"})


async def test_call_sends_system_params_and_signature():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["ctype"] = request.headers["content-type"]
        seen["form"] = form(request)
        return httpx.Response(200, json={"ok": {"resp_result": {"resp_code": 200}}})

    client = make_client(handler)
    await client.call("aliexpress.affiliate.x", foo="bar")
    f = seen["form"]
    assert seen["url"] == "https://api-sg.aliexpress.com/sync"
    assert seen["ctype"].startswith("application/x-www-form-urlencoded")
    assert f["sign_method"] == "sha256" and f["v"] == "2.0" and f["format"] == "json"
    assert f["app_key"] == "key" and f["method"] == "aliexpress.affiliate.x"
    assert f["timestamp"] == "1700000000123" and f["foo"] == "bar"
    assert f["sign"] == client.sign({k: v for k, v in f.items() if k != "sign"})
    assert "secret" not in json.dumps(f)


async def test_call_error_response_raises():
    body = {"error_response": {"code": "IllegalAccessToken", "msg": "bad token"}}
    client = make_client(lambda r: httpx.Response(200, json=body))
    with pytest.raises(AliExpressError) as exc:
        await client.call("m")
    assert exc.value.code == "IllegalAccessToken" and "bad token" in str(exc.value)


async def test_call_bad_resp_code_raises():
    body = {"x_response": {"resp_result": {"resp_code": 405, "resp_msg": "no"}}}
    client = make_client(lambda r: httpx.Response(200, json=body))
    with pytest.raises(AliExpressError) as exc:
        await client.call("m")
    assert exc.value.code == "405"


async def test_call_http_error_propagates():
    client = make_client(lambda r: httpx.Response(500))
    with pytest.raises(httpx.HTTPStatusError):
        await client.call("m")


async def test_link_generate():
    seen = {}

    def handler(request):
        seen.update(form(request))
        return httpx.Response(200, json=fixture("aliexpress_link_generate.json"))

    client = make_client(handler)
    link = await client.link_generate("https://es.aliexpress.com/item/1005006123456789.html")
    assert link == "https://s.click.aliexpress.com/e/_oAbCdEf"
    assert seen["tracking_id"] == "track"
    assert seen["method"] == "aliexpress.affiliate.link.generate"


async def test_product_detail():
    seen = {}

    def handler(request):
        seen.update(form(request))
        return httpx.Response(200, json=fixture("aliexpress_productdetail.json"))

    client = make_client(handler)
    product = await client.product_detail("1005006123456789")
    assert product == AliProduct(
        product_id="1005006123456789",
        title="Auriculares Bluetooth",
        price=Decimal("12.34"),
        original_price=Decimal("21.28"),
        discount=42,
        image_url="https://ae01.alicdn.com/kf/Sabc.jpg",
        url="https://www.aliexpress.com/item/1005006123456789.html",
        promotion_link="https://s.click.aliexpress.com/e/_oAbCdEf",
    )
    assert seen["product_ids"] == "1005006123456789"


async def test_product_detail_empty_is_none():
    body = {"aliexpress_affiliate_productdetail_get_response": {"resp_result": {
        "resp_code": 200, "result": {"products": {"product": []}}}}}
    client = make_client(lambda r: httpx.Response(200, json=body))
    assert await client.product_detail("1") is None


async def test_hot_products():
    seen = {}

    def handler(request):
        seen.update(form(request))
        return httpx.Response(200, json=fixture("aliexpress_hotproduct.json"))

    client = make_client(handler)
    products = await client.hot_products(["1", "2"], "usb", 20, 3)
    assert [p.product_id for p in products] == ["1005006123456789", "1005007000000001"]
    assert products[1].original_price is None and products[1].discount is None
    assert products[1].image_url is None and products[1].promotion_link is None
    assert seen["category_ids"] == "1,2" and seen["keywords"] == "usb"
    assert seen["page_size"] == "20" and seen["page_no"] == "3"
    assert seen["target_currency"] == "EUR" and seen["tracking_id"] == "track"


async def test_featured_promos_parses_names_and_dates():
    client = make_client(lambda r: httpx.Response(200, json=fixture("aliexpress_featuredpromo_get.json")))
    promos = await client.featured_promos()
    assert [p.name for p in promos] == ["11.11 Big Sale", "Choice Day"]
    assert promos[0].start == date(2026, 11, 11) and promos[0].end == date(2026, 11, 13)
    assert promos[1].start is None and promos[1].end is None


async def test_featured_promo_products_sends_params_and_skips_invalid():
    seen = {}

    def handler(r):
        seen.update(form(r))
        return httpx.Response(200, json=fixture("aliexpress_featuredpromo_products.json"))

    page = await make_client(handler).featured_promo_products("11.11 Big Sale", page_no=2, page_size=50)
    assert seen["method"] == "aliexpress.affiliate.featuredpromo.products.get"
    assert seen["promo_name"] == "11.11 Big Sale" and seen["page_no"] == "2" and seen["page_size"] == "50"
    assert seen["tracking_id"] == "track" and seen["target_currency"] == "EUR"
    assert [p.product_id for p in page.products] == ["1001"]
    assert page.has_more is True  # 2 * 50 < 120


async def test_featured_promo_products_last_page():
    body = fixture("aliexpress_featuredpromo_products.json")
    body["aliexpress_affiliate_featuredpromo_products_get_response"]["resp_result"]["result"][
        "total_record_count"
    ] = 60
    page = await make_client(lambda r: httpx.Response(200, json=body)).featured_promo_products("x", page_no=2)
    assert page.has_more is False


async def test_featured_promo_products_logs_skipped_count_only(caplog):
    caplog.set_level("INFO", logger="patobarato.aliexpress")
    client = make_client(lambda r: httpx.Response(200, json=fixture("aliexpress_featuredpromo_products.json")))
    await client.featured_promo_products("11.11 Big Sale")
    messages = [r.getMessage() for r in caplog.records]
    assert "featuredpromo 11.11 Big Sale: skipped 2 products without price or link" in messages
    assert not any("s.click" in m for m in messages)
