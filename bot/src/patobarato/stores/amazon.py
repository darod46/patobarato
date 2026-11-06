"""Amazon adapter: wraps the ASIN/affiliate helpers and the image finders."""

import httpx

from patobarato.parsing.links import (
    asin_from_url,
    build_affiliate_url,
    canonical_url,
    country_from_url,
    is_amazon_url,
)
from patobarato.sources.amazon_page import (
    AmazonImageFinder,
    ChainImageFinder,
    PrecioRealImageFinder,
)
from patobarato.stores.base import BaseStore

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
