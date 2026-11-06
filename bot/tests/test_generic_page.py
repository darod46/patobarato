import httpx

from patobarato.sources.generic_page import og_image

URL = "https://www.pccomponentes.com/x"


def client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def page(meta: str) -> httpx.Response:
    return httpx.Response(200, text=f"<html><head>{meta}</head></html>")


async def test_property_content():
    http = client(lambda r: page('<meta property="og:image" content="https://i.example/a.jpg">'))
    assert await og_image(http, URL) == "https://i.example/a.jpg"


async def test_swapped_order_name_and_entities():
    http = client(lambda r: page('<meta content="https://i.example/a.jpg?w=1&amp;h=2" name="og:image"/>'))
    assert await og_image(http, URL) == "https://i.example/a.jpg?w=1&h=2"


async def test_sends_browser_headers_and_follows_redirects():
    seen = {}

    def handler(request):
        if request.url.path == "/x":
            return httpx.Response(302, headers={"location": "https://www.pccomponentes.com/y"})
        seen["ua"] = request.headers["user-agent"]
        return page('<meta property="og:image" content="https://i.example/b.jpg">')

    assert await og_image(client(handler), URL) == "https://i.example/b.jpg"
    assert "Mozilla" in seen["ua"]


async def test_failures_return_none():
    assert await og_image(client(lambda r: httpx.Response(403)), URL) is None
    assert await og_image(client(lambda r: page("<title>x</title>")), URL) is None

    def boom(request):
        raise httpx.ConnectError("down")

    assert await og_image(client(boom), URL) is None
