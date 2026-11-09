"""HTTP access to chollometro.com: the new-deals listing, thread pages and /visit/ links."""

from urllib.parse import parse_qs, urljoin, urlparse

import httpx

from patobarato.models import ChollometroThread
from patobarato.sources.chollometro_parse import parse_listing, parse_thread_page

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
_BLOCKED_STATUSES = (403, 429)


class ChollometroBlocked(Exception):
    """Chollometro refused the request (403 or 429)."""


def _is_chollometro(url: str) -> bool:
    host = urlparse(url).hostname or ""
    return host == "chollometro.com" or host.endswith(".chollometro.com")


class ChollometroClient:
    def __init__(self, http: httpx.AsyncClient, base_url: str = "https://www.chollometro.com") -> None:
        self._http = http
        self._base_url = base_url.rstrip("/")

    async def _get(self, url: str, *, follow_redirects: bool = True) -> httpx.Response:
        response = await self._http.get(
            url, headers={"User-Agent": USER_AGENT}, follow_redirects=follow_redirects
        )
        if response.status_code in _BLOCKED_STATUSES:
            raise ChollometroBlocked(f"{response.status_code} from {url}")
        return response

    async def fetch_new(self) -> list[ChollometroThread]:
        response = await self._get(f"{self._base_url}/nuevos")
        response.raise_for_status()
        return parse_listing(response.text)

    async def fetch_thread(self, url: str) -> ChollometroThread | None:
        response = await self._get(url)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return parse_thread_page(response.text)

    async def resolve_visit(self, visit_url: str) -> str | None:
        """The store URL a /visit/ link leads to, read from the first redirect only.

        Chollometro answers with a redirect to its own tracker whose ``url`` parameter
        holds the clean store URL. The next hop is deliberately not followed: it is where
        the store would receive Chollometro's affiliate tag.

        None means the link leads to no store URL. Transient failures (network errors,
        5xx) raise ``httpx.HTTPError`` so the caller can try again later.
        """
        response = await self._get(visit_url, follow_redirects=False)
        if response.status_code >= 500:
            response.raise_for_status()
        location = response.headers.get("Location")
        if not response.is_redirect or not location:
            return None
        location = urljoin(visit_url, location)
        target = parse_qs(urlparse(location).query).get("url")
        if target and target[0]:
            return target[0]
        return None if _is_chollometro(location) else location
