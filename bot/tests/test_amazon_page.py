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
