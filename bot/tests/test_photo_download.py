import httpx
import pytest

from patobarato.publishing.photo_download import MAX_PHOTO_BYTES, download_photo

URL = "https://img.example/p.jpg"


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_downloads_image_bytes():
    async with _client(lambda r: httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=b"jpg")) as http:
        assert await download_photo(http, URL) == b"jpg"


async def test_follows_redirects():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/p.jpg":
            return httpx.Response(302, headers={"Location": "https://img.example/real.jpg"})
        return httpx.Response(200, headers={"Content-Type": "image/png"}, content=b"png")

    async with _client(handler) as http:
        assert await download_photo(http, URL) == b"png"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, headers={"Content-Type": "text/html"}, content=b"<html>"),
        httpx.Response(200, content=b"no type"),
        httpx.Response(200, headers={"Content-Type": "image/webp"}, content=b"webp"),
        httpx.Response(200, headers={"Content-Type": "image/svg+xml"}, content=b"<svg/>"),
        httpx.Response(404, headers={"Content-Type": "image/jpeg"}, content=b"x"),
        httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=b""),
        httpx.Response(
            200,
            headers={"Content-Type": "image/jpeg", "Content-Length": str(MAX_PHOTO_BYTES + 1)},
            content=b"x" * (MAX_PHOTO_BYTES + 1),
        ),
    ],
)
async def test_rejects_non_images_errors_and_oversized(response, caplog):
    async with _client(lambda r: response) as http:
        assert await download_photo(http, URL) is None


async def test_rejects_oversized_stream_without_length():
    async def chunks():
        for _ in range(6):
            yield b"x" * 1_000_000

    async with _client(
        lambda r: httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=chunks())
    ) as http:
        assert await download_photo(http, URL) is None


async def test_network_error_gives_none():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    async with _client(handler) as http:
        assert await download_photo(http, URL) is None
