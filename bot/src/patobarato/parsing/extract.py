"""Turns a source message into the Amazon offers it advertises."""

import re
from dataclasses import dataclass

from patobarato.models import ParsedOffer, SourceMessage
from patobarato.parsing.links import (
    UrlResolver,
    asin_from_url,
    canonical_url,
    country_from_url,
)
from patobarato.parsing.text import parse_hashtags, parse_prices, parse_title

_BLOCK_SEPARATOR = re.compile(r"\n\s*\n")


@dataclass(frozen=True)
class _Link:
    original: str
    asin: str
    country: str


async def _amazon_links(urls: list[str], resolver: UrlResolver) -> list[_Link]:
    links: dict[str, _Link] = {}
    for url in urls:
        resolved = await resolver.resolve(url)
        if resolved is None:
            continue
        asin = asin_from_url(resolved)
        country = country_from_url(resolved)
        if asin is None or country is None:
            continue
        links.setdefault(asin, _Link(url, asin, country))
    return list(links.values())


def _build_offer(link: _Link, text: str, source_hashtags: list[str]) -> ParsedOffer:
    prices = parse_prices(text)
    hashtags = list(dict.fromkeys([*source_hashtags, *parse_hashtags(text)]))
    return ParsedOffer(
        asin=link.asin,
        country=link.country,
        store="amazon",
        title=parse_title(text),
        price=prices.price,
        previous_price=prices.previous_price,
        coupon=prices.coupon,
        hashtags=hashtags,
        canonical_url=canonical_url(link.asin, link.country),
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
        if parse_prices(block).price is None:
            return None
    return ordered


async def extract_offers(msg: SourceMessage, resolver: UrlResolver) -> list[ParsedOffer]:
    links = await _amazon_links(msg.urls, resolver)
    if not links:
        return []
    if len(links) > 1:
        blocks = _split_blocks(msg.text, links)
        if blocks is not None:
            return [_build_offer(link, block, msg.hashtags) for link, block in zip(links, blocks)]
    return [_build_offer(links[0], msg.text, msg.hashtags)]
