"""Generic Awin merchant adapter: host matching, deep links and og:image lookup."""

import logging
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlparse, urlunparse

import httpx

from patobarato.models import PriceQuote
from patobarato.sources.generic_page import fetch_product_meta, og_image
from patobarato.stores.base import BaseStore

log = logging.getLogger(__name__)

COUNTRY = "ES"
AWIN_HOSTS: dict[str, list[str]] = {
    "pccomponentes": ["pccomponentes.com"],
    "mediamarkt": ["mediamarkt.es"],
    "elcorteingles": ["elcorteingles.es"],
}
AWIN_NAMES: dict[str, str] = {
    "pccomponentes": "PcComponentes",
    "mediamarkt": "MediaMarkt",
    "elcorteingles": "El Corte Inglés",
}
_TRACKING = {"awc", "gclid", "fbclid"}


def _is_tracking(name: str) -> bool:
    lowered = name.lower()
    return lowered.startswith("utm_") or lowered in _TRACKING


class AwinStore(BaseStore):
    country = COUNTRY

    def __init__(
        self,
        id: str,
        name: str,
        hosts: list[str],
        merchant_id: int | None,
        publisher_id: str | None,
        http: httpx.AsyncClient | None,
    ) -> None:
        self.id = id
        self.name = name
        self.hosts = [h.lower() for h in hosts]
        self.merchant_id = merchant_id
        self.publisher_id = publisher_id
        self._http = http
        self._warned = False

    def matches(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return any(host == h or host == f"www.{h}" for h in self.hosts)

    def product_id(self, url: str) -> str | None:
        segments = [s for s in urlparse(url).path.split("/") if s]
        if not segments:
            return None
        last = segments[-1]
        if last.lower().endswith(".html"):
            last = last[: -len(".html")]
        last = unquote(last)
        return last or None

    def canonical_url(self, product_id: str, country: str) -> str:
        return f"https://{self.hosts[0]}/{quote(product_id, safe='')}"

    def canonical_for(self, url: str, country: str) -> str:
        parts = urlparse(url)
        query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _is_tracking(k)])
        path = parts.path
        if len(path) > 1:
            path = path.rstrip("/") or "/"
        return urlunparse((parts.scheme, parts.netloc, path, "", query, ""))

    async def affiliate_url(self, canonical_url: str, product_id: str) -> str:
        if self.merchant_id and self.publisher_id:
            return (
                f"https://www.awin1.com/cread.php?awinmid={self.merchant_id}"
                f"&awinaffid={self.publisher_id}&ued={quote(canonical_url, safe='')}"
            )
        if not self._warned:
            self._warned = True
            log.warning("affiliate=missing store=%s", self.id)
        return canonical_url

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        if self._http is None:
            return None
        return await og_image(self._http, canonical_url)

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        if self._http is None:
            return None
        try:
            meta = await fetch_product_meta(self._http, canonical_url)
        except Exception as e:
            log.warning("Awin price for %s not found: %s: %s", product_id, type(e).__name__, e)
            return None
        if meta is None or meta.price is None:
            log.warning("Awin price for %s not found: no usable price in page", product_id)
            return None
        currency = meta.currency or "EUR"
        if currency != "EUR":
            log.warning("Awin price for %s not found: unsupported currency %s", product_id, currency)
            return None
        return PriceQuote(meta.price, meta.previous_price, currency, meta.image_url)


def awin_store(
    store_id: str, merchant_id: int | None, publisher_id: str | None, http: httpx.AsyncClient | None
) -> AwinStore:
    return AwinStore(store_id, AWIN_NAMES[store_id], AWIN_HOSTS[store_id], merchant_id, publisher_id, http)
