"""Generic Awin merchant adapter: host matching, deep links and og:image lookup."""

import logging
import re
from decimal import Decimal
from urllib.parse import parse_qsl, quote, unquote, urlencode, urlparse, urlunparse

import httpx

from patobarato.models import PriceQuote
from patobarato.sources.amazon_page import BROWSER_HEADERS
from patobarato.sources.generic_page import fetch_product_meta, og_image
from patobarato.sources.neumaticos_page import extract_min_price
from patobarato.stores.base import BaseStore

log = logging.getLogger(__name__)

COUNTRY = "ES"
AWIN_HOSTS: dict[str, list[str]] = {
    "pccomponentes": ["pccomponentes.com"],
    "mediamarkt": ["mediamarkt.es"],
    "elcorteingles": ["elcorteingles.es"],
    "neumaticos": ["neumaticos.es"],
}
AWIN_NAMES: dict[str, str] = {
    "pccomponentes": "PcComponentes",
    "mediamarkt": "MediaMarkt",
    "elcorteingles": "El Corte Inglés",
    "neumaticos": "Neumaticos.es",
}
_TRACKING = {"awc", "gclid", "fbclid"}
# Path segments (lowercase, ".html" removed) of search/listing pages, which are not products.
_LISTING_SEGMENTS = frozenset({"search", "search-nwx", "buscar", "busqueda", "search-results", "s"})
# A last segment of only digits shorter than this is a page/category number, not a product.
_MIN_NUMERIC_ID_LENGTH = 4
_TYRE_SLUG = re.compile(r"^[a-z0-9]+-\d{3}-\d{2}-\d{2}c?-[a-z0-9_]+$")
_TYRE_CODES = re.compile(r"^\d+(\+\d+)*$")


def _is_tracking(name: str) -> bool:
    lowered = name.lower()
    return lowered.startswith("utm_") or lowered in _TRACKING


def canonical_awin_url(url: str) -> str:
    """Strip tracking params, fragment and trailing slash; keep the path."""
    parts = urlparse(url)
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not _is_tracking(k)])
    path = parts.path
    if len(path) > 1:
        path = path.rstrip("/") or "/"
    return urlunparse((parts.scheme, parts.netloc, path, "", query, ""))


def _strip_html(segment: str) -> str:
    return segment[: -len(".html")] if segment.lower().endswith(".html") else segment


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
        self._last_failure: str | None = None

    @property
    def last_failure(self) -> str | None:
        return self._last_failure

    def _tyre_product_id(self, url: str) -> str | None:
        segments = [unquote(s) for s in urlparse(url).path.split("/") if s]
        if "neumaticos" not in segments:
            return None
        rest = segments[segments.index("neumaticos") + 1 :]
        if len(rest) < 2 or not _TYRE_SLUG.match(rest[0]) or not _TYRE_CODES.match(rest[1]):
            return None
        return rest[0]

    def matches(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return any(host == h or host == f"www.{h}" for h in self.hosts)

    def product_id(self, url: str) -> str | None:
        """The last path segment, or None for the home page and search/listing pages."""
        if self.id == "neumaticos":
            return self._tyre_product_id(url)
        segments = [_strip_html(unquote(s)) for s in urlparse(url).path.split("/") if s]
        if not segments or any(s.lower() in _LISTING_SEGMENTS for s in segments):
            return None
        last = segments[-1]
        if last.isdigit() and len(last) < _MIN_NUMERIC_ID_LENGTH:
            return None
        return last or None

    def canonical_url(self, product_id: str, country: str) -> str:
        return f"https://{self.hosts[0]}/{quote(product_id, safe='')}"

    def canonical_for(self, url: str, country: str) -> str:
        return canonical_awin_url(url)

    async def affiliate_url(self, canonical_url: str, product_id: str) -> str | None:
        if self.merchant_id and self.publisher_id:
            return (
                f"https://www.awin1.com/cread.php?awinmid={self.merchant_id}"
                f"&awinaffid={self.publisher_id}&ued={quote(canonical_url, safe='')}"
            )
        if not self._warned:
            self._warned = True
            log.warning("affiliate=missing store=%s", self.id)
        return None

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        if self._http is None:
            return None
        return await og_image(self._http, canonical_url)

    async def _fetch_tyre_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        assert self._http is not None
        try:
            response = await self._http.get(canonical_url, headers=BROWSER_HEADERS, follow_redirects=True)
            price: Decimal | None = extract_min_price(response.text) if response.is_success else None
        except Exception as e:
            log.warning("Neumaticos price for %s not found: %s: %s", product_id, type(e).__name__, e)
            price = None
        if price is None:
            self._last_failure = "no price in page"
            log.warning("Neumaticos price for %s not found: no price in page", product_id)
            return None
        return PriceQuote(price, None, "EUR", None)

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        if self._http is None:
            return None
        if self.id == "neumaticos":
            self._last_failure = None
            return await self._fetch_tyre_price(product_id, canonical_url)
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
