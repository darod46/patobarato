import json

import httpx
import pytest

from patobarato.enrich.deepseek import DeepSeekClient, DeepSeekError, DeepSeekFatal


def _ok(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def _client(responses: list, seen: list | None = None) -> DeepSeekClient:
    queue = list(responses)

    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return queue.pop(0)

    async def no_sleep(_: float) -> None:
        return None

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return DeepSeekClient(http, "sk-secret", sleep=no_sleep)


async def test_sends_json_mode_without_thinking_and_parses_the_object():
    seen: list = []
    client = _client([_ok('{"description": "x", "category": "hogar"}')], seen)
    assert await client.json_completion("sys", "user json") == {"description": "x", "category": "hogar"}
    request = seen[0]
    assert str(request.url) == "https://api.deepseek.com/chat/completions"
    assert request.headers["Authorization"] == "Bearer sk-secret"
    body = json.loads(request.content)
    assert body["model"] == "deepseek-flash"
    assert body["thinking"] == {"type": "disabled"}
    assert body["response_format"] == {"type": "json_object"}
    assert body["max_tokens"] == 400
    assert [m["role"] for m in body["messages"]] == ["system", "user"]


async def test_retries_blank_content_invalid_json_and_rate_limits():
    client = _client([_ok(""), _ok("no es json"), _ok('{"a": 1}')])
    assert await client.json_completion("s", "u") == {"a": 1}
    client = _client([httpx.Response(429), httpx.Response(503), _ok('{"a": 2}')])
    assert await client.json_completion("s", "u") == {"a": 2}


async def test_gives_up_after_three_attempts():
    client = _client([httpx.Response(500)] * 3)
    with pytest.raises(DeepSeekError, match="HTTP 500"):
        await client.json_completion("s", "u")


async def test_bad_key_or_no_balance_is_fatal_and_not_retried():
    for status in (401, 402):
        seen: list = []
        client = _client([httpx.Response(status)], seen)
        with pytest.raises(DeepSeekFatal):
            await client.json_completion("s", "u")
        assert len(seen) == 1


async def test_error_messages_never_contain_the_key():
    client = _client([httpx.Response(400)])
    with pytest.raises(DeepSeekError) as info:
        await client.json_completion("s", "u")
    assert "sk-secret" not in str(info.value)
