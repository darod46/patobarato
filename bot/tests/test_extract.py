import dataclasses
from datetime import UTC, datetime
from decimal import Decimal

from pathlib import Path
from urllib.parse import urlparse

import httpx
import pytest

from patobarato.models import SourceMessage
from patobarato.parsing.extract import StoreLink, extract_offers, resolve_store_link
from patobarato.parsing.links import UrlResolver
from patobarato.parsing.text import is_ad_marker
from patobarato.stores.amazon import AmazonStore
from patobarato.stores.awin import awin_store
from patobarato.stores.base import BaseStore
from patobarato.stores.registry import StoreRegistry

TARGETS = {
    "/a": "https://www.amazon.es/dp/B09XS7JWHH?tag=x",
    "/b": "https://www.amazon.es/dp/B0BDJH7LQ2",
    "/t": "https://tienda.test/p/9001?utm=1",
    "/ali": "https://star.aliexpress.com/share/share.htm?x=1",
    "/share/share.htm": "https://es.aliexpress.com/item/1005006123456789.html?spm=a",
}


class FakeStore(BaseStore):
    """Second store: host tienda.test, id = last path segment, query stripped."""

    id = "tienda"
    name = "Tienda"

    def matches(self, url: str) -> bool:
        return urlparse(url).hostname == "tienda.test"

    def product_id(self, url: str) -> str | None:
        segment = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
        return segment or None

    def canonical_url(self, product_id: str, country: str) -> str:
        return f"https://tienda.test/{country}/p/{product_id}"

    def canonical_for(self, url: str, country: str) -> str:
        parsed = urlparse(url)
        return f"https://tienda.test{parsed.path}"


def _handler(request: httpx.Request) -> httpx.Response:
    target = TARGETS.get(request.url.path)
    if request.url.host == "star.aliexpress.com":
        target = TARGETS["/share/share.htm"]
    if target is None:
        return httpx.Response(404)
    return httpx.Response(301, headers={"Location": target})


@pytest.fixture
def registry() -> StoreRegistry:
    return StoreRegistry([AmazonStore("patobarato-21", None)])


@pytest.fixture
async def resolver():
    async with httpx.AsyncClient(transport=httpx.MockTransport(_handler)) as client:
        yield UrlResolver(client)


def _msg(text: str, urls: list[str], hashtags: list[str] | None = None) -> SourceMessage:
    return SourceMessage(1, 1, text, urls, hashtags or [], datetime.now(UTC))


async def test_single_offer(resolver, registry):
    msg = _msg(
        "Sony WH-1000XM5 a 249,99€ https://amzn.to/a #chollo",
        ["https://amzn.to/a"],
        ["oferta"],
    )
    offers = await extract_offers(msg, resolver, registry)
    assert len(offers) == 1
    offer = offers[0]
    assert offer.asin == "B09XS7JWHH"
    assert offer.country == "ES"
    assert offer.store == "amazon"
    assert offer.price == Decimal("249.99")
    assert offer.canonical_url == "https://www.amazon.es/dp/B09XS7JWHH"
    assert offer.product_url == "https://www.amazon.es/dp/B09XS7JWHH"
    assert offer.image_url is None
    assert offer.affiliate_url is None
    assert offer.hashtags == ["oferta", "chollo"]


async def test_non_amazon_message_ignored(resolver, registry):
    msg = _msg("Mira https://example.com 10€", ["https://example.com"])
    assert await extract_offers(msg, resolver, registry) == []


async def test_amazon_com_ignored(resolver, registry):
    url = "https://www.amazon.com/dp/B09XS7JWHH"
    assert await extract_offers(_msg(f"Foo 10€ {url}", [url]), resolver, registry) == []


