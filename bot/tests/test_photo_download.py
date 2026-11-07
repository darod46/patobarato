import httpx
import pytest

from patobarato.publishing.photo_download import MAX_PHOTO_BYTES, download_photo

URL = "https://img.example/p.jpg"


# Fake DNS: every host is public unless listed here.
PRIVATE_HOSTS = {
    "internal.example": ["10.0.0.5"],
    "loopback.example": ["127.0.0.1"],
    "metadata.example": ["169.254.169.254"],
    "v6loop.example": ["::1"],
    "reserved.example": ["240.0.0.1"],
    "mixed.example": ["93.184.216.34", "192.168.1.10"],
}


async def _fake_resolve(host: str) -> list[str]:
    if host == "nxdomain.example":
        return []
    return PRIVATE_HOSTS.get(host, ["93.184.216.34"])


async def _download(http: httpx.AsyncClient, url: str) -> bytes | None:
    return await download_photo(http, url, resolve_host=_fake_resolve)


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _jpeg(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=b"jpg")


async def test_downloads_image_bytes():
    async with _client(lambda r: httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=b"jpg")) as http:
        assert await _download(http, URL) == b"jpg"


async def test_follows_redirects():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/p.jpg":
            return httpx.Response(302, headers={"Location": "https://img.example/real.jpg"})
        return httpx.Response(200, headers={"Content-Type": "image/png"}, content=b"png")

    async with _client(handler) as http:
        assert await _download(http, URL) == b"png"


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
        assert await _download(http, URL) is None


async def test_rejects_oversized_stream_without_length():
    async def chunks():
        for _ in range(6):
            yield b"x" * 1_000_000

    async with _client(
        lambda r: httpx.Response(200, headers={"Content-Type": "image/jpeg"}, content=chunks())
    ) as http:
        assert await _download(http, URL) is None


async def test_network_error_gives_none():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("boom")

    async with _client(handler) as http:
        assert await _download(http, URL) is None


@pytest.mark.parametrize(
    "url",
    [
        "http://img.example/p.jpg",
        "ftp://img.example/p.jpg",
        "https://internal.example/p.jpg",
        "https://loopback.example/p.jpg",
        "https://metadata.example/p.jpg",
        "https://v6loop.example/p.jpg",
        "https://reserved.example/p.jpg",
        "https://mixed.example/p.jpg",
        "https://127.0.0.1/p.jpg",
        "https://[::1]/p.jpg",
        "https://10.1.2.3/p.jpg",
        "https://nxdomain.example/p.jpg",
    ],
)
async def test_rejects_plain_http_and_private_hosts(url):
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return _jpeg(request)

    async with _client(handler) as http:
        assert await _download(http, url) is None
    assert requests == []


@pytest.mark.parametrize(
    "location", ["http://img.example/real.jpg", "https://internal.example/real.jpg", "https://169.254.169.254/x"]
)
async def test_redirect_to_unsafe_url_is_rejected(location):
    requests: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        if request.url.path == "/p.jpg":
            return httpx.Response(302, headers={"Location": location})
        return _jpeg(request)

    async with _client(handler) as http:
        assert await _download(http, URL) is None
    assert requests == [URL]


async def test_redirects_are_capped_at_three():
    def handler(request: httpx.Request) -> httpx.Response:
        hop = int(request.url.params.get("hop", "0"))
        if hop < LIMIT:
            return httpx.Response(302, headers={"Location": f"https://img.example/p.jpg?hop={hop + 1}"})
        return _jpeg(request)

    LIMIT = 3
    async with _client(handler) as http:
        assert await _download(http, URL) == b"jpg"
    LIMIT = 4
    async with _client(handler) as http:
        assert await _download(http, URL) is None
