"""Finds a product's main image link on its Amazon page.

The web links the image directly (it is never downloaded or stored). One
request per lookup; any failure (captcha, HTTP error, timeout, no image)
returns None so the caller can carry on without an image.
"""

import html
import json
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Protocol

import httpx

from patobarato.models import PriceQuote

logger = logging.getLogger("patobarato.amazon")

PRODUCT_PAGE_URLS = {"ES": "https://www.amazon.es/dp/{asin}"}

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9",
}

IMAGE_SIZE = "_AC_SL500_"
_IMAGE_HOST = r"https://m\.media-amazon\.com/images/"
_LANDING_RE = re.compile(r'<img[^>]*id="landingImage"[^>]*>', re.IGNORECASE)
_OLD_HIRES_RE = re.compile(rf'data-old-hires="({_IMAGE_HOST}[^"]+)"')
_DYNAMIC_RE = re.compile(r'data-a-dynamic-image="([^"]+)"')
_HIRES_RE = re.compile(rf'"hiRes"\s*:\s*"({_IMAGE_HOST}[^"]+)"')
_OG_IMAGE_RE = re.compile(rf'<meta[^>]+property="og:image"[^>]+content="({_IMAGE_HOST}[^"]+)"')
_CAPTCHA_MARKERS = ("/errors/validateCaptcha", "captchacharacters")
_SIZE_TOKEN_RE = re.compile(r"\._[^/.]*_(\.\w+)$")
_EXTENSION_RE = re.compile(r"(\.\w+)$")


def _largest_dynamic_image(tag: str) -> str | None:
    match = _DYNAMIC_RE.search(tag)
    if not match:
        return None
    try:
        sizes = json.loads(html.unescape(match.group(1)))
    except ValueError:
        return None
    candidates = [
        (dims[0] * dims[1], url)
        for url, dims in sizes.items()
        if re.match(_IMAGE_HOST, url) and isinstance(dims, list) and len(dims) == 2
    ]
    return max(candidates)[1] if candidates else None


def extract_image_url(page: str) -> str | None:
    """The main product image, from the most to the least reliable source."""
    landing = _LANDING_RE.search(page)
    if landing:
        tag = landing.group(0)
        if match := _OLD_HIRES_RE.search(tag):
            return match.group(1)
    if match := _HIRES_RE.search(page):
        return match.group(1)
    if landing and (url := _largest_dynamic_image(landing.group(0))):
        return url
    if match := _OG_IMAGE_RE.search(page):
        return match.group(1)
    return None


_BUYBOX_IDS = ("corePriceDisplay_desktop_feature_div", "corePrice_feature_div", "apex_desktop")
_DIV_TAG_RE = re.compile(r"<(/?)div\b", re.IGNORECASE)
_PRICE_SPAN_RE = re.compile(
    r'(<span\b[^>]*\bclass="[^"]*\ba-price\b[^"]*"[^>]*>)\s*'
    r'<span\s+class="a-offscreen">([^<]*)</span>',
    re.IGNORECASE,
)
_PRICE_TEXT_RE = re.compile(r"^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$")


_SCRIPT_RE = re.compile(r"<script\b.*?</script\s*>|<!--.*?-->", re.IGNORECASE | re.DOTALL)
_SNS_BLOCK_RE = re.compile(r'<div\b[^>]*(?<![\w-])id="sns[^"]*"[^>]*>', re.IGNORECASE)
_SPAN_TAG_RE = re.compile(r"<(/?)span\b", re.IGNORECASE)
_UNIT_SUFFIX_RE = re.compile(r"(?:/|por\b)", re.IGNORECASE)


def _balanced_end(text: str, start: int, tag_re: re.Pattern[str]) -> int | None:
    """Index just after the tag that closes the one opening at `start`, or None."""
    depth = 0
    for tag in tag_re.finditer(text, start):
        depth += -1 if tag.group(1) else 1
        if depth == 0:
            end = text.find(">", tag.end())
            return end + 1 if end != -1 else None
    return None


def _buybox(page: str) -> str | None:
    """The buy box's HTML, found by container id (the first one present wins).

    None when the container is missing or its markup does not balance.
    """
    for container_id in _BUYBOX_IDS:
        opening = re.search(rf'<div\b[^>]*(?<![\w-])id="{container_id}"[^>]*>', page)
        if opening is None:
            continue
        end = _balanced_end(page, opening.start(), _DIV_TAG_RE)
        return None if end is None else page[opening.start() : end]
    return None


def _without_subscribe_blocks(box: str) -> str:
    """Drops Subscribe & Save sub-blocks (ids starting with sns), which carry other prices."""
    while match := _SNS_BLOCK_RE.search(box):
        end = _balanced_end(box, match.start(), _DIV_TAG_RE)
        box = box[: match.start()] + (box[end:] if end is not None else "")
    return box


def _parse_price(text: str) -> Decimal | None:
    cleaned = html.unescape(text).replace("€", "").replace("\xa0", "").replace(" ", "")
    if not _PRICE_TEXT_RE.match(cleaned):
        return None
    try:
        return Decimal(cleaned.replace(".", "").replace(",", "."))
    except InvalidOperation:
        return None