async def test_multi_product_split(resolver, registry):
    text = "Auriculares 249,99€\nhttps://amzn.to/a\n\nRatón 19,95€\nhttps://amzn.to/b"
    msg = _msg(text, ["https://amzn.to/a", "https://amzn.to/b"])
    offers = await extract_offers(msg, resolver, registry)
    assert [(o.asin, o.price) for o in offers] == [
        ("B09XS7JWHH", Decimal("249.99")),
        ("B0BDJH7LQ2", Decimal("19.95")),
    ]


async def test_multi_product_unsplittable_takes_first(resolver, registry):
    text = "Pack 249,99€\nhttps://amzn.to/a\nhttps://amzn.to/b"
    msg = _msg(text, ["https://amzn.to/a", "https://amzn.to/b"])
    offers = await extract_offers(msg, resolver, registry)
    assert [o.asin for o in offers] == ["B09XS7JWHH"]


async def test_multi_product_block_without_price_takes_first(resolver, registry):
    text = "Auriculares 249,99€\nhttps://amzn.to/a\n\nRatón\nhttps://amzn.to/b"
    msg = _msg(text, ["https://amzn.to/a", "https://amzn.to/b"])
    offers = await extract_offers(msg, resolver, registry)
    assert [o.asin for o in offers] == ["B09XS7JWHH"]


async def test_duplicate_asins_collapse(resolver, registry):
    msg = _msg(
        "Foo 10€ https://amzn.to/a https://www.amazon.es/dp/B09XS7JWHH",
        ["https://amzn.to/a", "https://www.amazon.es/dp/B09XS7JWHH"],
    )
    assert len(await extract_offers(msg, resolver, registry)) == 1


async def test_url_from_button_only(resolver, registry):
    offers = await extract_offers(_msg("Gran oferta 30€", ["https://amzn.to/b"]), resolver, registry)
    assert [o.asin for o in offers] == ["B0BDJH7LQ2"]


async def test_unregistered_store_link_is_ignored(resolver, registry):
    ali = "https://es.aliexpress.com/item/1005001.html"
    amazon = "https://www.amazon.es/dp/B09XS7JWHH"
    msg = _msg(f"Foo 10€ {amazon} {ali}", [amazon, ali])
    offers = await extract_offers(msg, resolver, registry)
    assert [(o.store, o.asin) for o in offers] == [("amazon", "B09XS7JWHH")]


@pytest.fixture
def multi_registry() -> StoreRegistry:
    return StoreRegistry([AmazonStore("patobarato-21", None), FakeStore()])


async def test_generic_store_uses_default_country_and_canonical_for(resolver, multi_registry):
    url = "https://tienda.test/p/9001?utm=1&ref=x"
    offers = await extract_offers(_msg(f"Lámpara 12€ {url}", [url]), resolver, multi_registry)
    assert len(offers) == 1
    offer = offers[0]
    assert (offer.store, offer.asin, offer.country) == ("tienda", "9001", "ES")
    # canonical_for override (query stripped), not canonical_url(product_id, country)
    assert offer.canonical_url == "https://tienda.test/p/9001"
    assert offer.product_url == "https://tienda.test/p/9001"


async def test_generic_store_shortener_resolves_via_registry(resolver, multi_registry):
    offers = await extract_offers(
        _msg("Lámpara 12€ https://amzn.to/t", ["https://amzn.to/t"]), resolver, multi_registry
    )
    assert [(o.store, o.asin) for o in offers] == [("tienda", "9001")]
    # An Amazon-only registry cannot follow the redirect to the other store
    amazon_only = StoreRegistry([AmazonStore("patobarato-21", None)])
    assert await extract_offers(
        _msg("Lámpara 12€ https://amzn.to/t", ["https://amzn.to/t"]), resolver, amazon_only
    ) == []


async def test_same_product_id_in_two_stores_is_not_deduped(resolver, multi_registry):
    amazon = "https://www.amazon.es/dp/B09XS7JWHH"
    other = "https://tienda.test/p/B09XS7JWHH"
    text = f"Auriculares 20€\n{amazon}\n\nAuriculares 25€\n{other}"
    offers = await extract_offers(_msg(text, [amazon, other]), resolver, multi_registry)
    assert [(o.store, o.asin, o.price) for o in offers] == [
        ("amazon", "B09XS7JWHH", Decimal("20")),
        ("tienda", "B09XS7JWHH", Decimal("25")),
    ]


