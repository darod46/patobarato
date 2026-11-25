"""Price reader for neumaticos.es model/size pages (several variants, one price each)."""

import re
from decimal import Decimal, InvalidOperation

_TAG = re.compile(r"""<[^>]*\bitemprop\s*=\s*["']price["'][^>]*>""", re.IGNORECASE)
_CONTENT = re.compile(r"""\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)
_NUMBER = re.compile(r"\d[\d.,]*")
_DOT_THOUSANDS = re.compile(r"\d{1,3}(?:\.\d{3})+")


def _parse(raw: str) -> Decimal | None:
    match = _NUMBER.search(raw)
    if not match:
        return None
    number = match.group(0).rstrip(".,")
    if "," in number or _DOT_THOUSANDS.fullmatch(number):
        # Spanish format: "1.098,01 €" or "1.098 €" (dots are thousands separators).
        number = number.replace(".", "").replace(",", ".")
    try:
        return Decimal(number)
    except InvalidOperation:
        return None


def extract_min_price(page: str) -> Decimal | None:
    """The lowest `itemprop="price"` value in the page (attribute `content` or tag text)."""
    prices: list[Decimal] = []
    for tag in _TAG.finditer(page):
        content = _CONTENT.search(tag.group(0))
        if content:
            raw = content.group(1) if content.group(1) is not None else content.group(2)
        else:
            end = page.find("<", tag.end())
            raw = page[tag.end() : end if end != -1 else len(page)]
        price = _parse(raw)
        if price is not None and price > 0:
            prices.append(price)
    return min(prices) if prices else None
