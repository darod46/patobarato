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
_MAX_DEPTH = 10


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


def _quantise(price: Decimal) -> Decimal | None:
    if not price.is_finite():
        return None
    try:
        price = price.quantize(_CENT)
    except InvalidOperation:
        return None
    return price if price > 0 else None


def _to_price(value: object) -> Decimal | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return _quantise(Decimal(str(value)))
        except InvalidOperation:
            return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if "-" in text or any(c.isalpha() for c in text):
        return None
    text = re.sub(r"[^\d.,]", "", text)
    if not text:
        return None
    seps = {c for c in text if c in ".,"}
    if len(seps) == 2:
        decimal_sep = "," if text.rfind(",") > text.rfind(".") else "."
        thousands = "." if decimal_sep == "," else ","
        if text.count(decimal_sep) != 1 or text.rfind(thousands) > text.rfind(decimal_sep):
            return None
        whole, frac = text.split(decimal_sep)
        if len(frac) > 2 or not re.fullmatch(r"\d{1,3}(?:\%s\d{3})*" % thousands, whole):
            return None
        text = whole.replace(thousands, "") + "." + frac
    elif len(seps) == 1:
        sep = seps.pop()
        if text.count(sep) > 1:
            if not re.fullmatch(r"\d{1,3}(?:\%s\d{3})+" % sep, text):
                return None
            text = text.replace(sep, "")
        else:
            whole, frac = text.split(sep)
            if len(frac) == 3 or len(frac) > 2:
                return None
            text = f"{whole or '0'}.{frac}"
    try:
        return _quantise(Decimal(text))
    except InvalidOperation:
        return None


def _is_product(node: dict) -> bool:
    kind = node.get("@type")
    return kind == "Product" or (isinstance(kind, list) and "Product" in kind)


def _products(data: object, depth: int = 0):
    if depth > _MAX_DEPTH:
        return
    if isinstance(data, list):
        for item in data:
            yield from _products(item, depth + 1)
    elif isinstance(data, dict):
        if _is_product(data):
            yield data
        yield from _products(data.get("@graph"), depth + 1)


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


def _load_json(block: str) -> object:
    try:
        return json.loads(block.strip())
    except (ValueError, RecursionError):
        pass
    try:
        return json.loads(html.unescape(block).strip())
    except (ValueError, RecursionError):
        return None


def _norm_url(value: object) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip().split("#", 1)[0].rstrip("/").lower()


def _json_ld_price(page: str, page_url: str | None) -> tuple[Decimal | None, str | None]:
    found: list[tuple[Decimal, str | None, dict]] = []
    for block in _JSON_LD.findall(page):
        data = _load_json(block)
        if data is None:
            continue
        for product in _products(data):
            price, currency = _offer_price(product.get("offers"))
            if price is not None:
                found.append((price, currency, product))
    if not found:
        return None, None
    if len({price for price, _, _ in found}) == 1:
        return found[0][0], found[0][1]
    target = _norm_url(page_url)
    if target:
        matched = [
            (price, currency)
            for price, currency, product in found
            if target in (_norm_url(product.get("url")), _norm_url(product.get("@id")))
        ]
        if matched and len({price for price, _ in matched}) == 1:
            return matched[0]
    return None, None


def product_meta(page: str, page_url: str | None = None) -> ProductMeta:
    tags = _meta_tags(page)
    meta_currency = tags.get("product:price:currency") or tags.get("og:price:currency")
    meta_currency = meta_currency.upper() if meta_currency else None
    price, currency = _json_ld_price(page, page_url)
    if price is None:
        price = _to_price(tags.get("product:price:amount") or tags.get("og:price:amount"))
        currency = meta_currency if price is not None else None
    elif currency is None:
        currency = meta_currency
    # JSON-LD has no standard "previous price" field, so it is not read yet.
    return ProductMeta(tags.get("og:image"), price, None, currency)


async def fetch_product_meta(http: httpx.AsyncClient, url: str) -> ProductMeta | None:
    try:
        response = await http.get(url, headers=BROWSER_HEADERS, follow_redirects=True)
        if not response.is_success:
            logger.warning("Product page fetch failed: HTTP %s", response.status_code)
            return None
        return product_meta(response.text, url)
    except Exception as error:
        logger.warning("Product page fetch failed: %s", type(error).__name__)
        return None


async def og_image(http: httpx.AsyncClient, url: str) -> str | None:
    try:
        meta = await fetch_product_meta(http, url)
    except Exception:
        return None
    return meta.image_url if meta else None