async def test_same_store_and_product_id_collapses(resolver, multi_registry):
    a, b = "https://tienda.test/p/9001?x=1", "https://tienda.test/p/9001?x=2"
    offers = await extract_offers(_msg(f"Lámpara 12€ {a} {b}", [a, b]), resolver, multi_registry)
    assert len(offers) == 1


async def test_intermediate_aliexpress_page_keeps_resolving(resolver):
    from patobarato.stores.aliexpress import AliExpressStore

    registry = StoreRegistry([AliExpressStore(client=None)])  # type: ignore[arg-type]
    url = "https://sho.rt/ali"
    offers = await extract_offers(_msg(f"Gadget 9€ {url}", [url]), resolver, registry)
    assert [(o.store, o.asin) for o in offers] == [("aliexpress", "1005006123456789")]


CAZACHOLLAZOS_A = (Path(__file__).parent / "fixtures" / "cazachollazos_a.txt").read_text("utf-8")
ECI_SEARCH = "https://www.elcorteingles.es/search-nwx/1?s=8428076001158"


async def test_reference_store_search_link_is_not_an_offer(resolver):
    registry = StoreRegistry(
        [AmazonStore("patobarato-21", None), awin_store("elcorteingles", None, None, None)]
    )
    amazon = "https://www.amazon.es/dp/B084ZK9QVF?tag=cazachollazos-21"
    offers = await extract_offers(_msg(CAZACHOLLAZOS_A, [ECI_SEARCH, amazon]), resolver, registry)
    assert [(o.store, o.asin) for o in offers] == [("amazon", "B084ZK9QVF")]


async def test_offer_price_ignores_only_other_stores(resolver, registry):
    url = "https://www.amazon.es/dp/B09XS7JWHH"
    offers = await extract_offers(_msg(f"Precio en Amazon: 19,99€ {url}", [url]), resolver, registry)
    assert offers[0].price == Decimal("19.99")


async def test_source_ad_marker_hashtags_are_dropped(resolver):
    # CazaChollazos ends every post with "📢 #pub": an ad marker, not a topic of ours.
    registry = StoreRegistry([AmazonStore("patobarato-21", None)])
    amazon = "https://www.amazon.es/dp/B084ZK9QVF?tag=cazachollazos-21"
    msg = dataclasses.replace(
        _msg(CAZACHOLLAZOS_A + "\n#Lubricante #PUBLI #Ads", [amazon]),
        hashtags=["pub", "Publicidad", "durex", "anuncio", "Patrocinado", "sponsored", "ad"],
    )
    [offer] = await extract_offers(msg, resolver, registry)
    assert offer.hashtags == ["durex", "lubricante"]


@pytest.mark.parametrize("tag", ["pub", "publi", "publicidad", "ad", "ads", "anuncio", "patrocinado", "sponsored"])
def test_is_ad_marker(tag):
    assert is_ad_marker(tag)
    assert is_ad_marker(tag.upper())
    assert not is_ad_marker(tag + "x")


async def test_resolve_store_link_from_store_url(resolver, registry):
    url = "https://www.amazon.es/dp/B0TEST1234?tag=otro-21"
    link = await resolve_store_link(url, resolver, registry)
    assert link is not None
    assert link.store.id == "amazon"
    assert link == StoreLink(
        store=link.store,
        product_id="B0TEST1234",
        country="ES",
        canonical="https://www.amazon.es/dp/B0TEST1234",
    )


async def test_resolve_store_link_unknown_store_none(resolver, registry):
    assert await resolve_store_link("https://www.ejemplo.com/x", resolver, registry) is None
