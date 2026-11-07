"""Generic page helpers: product image, price and currency from JSON-LD and meta tags."""

import html
import json
import logging
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

import httpx

from patobarato.sources.amazon_page import BROWSER_HEADERS

logger = logging.getLogger(__name__)

_META = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_KEY = re.compile(r"""\b(?:property|name)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
_CONTENT = re.compile(r"""\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)
_JSON_LD = re.compile(
    r"""<script\b[^>]*type\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>""",
    re.IGNORECASE | re.DOTALL,
)
_CENT = Decimal("0.01")


@dataclass(frozen=True)
class ProductMeta:
    image_url: str | None
    price: Decimal | None
    previous_price: Decimal | None
    currency: str | None


def _meta_tags(page: str) -> dict[str, str]:
    """First non-empty content per lowercase property/name."""
    tags: dict[str, str] = {}
    for tag in _META.findall(page):
        key = _KEY.search(tag)
        content = _CONTENT.search(tag)
        if not key or not content:
            continue
        value = html.unescape(content.group(1) or content.group(2) or "").strip()
        if value:
            tags.setdefault(key.group(1).lower(), value)
    return tags


def _to_price(value: object) -> Decimal | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        text = str(value)
    elif isinstance(value, str):
        text = value.strip()
    else:
        return None
    text = re.sub(r"[^\d.,]", "", text)
    if not text:
        return None
    if "," in text and "." in text:
        decimal_sep = "," if text.rfind(",") > text.rfind(".") else "."
        thousands = "." if decimal_sep == "," else ","
        text = text.replace(thousands, "").replace(decimal_sep, ".")
    else:
        text = text.replace(",", ".")
    try:
        price = Decimal(text)
    except InvalidOperation:
        return None
    if not price.is_finite() or price <= 0:
        return None
    return price.quantize(_CENT)


def _is_product(node: dict) -> bool:
    kind = node.get("@type")
    return kind == "Product" or (isinstance(kind, list) and "Product" in kind)


def _products(data: object):
    if isinstance(data, list):
        for item in data:
            yield from _products(item)
    elif isinstance(data, dict):
        if _is_product(data):
            yield data
        yield from _products(data.get("@graph"))


def _offer_price(offers: object) -> tuple[Decimal | None, str | None]:
    candidates = offers if isinstance(offers, list) else [offers]
    for offer in candidates:
        if not isinstance(offer, dict):
            continue
        price = _to_price(offer.get("price"))
        if price is None:
            price = _to_price(offer.get("lowPrice"))
        if price is not None:
            currency = offer.get("priceCurrency")
            return price, currency.strip().upper() if isinstance(currency, str) and currency.strip() else None
    return None, None


def _json_ld_price(page: str) -> tuple[Decimal | None, str | None]:
    for block in _JSON_LD.findall(page):
        try:
            data = json.loads(html.unescape(block).strip())
        except ValueError:
            continue
        for product in _products(data):
            price, currency = _offer_price(product.get("offers"))
            if price is not None:
                return price, currency
    return None, None


def product_meta(page: str) -> ProductMeta:
    tags = _meta_tags(page)
    price, currency = _json_ld_price(page)
    if price is None:
        price = _to_price(tags.get("product:price:amount") or tags.get("og:price:amount"))
        raw = tags.get("product:price:currency") or tags.get("og:price:currency")
        currency = raw.upper() if price is not None and raw else None
    # JSON-LD has no standard "previous price" field, so it is not read yet.
    return ProductMeta(tags.get("og:image"), price, None, currency)


async def fetch_product_meta(http: httpx.AsyncClient, url: str) -> ProductMeta | None:
    try:
        response = await http.get(url, headers=BROWSER_HEADERS, follow_redirects=True)
    except httpx.HTTPError as error:
        logger.warning("Product page fetch failed: %s", type(error).__name__)
        return None
    if not response.is_success:
        logger.warning("Product page fetch failed: HTTP %s", response.status_code)
        return None
    return product_meta(response.text)


async def og_image(http: httpx.AsyncClient, url: str) -> str | None:
    meta = await fetch_product_meta(http, url)
    return meta.image_url if meta else None
