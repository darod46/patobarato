"""Turns a source message into the offers it advertises, for the stores in the registry."""

import re
from dataclasses import dataclass

from patobarato.models import ParsedOffer, SourceMessage
from patobarato.parsing.links import UrlResolver, country_from_url
from patobarato.parsing.text import is_ad_marker, parse_hashtags, parse_prices, parse_title
from patobarato.stores.base import Store
from patobarato.stores.registry import StoreRegistry

# Country for stores whose links carry none (Amazon is told apart by its domain).
_DEFAULT_COUNTRY = "ES"

_BLOCK_SEPARATOR = re.compile(r"\n\s*\n")


@dataclass(frozen=True)
class _Link:
    original: str
    store: Store
    product_id: str
    country: str
    canonical: str


def _is_product_link(url: str, registry: StoreRegistry) -> bool:
    """A registered store's URL we can read a product id from (not an intermediate page)."""
    store = registry.store_for(url)
    return store is not None and store.product_id(url) is not None


async def _store_links(
    urls: list[str], resolver: UrlResolver, registry: StoreRegistry
) -> list[_Link]:
    links: dict[tuple[str, str], _Link] = {}
    for url in urls:
        resolved = await resolver.resolve(url, is_final=lambda u: _is_product_link(u, registry))
        if resolved is None:
            continue
        store = registry.store_for(resolved)
        if store is None:
            continue
        product_id = store.product_id(resolved)
        country = country_from_url(resolved) or (None if store.id == "amazon" else _DEFAULT_COUNTRY)
        if product_id is None or country is None:
            continue
        canonical = store.canonical_for(resolved, country)
        links.setdefault((store.id, product_id), _Link(url, store, product_id, country, canonical))
    return list(links.values())


def _build_offer(link: _Link, text: str, source_hashtags: list[str]) -> ParsedOffer:
    prices = parse_prices(text, link.store.id)
    tags = [*source_hashtags, *parse_hashtags(text)]
    hashtags = list(dict.fromkeys(t for t in tags if not is_ad_marker(t)))
    return ParsedOffer(
        asin=link.product_id,
        country=link.country,
        store=link.store.id,
        title=parse_title(text),
        price=prices.price,
        previous_price=prices.previous_price,
        coupon=prices.coupon,
        hashtags=hashtags,
        canonical_url=link.canonical,
        product_url=link.canonical,
    )


def _split_blocks(text: str, links: list[_Link]) -> list[str] | None:
    """Return one text block per link (in link order), or None if not splittable."""
    blocks = [b for b in _BLOCK_SEPARATOR.split(text) if b.strip()]
    if len(blocks) != len(links):
        return None
    ordered: list[str] = []
    for link in links:
        owners = [b for b in blocks if link.original in b]
        if len(owners) != 1:
            return None
        ordered.append(owners[0])
    if len({id(b) for b in ordered}) != len(blocks):
        return None
    for block in blocks:
        if sum(link.original in block for link in links) != 1:
            return None
    for link, block in zip(links, ordered):
        if parse_prices(block, link.store.id).price is None:
            return None
    return ordered


async def extract_offers(
    msg: SourceMessage, resolver: UrlResolver, registry: StoreRegistry
) -> list[ParsedOffer]:
    links = await _store_links(msg.urls, resolver, registry)
    if not links:
        return []
    if len(links) > 1:
        blocks = _split_blocks(msg.text, links)
        if blocks is not None:
            return [_build_offer(link, block, msg.hashtags) for link, block in zip(links, blocks)]
    return [_build_offer(links[0], msg.text, msg.hashtags)]
