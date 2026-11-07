import logging

import httpx
import pytest

from patobarato.sources.amazon_page import (
    AmazonImageFinder,
    extract_image_url,
    resize_image_url,
)

HIRES = "https://m.media-amazon.com/images/I/71ESx2oXXVL._AC_SL1500_.jpg"
SMALL = "https://m.media-amazon.com/images/I/71ESx2oXXVL._AC_SY355_.jpg"


def test_extract_prefers_landing_image_old_hires():
    html = (
        f'<img alt="x" id="landingImage" data-old-hires="{HIRES}" '
        f'data-a-dynamic-image="{{&quot;{SMALL}&quot;:[355,355]}}">'
    )
    assert extract_image_url(html) == HIRES


def test_extract_falls_back_to_hires_in_scripts():
    html = f'<script>var data = {{"colorImages": {{"initial": [{{"hiRes":"{HIRES}"}}]}}}}</script>'
    assert extract_image_url(html) == HIRES


def test_extract_falls_back_to_largest_dynamic_image():
    big = "https://m.media-amazon.com/images/I/AAA._AC_SX679_.jpg"
    html = (
        '<img id="landingImage" data-old-hires="" data-a-dynamic-image="'
        f'{{&quot;{SMALL}&quot;:[355,355],&quot;{big}&quot;:[679,679]}}">'
    )
    assert extract_image_url(html) == big


def test_extract_falls_back_to_og_image():
    html = f'<meta property="og:image" content="{HIRES}">'
    assert extract_image_url(html) == HIRES


def test_extract_returns_none_without_image():
    assert extract_image_url("<html><body>nada</body></html>") is None


def test_extract_ignores_non_amazon_image_hosts():
    html = '<meta property="og:image" content="https://evil.example/x.jpg">'
    assert extract_image_url(html) is None


def test_resize_replaces_size_token():
    assert resize_image_url(HIRES) == (
        "https://m.media-amazon.com/images/I/71ESx2oXXVL._AC_SL500_.jpg"
    )


def test_resize_inserts_size_token_when_missing():
    assert resize_image_url("https://m.media-amazon.com/images/I/71ESx2oXXVL.jpg") == (
        "https://m.media-amazon.com/images/I/71ESx2oXXVL._AC_SL500_.jpg"
    )


def _finder(handler) -> AmazonImageFinder:
    return AmazonImageFinder(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


async def test_finder_requests_product_page_and_returns_resized_image():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=f'<img id="landingImage" data-old-hires="{HIRES}">')

    url = await _finder(handler).find("B0GS1K5XQ8", "ES")

    assert url == "https://m.media-amazon.com/images/I/71ESx2oXXVL._AC_SL500_.jpg"
    assert str(seen[0].url) == "https://www.amazon.es/dp/B0GS1K5XQ8"
    assert seen[0].headers["accept-language"].startswith("es-ES")
    assert "Mozilla" in seen[0].headers["user-agent"]


@pytest.mark.parametrize(
    ("response", "reason"),
    [
        (httpx.Response(503, text="Service Unavailable"), "HTTP 503"),
        (
            httpx.Response(200, text='<form action="/errors/validateCaptcha">'),
            "captcha",
        ),
        (httpx.Response(200, text="<html>sin imagen</html>"), "no image"),
    ],
)
async def test_finder_returns_none_and_logs_reason(response, reason, caplog):
    with caplog.at_level(logging.WARNING, logger="patobarato.amazon"):
        url = await _finder(lambda request: response).find("B0GS1K5XQ8", "ES")

    assert url is None
    assert any(reason in r.getMessage() and "B0GS1K5XQ8" in r.getMessage() for r in caplog.records)


async def test_finder_returns_none_on_network_error(caplog):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timeout", request=request)

    with caplog.at_level(logging.WARNING, logger="patobarato.amazon"):
        assert await _finder(handler).find("B0GS1K5XQ8", "ES") is None
    assert any("B0GS1K5XQ8" in r.getMessage() for r in caplog.records)


async def test_finder_returns_none_for_unknown_country():
    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover
        raise AssertionError("must not request")

    assert await _finder(handler).find("B0GS1K5XQ8", "FR") is None


# --- PrecioReal fallback and finder chain -----------------------------------------

from patobarato.sources.amazon_page import ChainImageFinder, PrecioRealImageFinder  # noqa: E402

