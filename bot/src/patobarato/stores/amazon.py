"""Amazon adapter: wraps the ASIN/affiliate helpers and the image finders."""

import logging
from dataclasses import replace

import httpx

from patobarato.parsing.links import (
    asin_from_url,
    build_affiliate_url,
    canonical_url,
    country_from_url,
    is_amazon_url,
)
from patobarato.models import PriceQuote
from patobarato.sources.amazon_page import (
    AmazonImageFinder,
    AmazonPageFetcher,
    ChainImageFinder,
    PrecioRealImageFinder,
    extract_image_url,
    _page_title,
    extract_price,
    resize_image_url,
)
from patobarato.stores.base import BaseStore

logger = logging.getLogger("patobarato.amazon")

DEFAULT_COUNTRY = "ES"


class AmazonStore(BaseStore):
    id = "amazon"
    name = "Amazon"

    def __init__(self, affiliate_tag: str, http: httpx.AsyncClient | None) -> None:
        self._tag = affiliate_tag
        self._images = (
            ChainImageFinder([AmazonImageFinder(http), PrecioRealImageFinder(http)])
            if http is not None
            else None
        )
        self._prices = AmazonPageFetcher(http, "price") if http is not None else None

    def matches(self, url: str) -> bool:
        return is_amazon_url(url)

    def product_id(self, url: str) -> str | None:
        return asin_from_url(url)

    def canonical_url(self, product_id: str, country: str) -> str:
        return canonical_url(product_id, country)

    async def affiliate_url(self, canonical_url: str, product_id: str) -> str:
        country = country_from_url(canonical_url) or DEFAULT_COUNTRY
        return build_affiliate_url(product_id, country, self._tag)

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        if self._images is None:
            return None
        country = country_from_url(canonical_url) or DEFAULT_COUNTRY
        return await self._images.find(product_id, country)

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        if self._prices is None:
            return None
        country = country_from_url(canonical_url) or DEFAULT_COUNTRY
        try:
            page = await self._prices.fetch(product_id, country)
            if page is None:
                return None
            quote = extract_price(page)
            if quote is None:
                return self._prices.fail(
                    product_id, f"no price in buy box (title: {_page_title(page)!r})"
                )
            image = extract_image_url(page)
            if image is not None:
                quote = replace(quote, image_url=resize_image_url(image))
            self._prices.succeed(product_id)
            return quote
        except Exception as error:
            logger.warning("Amazon price for %s failed: %s: %s", product_id, type(error).__name__, error)
            return None
