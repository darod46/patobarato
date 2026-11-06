"""AliExpress adapter built on the Portals API client."""

import logging
import re
from urllib.parse import urlparse

import httpx

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