PR_PAGE = (
    '<html><head><title>Braun depiladora</title>'
    '<meta property="og:image" content="https://m.media-amazon.com/images/I/81wV8t9yIkL._AC_UL320_.jpg">'
    "</head></html>"
)


async def test_preciorreal_finder_reads_og_image_and_resizes():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=PR_PAGE)

    finder = PrecioRealImageFinder(httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    url = await finder.find("B09QQS92GP", "ES")

    assert url == "https://m.media-amazon.com/images/I/81wV8t9yIkL._AC_SL500_.jpg"
    assert str(seen[0].url) == "https://precioreal.com/oferta/amazon_b09qqs92gp"


async def test_preciorreal_finder_ignores_non_amazon_images_and_errors():
    other = '<meta property="og:image" content="https://precioreal.com/logo.png">'
    for response in (httpx.Response(200, text=other), httpx.Response(404, text="")):
        finder = PrecioRealImageFinder(
            httpx.AsyncClient(transport=httpx.MockTransport(lambda r, resp=response: resp))
        )
        assert await finder.find("B09QQS92GP", "ES") is None


class _Fixed:
    def __init__(self, url, fail=False):
        self.url, self.fail, self.calls = url, fail, 0

    async def find(self, asin, country):
        self.calls += 1
        if self.fail:
            raise RuntimeError("boom")
        return self.url


async def test_chain_returns_first_found_and_stops():
    first, second = _Fixed("https://m.media-amazon.com/images/I/A.jpg"), _Fixed("x")
    assert await ChainImageFinder([first, second]).find("B0", "ES") == "https://m.media-amazon.com/images/I/A.jpg"
    assert second.calls == 0


async def test_chain_falls_back_on_none_or_error():
    first, second = _Fixed(None, fail=True), _Fixed("https://m.media-amazon.com/images/I/B.jpg")
    assert await ChainImageFinder([first, second]).find("B0", "ES") == "https://m.media-amazon.com/images/I/B.jpg"


async def test_amazon_no_image_log_includes_page_title(caplog):
    page = "<html><head><title>Amazon.es: ¿Algo ha ido mal?</title></head></html>"
    with caplog.at_level(logging.WARNING, logger="patobarato.amazon"):
        await _finder(lambda request: httpx.Response(200, text=page)).find("B0GS1K5XQ8", "ES")
    assert any("Algo ha ido mal" in r.getMessage() for r in caplog.records)


# --- Price reader -------------------------------------------------------------------

from decimal import Decimal  # noqa: E402
from pathlib import Path  # noqa: E402

from patobarato.sources.amazon_page import AmazonPageFetcher, extract_price  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def test_extract_price_parses_thousands_and_previous():
    quote = extract_price(load_fixture("amazon_price.html"))
    assert quote is not None
    assert quote.price == Decimal("1234.56")
    assert quote.previous_price == Decimal("1499.00")
    assert quote.currency == "EUR"


def test_extract_price_without_buybox_is_none():
    assert extract_price(load_fixture("amazon_no_price.html")) is None


def test_extract_price_ignores_prices_outside_buybox():
    page = load_fixture("amazon_price.html")
    quote = extract_price(page)
    assert quote is not None and quote.price != Decimal("9.99")
    # The related-products price precedes the buy box; without the box it is not read.
    assert extract_price(page.replace("corePriceDisplay_desktop_feature_div", "other")) is None


@pytest.mark.parametrize("box_id", ["corePrice_feature_div", "apex_desktop"])
def test_extract_price_falls_back_to_other_buybox_ids(box_id):
    page = load_fixture("amazon_price.html").replace("corePriceDisplay_desktop_feature_div", box_id)
    quote = extract_price(page)
    assert quote is not None and quote.price == Decimal("1234.56")


def test_extract_price_previous_only_when_greater():
    page = load_fixture("amazon_price.html").replace("1.499,00", "1.000,00")
    quote = extract_price(page)
    assert quote is not None and quote.previous_price is None


async def test_fetcher_returns_page_and_none_on_captcha():
    ok = AmazonPageFetcher(httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, text="<html>hola</html>"))))
    assert await ok.fetch("B0GS1K5XQ8", "ES") == "<html>hola</html>"
    captcha = AmazonPageFetcher(httpx.AsyncClient(transport=httpx.MockTransport(
        lambda r: httpx.Response(200, text=load_fixture("amazon_captcha.html")))))
    assert await captcha.fetch("B0GS1K5XQ8", "ES") is None
    assert captcha.failed == 1
