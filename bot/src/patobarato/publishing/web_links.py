"""URLs of deal pages on the web (must match web/src/lib/urls.ts productPath)."""

import re
import unicodedata

_NON_WORD = re.compile(r"[^a-z0-9]+")
MAX_SLUG_WORDS = 8


def product_slug(title: str) -> str:
    """Same result as the web's slugify() and the database's product_slug()."""
    folded = unicodedata.normalize("NFD", title)
    folded = "".join(c for c in folded if not unicodedata.combining(c)).lower()
    words = [w for w in _NON_WORD.split(folded) if w][:MAX_SLUG_WORDS]
    return "-".join(words) if words else "oferta"


def deal_url(site_url: str, store: str, asin: str, slug: str) -> str | None:
    """The deal page of a product, or None for stores whose page is not built from a slug."""
    base = site_url.rstrip("/")
    if store == "amazon":
        return f"{base}/oferta/amazon/{slug}-{asin.lower()}"
    if store == "aliexpress":
        return f"{base}/oferta/aliexpress/{slug}-{asin}"
    return None
