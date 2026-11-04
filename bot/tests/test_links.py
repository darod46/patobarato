import httpx
import pytest

from patobarato.parsing.links import (
    UrlResolver,
    asin_from_url,
    build_affiliate_url,
    canonical_url,
    country_from_url,
    is_amazon_url,
)


def test_asin_from_dp_url():
    url = "https://www.amazon.es/Sony-WH-1000XM5/dp/B09XS7JWHH/ref=sr_1_1?th=1"
    assert asin_from_url(url) == "B09XS7JWHH"


def test_asin_from_gp_product_url():
    assert asin_from_url("https://amazon.es/gp/product/b09xs7jwhh?psc=1") == "B09XS7JWHH"


@pytest.mark.parametrize(
    "url",
    [
        "https://www.amazon.es/gp/aw/d/B09XS7JWHH",
        "https://www.amazon.es/exec/obidos/ASIN/B09XS7JWHH/tag-21",
        "https://www.amazon.es/o/ASIN/B09XS7JWHH",
    ],
)
def test_asin_from_other_path_forms(url):
    assert asin_from_url(url) == "B09XS7JWHH"


def test_asin_none_for_search_url():
    assert asin_from_url("https://www.amazon.es/s?k=auriculares") is None


def test_asin_none_for_wrong_length():
    assert asin_from_url("https://www.amazon.es/dp/B09XS7JWHHX") is None


def test_country_es_and_unknown():
    assert country_from_url("https://www.amazon.es/dp/X") == "ES"
    assert country_from_url("https://www.amazon.com/dp/X") is None


def test_is_amazon_url():
    assert is_amazon_url("https://www.amazon.es/dp/B09XS7JWHH")
    assert is_amazon_url("https://www.amazon.co.uk/dp/B09XS7JWHH")
    assert not is_amazon_url("https://notamazon.es/dp/B09XS7JWHH")
    assert not is_amazon_url("https://amzn.to/abc")


def test_affiliate_url_replaces_foreign_tag():
    asin = asin_from_url("https://www.amazon.es/dp/B09XS7JWHH?tag=otro-21&ref=abc&th=1")
    assert (
        build_affiliate_url(asin, "ES", "patobarato-21")
        == "https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21"
    )


def test_affiliate_and_canonical_unknown_country():
    assert canonical_url("B09XS7JWHH", "ES") == "https://www.amazon.es/dp/B09XS7JWHH"
    with pytest.raises(ValueError):
        build_affiliate_url("B09XS7JWHH", "US", "patobarato-21")
    with pytest.raises(ValueError):
        canonical_url("B09XS7JWHH", "US")


async def test_resolve_follows_shortener():
    target = "https://www.amazon.es/dp/B09XS7JWHH?tag=x-21"
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(301, headers={"Location": target})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("https://amzn.to/abc") == target
    assert requested == ["https://amzn.to/abc"]


async def test_resolve_amazon_url_makes_no_request():
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    url = "https://www.amazon.es/dp/B09XS7JWHH"
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve(url) == url


async def test_resolve_handles_relative_location():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/abc":
            return httpx.Response(302, headers={"Location": "/next"})
        return httpx.Response(
            302, headers={"Location": "https://www.amazon.es/dp/B09XS7JWHH"}
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await UrlResolver(client).resolve("https://amzn.to/abc")
    assert result == "https://www.amazon.es/dp/B09XS7JWHH"


async def test_resolve_bitly_to_non_amazon_returns_none():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "bit.ly":
            return httpx.Response(302, headers={"Location": "https://example.com/"})
        return httpx.Response(200, text="hi")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("https://bit.ly/x") is None


async def test_resolve_redirect_loop_returns_none():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "https://bit.ly/x"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("https://bit.ly/x") is None


async def test_resolve_failure_returns_none():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("timeout", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("https://amzn.to/abc") is None


# --- I6: scheme-less links and malformed URLs -----------------------------------


def test_schemeless_helpers():
    assert is_amazon_url("www.amazon.es/dp/B09XS7JWHH")
    assert country_from_url("amazon.es/dp/B09XS7JWHH") == "ES"
    assert asin_from_url("www.amazon.es/dp/B09XS7JWHH") == "B09XS7JWHH"
    assert not is_amazon_url("amzn.to/abc")


async def test_resolve_schemeless_shortener_is_followed():
    target = "https://www.amazon.es/dp/B09XS7JWHH"
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        return httpx.Response(301, headers={"Location": target})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("amzn.to/abc") == target
    assert requested == ["https://amzn.to/abc"]


async def test_resolve_schemeless_amazon_url_makes_no_request():
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await UrlResolver(client).resolve("www.amazon.es/dp/B09XS7JWHH")
    assert result == "https://www.amazon.es/dp/B09XS7JWHH"
    assert asin_from_url(result) == "B09XS7JWHH"
    assert country_from_url(result) == "ES"


async def test_resolve_malformed_location_returns_none():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "http://a]/"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("https://amzn.to/abc") is None


async def test_resolve_invalid_url_returns_none():
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request expected")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await UrlResolver(client).resolve("https://\x00x/") is None


async def test_resolve_does_not_swallow_unexpected_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        raise RuntimeError("bug")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(RuntimeError):
            await UrlResolver(client).resolve("https://amzn.to/abc")
