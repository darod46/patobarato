import httpx

from patobarato.sources.generic_page import og_image

URL = "https://www.pccomponentes.com/x"


def client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def page(meta: str) -> httpx.Response:
    return httpx.Response(200, text=f"<html><head>{meta}</head></html>")


async def test_property_content():
    http = client(lambda r: page('<meta property="og:image" content="https://i.example/a.jpg">'))
    assert await og_image(http, URL) == "https://i.example/a.jpg"


async def test_swapped_order_name_and_entities():
    http = client(lambda r: page('<meta content="https://i.example/a.jpg?w=1&amp;h=2" name="og:image"/>'))
    assert await og_image(http, URL) == "https://i.example/a.jpg?w=1&h=2"


async def test_sends_browser_headers_and_follows_redirects():
    seen = {}

    def handler(request):
        if request.url.path == "/x":
            return httpx.Response(302, headers={"location": "https://www.pccomponentes.com/y"})
        seen["ua"] = request.headers["user-agent"]
        return page('<meta property="og:image" content="https://i.example/b.jpg">')

    assert await og_image(client(handler), URL) == "https://i.example/b.jpg"
    assert "Mozilla" in seen["ua"]


async def test_failures_return_none():
    assert await og_image(client(lambda r: httpx.Response(403)), URL) is None
    assert await og_image(client(lambda r: page("<title>x</title>")), URL) is None

    def boom(request):
        raise httpx.ConnectError("down")

    assert await og_image(client(boom), URL) is None


from decimal import Decimal
from pathlib import Path

from patobarato.sources.generic_page import ProductMeta, fetch_product_meta, product_meta

FIXTURES = Path(__file__).parent / "fixtures"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_product_meta_json_ld_offer():
    meta = product_meta(fixture("pccomponentes_product.html"))
    assert meta == ProductMeta(
        image_url="https://img.pccomponentes.com/articles/ninja-af300.jpg",
        price=Decimal("89.99"),
        previous_price=None,
        currency="EUR",
    )


def test_product_meta_aggregate_offer_low_price():
    meta = product_meta(fixture("mediamarkt_product.html"))
    assert meta.price == Decimal("199.00")
    assert meta.currency == "EUR"
    assert meta.image_url == "https://assets.mmsrg.com/isr/166325/roborock-q7.jpg"


def test_product_meta_meta_tags_fallback():
    meta = product_meta(fixture("elcorteingles_product.html"))
    assert meta.price == Decimal("149.90")
    assert meta.currency == "EUR"
    assert meta.image_url == "https://sgfm.elcorteingles.es/SGFM/dctm/conga3490.jpg"


def test_product_meta_without_price():
    meta = product_meta('<head><meta property="og:image" content="https://i.example/a.jpg"></head>')
    assert meta == ProductMeta("https://i.example/a.jpg", None, None, None)


def test_product_meta_json_ld_in_graph():
    page = (
        '<script type="application/ld+json">{"@graph":[{"@type":"Organization"},'
        '{"@type":"Product","offers":[{"@type":"Offer"},{"@type":"Offer","price":"1.234,50","priceCurrency":"EUR"}]}]}'
        "</script>"
    )
    assert product_meta(page).price == Decimal("1234.50")


def test_product_meta_tolerates_invalid_json_and_list_root():
    page = (
        '<script type="application/ld+json">{not json</script>'
        '<script type="application/ld+json">[{"@type":"Product","offers":{"price":12.5,"priceCurrency":"EUR"}}]</script>'
    )
    assert product_meta(page).price == Decimal("12.50")


def test_product_meta_ignores_unusable_price():
    page = '<script type="application/ld+json">{"@type":"Product","offers":{"price":"gratis"}}</script>'
    assert product_meta(page).price is None


async def test_fetch_product_meta():
    http = client(lambda r: httpx.Response(200, text=fixture("pccomponentes_product.html")))
    meta = await fetch_product_meta(http, URL)
    assert meta is not None and meta.price == Decimal("89.99")
    assert await fetch_product_meta(client(lambda r: httpx.Response(500)), URL) is None


import pytest


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1.234", None),
        ("1,234", None),
        ("-5", None),
        ("1e3", None),
        ("0.004", None),
        ("12.345", None),
        ("1.234,56", Decimal("1234.56")),
        ("1,234.56", Decimal("1234.56")),
        ("89,99", Decimal("89.99")),
        ("12.5", Decimal("12.50")),
        ("0", None),
        (1e-7, None),
        (12.5, Decimal("12.50")),
        (1000, Decimal("1000.00")),
        (1.234, None),
        (89.999, None),
        (0.006, None),
        (89.99, Decimal("89.99")),
        (90, Decimal("90.00")),
    ],
)
def test_price_parsing_is_strict(raw, expected):
    import json as _json

    page = '<script type="application/ld+json">%s</script>' % _json.dumps(
        {"@type": "Product", "offers": {"price": raw}}
    )
    assert product_meta(page).price == expected


def _two_products() -> str:
    a = '{"@type":"Product","url":"https://s.example/a","offers":{"price":"10.00","priceCurrency":"EUR"}}'
    b = '{"@type":"Product","url":"https://s.example/b","offers":{"price":"20.00","priceCurrency":"EUR"}}'
    return f'<script type="application/ld+json">{b}</script><script type="application/ld+json">{a}</script>'


def test_conflicting_products_without_url_match_is_none():
    assert product_meta(_two_products()).price is None
    assert product_meta(_two_products(), "https://s.example/zzz").price is None


def test_conflicting_products_prefers_url_match():
    assert product_meta(_two_products(), "https://s.example/a/").price == Decimal("10.00")


def test_agreeing_products_return_price():
    one = '{"@type":"Product","offers":{"price":"10.00"}}'
    page = f'<script type="application/ld+json">[{one},{one}]</script>'
    assert product_meta(page).price == Decimal("10.00")


def test_deep_nesting_does_not_raise():
    deep = '{"@graph":' * 3000 + "[]" + "}" * 3000
    page = f'<script type="application/ld+json">{deep}</script>'
    assert product_meta(page).price is None
    nested = '{"@graph":' * 50 + '{"@type":"Product","offers":{"price":"5"}}' + "}" * 50
    assert product_meta(f'<script type="application/ld+json">{nested}</script>').price is None


async def test_fetch_never_raises():
    def boom(request):
        raise ValueError("bad")

    assert await fetch_product_meta(client(boom), URL) is None
    assert await og_image(client(boom), URL) is None
    assert await og_image(client(lambda r: httpx.Response(200)), "http://[bad") is None


def test_json_ld_currency_falls_back_to_meta():
    page = (
        '<meta property="product:price:currency" content="eur">'
        '<script type="application/ld+json">{"@type":"Product","offers":{"price":"9.99"}}</script>'
    )
    assert product_meta(page).currency == "EUR"


def test_json_ld_parsed_before_unescape():
    page = '<script type="application/ld+json">{"@type":"Product","name":"A &quot;x&quot;","offers":{"price":"9.99"}}</script>'
    assert product_meta(page).price == Decimal("9.99")
