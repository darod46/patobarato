"""Downloads a product image URL into bytes to attach to a post (last-resort photo)."""

import logging

import httpx

logger = logging.getLogger("patobarato.photo")

MAX_PHOTO_BYTES = 5 * 1024 * 1024
PHOTO_TIMEOUT_SECONDS = 15.0
# Formats Telegram reliably accepts as a photo (the publisher sends them as "photo.jpg").
PHOTO_TYPES = frozenset({"image/jpeg", "image/jpg", "image/png"})


async def download_photo(
    http: httpx.AsyncClient,
    url: str,
    max_bytes: int = MAX_PHOTO_BYTES,
    timeout: float = PHOTO_TIMEOUT_SECONDS,
) -> bytes | None:
    """The image at ``url``, or None if it is not an image, too big or unreachable."""
    try:
        async with http.stream("GET", url, follow_redirects=True, timeout=timeout) as response:
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
    except (httpx.HTTPError, httpx.InvalidURL, ValueError) as exc:
        # Only the exception type and message: no traceback for a routine miss.
        logger.warning("Photo %s not downloaded: %s: %s", url, type(exc).__name__, exc)
        return None
    return bytes(data) or None
