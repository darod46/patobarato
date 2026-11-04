"""Amazon link helpers: ASIN extraction, country, affiliate URLs and shortener resolving."""

import re
from urllib.parse import urljoin, urlparse

import httpx

AMAZON_DOMAINS: dict[str, str] = {"amazon.es": "ES"}
SHORTENER_HINT_DOMAINS = {"amzn.to", "amzn.eu", "a.co"}

_ANY_AMAZON_HOST = re.compile(r"(?:^|\.)amazon\.(?:[a-z]{2,3}|com?\.[a-z]{2})$")
_ASIN_PATH = re.compile(
    r"/(?:dp|gp/product|gp/aw/d|exec/obidos/ASIN|o/ASIN)/([A-Za-z0-9]{10})(?:/|$)"
)
_MAX_REDIRECTS = 10


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def is_amazon_url(url: str) -> bool:
    host = _host(url)
    if any(host == d or host.endswith("." + d) for d in AMAZON_DOMAINS):
        return True
    return bool(_ANY_AMAZON_HOST.search(host))


def country_from_url(url: str) -> str | None:
    host = _host(url)
    for domain, country in AMAZON_DOMAINS.items():
        if host == domain or host.endswith("." + domain):
            return country
    return None


def asin_from_url(url: str) -> str | None:
    try:
        path = urlparse(url).path
    except ValueError:
        return None
    match = _ASIN_PATH.search(path)
    return match.group(1).upper() if match else None


def _domain_for_country(country: str) -> str:
    for domain, code in AMAZON_DOMAINS.items():
        if code == country:
            return domain
    raise ValueError(f"Unsupported Amazon country: {country!r}")


def canonical_url(asin: str, country: str) -> str:
    return f"https://www.{_domain_for_country(country)}/dp/{asin}"


def build_affiliate_url(asin: str, country: str, tag: str) -> str:
    return f"{canonical_url(asin, country)}?tag={tag}"


class UrlResolver:
    """Resolves shortened links to an Amazon URL without ever requesting Amazon."""

    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def resolve(self, url: str) -> str | None:
        current = url
        try:
            for _ in range(_MAX_REDIRECTS + 1):
                if is_amazon_url(current):
                    return current
                async with self._client.stream(
                    "GET", current, follow_redirects=False
                ) as response:
                    location = response.headers.get("Location")
                    if not response.is_redirect or not location:
                        return None
                current = urljoin(current, location)
        except httpx.HTTPError:
            return None
        return None
