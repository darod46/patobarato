"""Downloads a product image URL into bytes to attach to a post (last-resort photo).

The URL comes from store pages (og:image, PrecioReal…), so it is untrusted:
only https, a few redirects, and never a host that resolves to a private,
loopback, link-local or reserved address.
"""

import asyncio
import ipaddress
import logging
import socket
from collections.abc import Awaitable, Callable
from urllib.parse import urljoin, urlparse

import httpx

logger = logging.getLogger("patobarato.photo")

MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_TIMEOUT_SECONDS = 15.0
MAX_PHOTO_REDIRECTS = 3
# Formats Telegram reliably accepts as a photo (the publisher sends them as "photo.jpg").
PHOTO_TYPES = frozenset({"image/jpeg", "image/jpg", "image/png"})

HostResolver = Callable[[str], Awaitable[list[str]]]


async def resolve_host(host: str) -> list[str]:
    """The host's IP addresses (empty if it does not resolve)."""
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        return []
    return [info[4][0] for info in infos]


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


async def _unsafe_reason(url: str, resolve: HostResolver) -> str | None:
    parts = urlparse(url)
    if parts.scheme != "https":
        return f"scheme {parts.scheme!r}"
    host = parts.hostname
    if not host:
        return "no host"
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = await resolve(host)
    if not addresses:
        return "host does not resolve"
    try:
        if not all(_is_public(a) for a in addresses):
            return "non-public address"
    except ValueError:
        return "bad address"
    return None


async def download_photo(
    http: httpx.AsyncClient,
    url: str,
    max_bytes: int = MAX_PHOTO_BYTES,
    timeout: float = PHOTO_TIMEOUT_SECONDS,
    max_redirects: int = MAX_PHOTO_REDIRECTS,
    resolve_host: HostResolver = resolve_host,
) -> bytes | None:
    """The image at ``url``, or None if unsafe, not a photo, too big or unreachable."""
    current = url
    try:
        for _ in range(max_redirects + 1):
            reason = await _unsafe_reason(current, resolve_host)
            if reason is not None:
                logger.warning("Photo %s not downloaded: %s", current, reason)
                return None
            async with http.stream("GET", current, follow_redirects=False, timeout=timeout) as response:
                if response.is_redirect:
                    location = response.headers.get("Location")
                    if not location:
                        logger.warning("Photo %s not downloaded: redirect without location", current)
                        return None
                    current = urljoin(current, location)
                    continue
                return await _read_photo(response, current, max_bytes)
    except (httpx.HTTPError, httpx.InvalidURL, ValueError) as exc:
        # Only the exception type and message: no traceback for a routine miss.
        logger.warning("Photo %s not downloaded: %s: %s", current, type(exc).__name__, exc)
        return None
    logger.warning("Photo %s not downloaded: more than %d redirects", url, max_redirects)
    return None


async def _read_photo(response: httpx.Response, url: str, max_bytes: int) -> bytes | None:
    if response.status_code != 200:
        logger.warning("Photo %s not downloaded: HTTP %s", url, response.status_code)
        return None
    content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
    if content_type not in PHOTO_TYPES:
        logger.warning("Photo %s not downloaded: content type %r", url, content_type)
        return None
    length = response.headers.get("Content-Length")
    if length is not None and length.isdigit() and int(length) > max_bytes:
        logger.warning("Photo %s not downloaded: %s bytes", url, length)
        return None
    data = bytearray()
    async for chunk in response.aiter_bytes():
        data.extend(chunk)
        if len(data) > max_bytes:
            logger.warning("Photo %s not downloaded: over %d bytes", url, max_bytes)
            return None
    return bytes(data) or None
