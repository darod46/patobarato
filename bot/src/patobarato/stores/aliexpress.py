"""AliExpress adapter built on the Portals API client."""

import logging
import re
from urllib.parse import urlparse

import httpx

from patobarato.models import PriceQuote
from patobarato.stores.aliexpress_client import AliExpressClient, AliExpressError
from patobarato.stores.base import BaseStore

log = logging.getLogger(__name__)

COUNTRY = "ES"
SHORTENER_HOSTS = {"s.click.aliexpress.com", "a.aliexpress.com"}
_PRODUCT_ID = re.compile(r"(?:/item/|/i/)(\d+)\.html")


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


class AliExpressStore(BaseStore):
    id = "aliexpress"
    name = "AliExpress"
    country = COUNTRY

    def __init__(self, client: AliExpressClient) -> None:
        self._client = client

    @property
    def client(self) -> AliExpressClient:
        return self._client

    def matches(self, url: str) -> bool:
        host = _host(url)
        if host in SHORTENER_HOSTS:
            return False
        return host in ("aliexpress.com", "aliexpress.us") or host.endswith(".aliexpress.com")

    def is_shortener(self, url: str) -> bool:
        return _host(url) in SHORTENER_HOSTS

    def product_id(self, url: str) -> str | None:
        match = _PRODUCT_ID.search(urlparse(url).path)
        return match.group(1) if match else None

    def canonical_url(self, product_id: str, country: str) -> str:
        return f"https://es.aliexpress.com/item/{product_id}.html"

    async def affiliate_url(self, canonical_url: str, product_id: str) -> str:
        return await self._client.link_generate(canonical_url)

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        try:
            product = await self._client.product_detail(product_id)
        except (AliExpressError, httpx.HTTPError) as exc:
            log.warning("AliExpress image lookup failed for %s: %s", product_id, type(exc).__name__)
            return None
        return product.image_url if product else None

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        try:
            product = await self._client.product_detail(product_id)
        except Exception as exc:  # the reader never raises: any failure is a missing price
            log.warning(
                "AliExpress price for %s not found: %s: %s", product_id, type(exc).__name__, exc
            )
            return None
        if product is None:
            return None
        original = product.original_price
        previous = original if original is not None and original > product.price else None
        return PriceQuote(
            price=product.price, previous_price=previous, image_url=product.image_url
        )
