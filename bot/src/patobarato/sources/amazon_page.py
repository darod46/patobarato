"""Finds a product's main image link on its Amazon page.

The web links the image directly (it is never downloaded or stored). One
request per lookup; any failure (captcha, HTTP error, timeout, no image)
returns None so the caller can carry on without an image.
"""

import html
import json
import logging
import re
from typing import Protocol

import httpx

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


class AmazonImageFinder(ImageFinder):
    """Reads the product page with browser-like headers.

    Keeps running counts so the logs show how often Amazon lets us through.
    """

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client
        self.found = 0
        self.failed = 0

    async def find(self, asin: str, country: str) -> str | None:
        template = PRODUCT_PAGE_URLS.get(country)
        if template is None:
            return None
        try:
            response = await self._client.get(
                template.format(asin=asin), headers=BROWSER_HEADERS, follow_redirects=True
            )
        except httpx.HTTPError as error:
            return self._fail(asin, f"network error ({type(error).__name__})")
        if response.status_code != 200:
            return self._fail(asin, f"HTTP {response.status_code}")
        page = response.text
        if any(marker in page for marker in _CAPTCHA_MARKERS):
            return self._fail(asin, "captcha")
        url = extract_image_url(page)
        if url is None:
            return self._fail(asin, f"no image in page (title: {_page_title(page)!r})")
        self.found += 1
        logger.info("Amazon image for %s found (ok=%d, failed=%d)", asin, self.found, self.failed)
        return resize_image_url(url)

    def _fail(self, asin: str, reason: str) -> None:
        self.failed += 1
        logger.warning(
            "Amazon image for %s not found: %s (ok=%d, failed=%d)",
            asin,
            reason,
            self.found,
            self.failed,
        )
        return None


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
