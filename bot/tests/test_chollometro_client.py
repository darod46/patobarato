from pathlib import Path

import httpx
import pytest

from patobarato.sources.chollometro_client import USER_AGENT, ChollometroBlocked, ChollometroClient
from patobarato.sources.chollometro_parse import parse_listing

FIXTURES = Path(__file__).parent / "fixtures"


def _client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_fetch_new_parses_fixture():
    html = (FIXTURES / "chollometro_nuevos.html").read_text(encoding="utf-8")
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, text=html)

    async with _client(handler) as http:
        threads = await ChollometroClient(http).fetch_new()
    assert threads == parse_listing(html)
    assert threads
    assert seen[0].url.path == "/nuevos"
    assert seen[0].headers["User-Agent"] == USER_AGENT


@pytest.mark.parametrize("status", [403, 429])
async def test_blocked_status_raises(status):
    async with _client(lambda r: httpx.Response(status)) as http:
        client = ChollometroClient(http)
        with pytest.raises(ChollometroBlocked):
            await client.fetch_new()
        with pytest.raises(ChollometroBlocked):
            await client.fetch_thread("https://www.chollometro.com/ofertas/x-1")
        with pytest.raises(ChollometroBlocked):
            await client.resolve_visit("https://www.chollometro.com/visit/homenew/1")


async def test_fetch_thread_404_returns_none():
    async with _client(lambda r: httpx.Response(404)) as http:
        assert await ChollometroClient(http).fetch_thread("https://www.chollometro.com/x") is None


async def test_fetch_thread_parses_page():
    html = (FIXTURES / "chollometro_thread_active.html").read_text(encoding="utf-8")
    async with _client(lambda r: httpx.Response(200, text=html)) as http:
        thread = await ChollometroClient(http).fetch_thread(
            "https://www.chollometro.com/ofertas/lego-botanicals-margaritas-2060928"
        )
    assert thread is not None
    assert thread.thread_id == 2060928


async def test_resolve_visit_extracts_store_url():
    seen: list[httpx.Request] = []
    location = (
        "https://path.chollometro.com/pepper-es/redirect"
        "?url=https%3A%2F%2Fwww.amazon.es%2Fdp%2FB0TEST1234%3Ftag%3Dotro-21&product=x"
    )

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(302, headers={"Location": location})

    async with _client(handler) as http:
        result = await ChollometroClient(http).resolve_visit(
            "https://www.chollometro.com/visit/homenew/2060928"
        )
    assert result == "https://www.amazon.es/dp/B0TEST1234?tag=otro-21"
    assert len(seen) == 1
    assert seen[0].headers["User-Agent"] == USER_AGENT


async def test_resolve_visit_direct_store_location():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "https://www.ejemplo.com/x"})

    async with _client(handler) as http:
        result = await ChollometroClient(http).resolve_visit(
            "https://www.chollometro.com/visit/a/1"
        )
    assert result == "https://www.ejemplo.com/x"


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="ok"),
        httpx.Response(500),
        httpx.Response(302, headers={"Location": "https://path.chollometro.com/other"}),
        httpx.Response(302, headers={"Location": "/visit/b/2"}),
    ],
)
async def test_resolve_visit_none_cases(response):
    async with _client(lambda r: response) as http:
        result = await ChollometroClient(http).resolve_visit(
            "https://www.chollometro.com/visit/a/1"
        )
    assert result is None
