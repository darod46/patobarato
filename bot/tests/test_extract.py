from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from patobarato.models import SourceMessage
from patobarato.parsing.extract import extract_offers
from patobarato.parsing.links import UrlResolver
from patobarato.stores.amazon import AmazonStore
from patobarato.stores.registry import StoreRegistry

TARGETS = {
    "/a": "https://www.amazon.es/dp/B09XS7JWHH?tag=x",
    "/b": "https://www.amazon.es/dp/B0BDJH7LQ2",
}


def _handler(request: httpx.Request) -> httpx.Response:
    target = TARGETS.get(request.url.path)
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