def extract_price(page: str) -> PriceQuote | None:
    """The current price (and the struck list price, if higher) of the buy box.

    Prices elsewhere on the page (related products, carousels), price ranges,
    per-unit prices and Subscribe & Save prices are never taken.
    """
    page = _SCRIPT_RE.sub("", page)
    box = _buybox(page)
    if box is None or "a-price-range" in box:
        return None
    box = _without_subscribe_blocks(box)
    main: Decimal | None = None
    generic: Decimal | None = None
    struck: list[Decimal] = []
    for match in _PRICE_SPAN_RE.finditer(box):
        tag, text = match.groups()
        value = _parse_price(text)
        if value is None:
            continue
        end = _balanced_end(box, match.start(), _SPAN_TAG_RE)
        if end is not None and _UNIT_SUFFIX_RE.match(box[end : end + 10].lstrip()):
            continue  # per-unit price such as "3,96 €/kg"
        if 'data-a-strike="true"' in tag:
            struck.append(value)
        elif "a-text-price" in tag:
            continue
        elif re.search(r"\b(?:apexPriceToPay|priceToPay)\b", tag):
            main = main if main is not None else value
        elif generic is None:
            generic = value
    price = main if main is not None else generic
    if price is None:
        return None
    previous = next((value for value in struck if value > price), None)
    return PriceQuote(price=price, previous_price=previous)


_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)


def _page_title(page: str) -> str:
    """What page we got, for diagnosing blocks (captcha variants, error pages)."""
    match = _TITLE_RE.search(page)
    return " ".join(html.unescape(match.group(1)).split())[:80] if match else ""


def resize_image_url(url: str, size: str = IMAGE_SIZE) -> str:
    """Asks Amazon's image CDN for a smaller rendition (e.g. 500 px)."""
    if _SIZE_TOKEN_RE.search(url):
        return _SIZE_TOKEN_RE.sub(rf".{size}\1", url)
    return _EXTENSION_RE.sub(rf".{size}\1", url)


class ImageFinder(Protocol):
    async def find(self, asin: str, country: str) -> str | None: ...


class AmazonPageFetcher:
    """One GET of the product page with browser-like headers.

    Shared by the image finder and the price reader. Returns the HTML, or None
    on a network error, a non-200 answer or a captcha. Keeps running counts so
    the logs show how often Amazon lets us through; `label` names what the
    caller is after ("image", "price") in those log lines.
    """

    def __init__(self, client: httpx.AsyncClient, label: str = "page") -> None:
        self._client = client
        self._label = label
        self.found = 0
        self.failed = 0

    async def fetch(self, asin: str, country: str) -> str | None:
        template = PRODUCT_PAGE_URLS.get(country)
        if template is None:
            return None
        try:
            response = await self._client.get(
                template.format(asin=asin), headers=BROWSER_HEADERS, follow_redirects=True
            )
        except httpx.HTTPError as error:
            return self.fail(asin, f"network error ({type(error).__name__})")
        if response.status_code != 200:
            return self.fail(asin, f"HTTP {response.status_code}")
        page = response.text
        if any(marker in page for marker in _CAPTCHA_MARKERS):
            return self.fail(asin, "captcha")
        return page

    def succeed(self, asin: str) -> None:
        self.found += 1
        logger.info(
            "Amazon %s for %s found (ok=%d, failed=%d)", self._label, asin, self.found, self.failed
        )

    def fail(self, asin: str, reason: str) -> None:
        self.failed += 1
        logger.warning(
            "Amazon %s for %s not found: %s (ok=%d, failed=%d)",
            self._label,
            asin,
            reason,
            self.found,
            self.failed,
        )
        return None


class AmazonImageFinder(ImageFinder):
    """Reads the product page through the shared fetcher and takes its image."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._fetcher = AmazonPageFetcher(client, "image")

    @property
    def found(self) -> int:
        return self._fetcher.found

    @property
    def failed(self) -> int:
        return self._fetcher.failed

    async def find(self, asin: str, country: str) -> str | None:
        page = await self._fetcher.fetch(asin, country)
        if page is None:
            return None
        url = extract_image_url(page)
        if url is None:
            return self._fetcher.fail(asin, f"no image in page (title: {_page_title(page)!r})")
        self._fetcher.succeed(asin)
        return resize_image_url(url)


PRECIOREAL_URLS = {"ES": "https://precioreal.com/oferta/amazon_{asin}"}


class PrecioRealImageFinder(ImageFinder):
    """Fallback: PrecioReal's product page carries the Amazon image in og:image.

    Used only when Amazon's own page gives no image (e.g. a datacenter IP
    gets a different page). The returned link still points to Amazon's CDN.
    """

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def find(self, asin: str, country: str) -> str | None:
        template = PRECIOREAL_URLS.get(country)
        if template is None:
            return None
        try:
            response = await self._client.get(
                template.format(asin=asin.lower()), headers=BROWSER_HEADERS, follow_redirects=True
            )
        except httpx.HTTPError as error:
            logger.warning("PrecioReal image for %s: network error (%s)", asin, type(error).__name__)
            return None
        if response.status_code != 200:
            logger.warning("PrecioReal image for %s: HTTP %d", asin, response.status_code)
            return None
        match = _OG_IMAGE_RE.search(response.text)
        if match is None:
            logger.warning("PrecioReal image for %s: no image in page", asin)
            return None
        logger.info("PrecioReal image for %s found", asin)
        return resize_image_url(match.group(1))


class ChainImageFinder(ImageFinder):
    """Tries each finder in order; the first image found wins."""

    def __init__(self, finders: list[ImageFinder]) -> None:
        self._finders = finders

    async def find(self, asin: str, country: str) -> str | None:
        for finder in self._finders:
            try:
                url = await finder.find(asin, country)
            except Exception:
                logger.exception("Image finder %s failed for %s", type(finder).__name__, asin)
                continue
            if url:
                return url
        return None
