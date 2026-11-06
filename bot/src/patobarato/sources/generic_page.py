"""Generic page helpers: find a product image through the og:image meta tag."""

import html
import re

import httpx

from patobarato.sources.amazon_page import BROWSER_HEADERS

_META = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_KEY = re.compile(r"""\b(?:property|name)\s*=\s*["']og:image["']""", re.IGNORECASE)
_CONTENT = re.compile(r"""\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)


async def og_image(http: httpx.AsyncClient, url: str) -> str | None:
    try:
        response = await http.get(url, headers=BROWSER_HEADERS, follow_redirects=True)
    except httpx.HTTPError:
        return None
    if not response.is_success:
        return None
    for tag in _META.findall(response.text):
        if not _KEY.search(tag):
            continue
        content = _CONTENT.search(tag)
        if content:
            value = html.unescape(content.group(1) or content.group(2) or "").strip()
            if value:
                return value
    return None
