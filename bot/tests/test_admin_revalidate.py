import httpx
import pytest

from patobarato.admin.revalidate import RevalidateError, WebRevalidator


async def test_revalidator_noop_when_unconfigured():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await WebRevalidator(http, None, None).revalidate()
        await WebRevalidator(http, "https://x/api/revalidate", None).revalidate()
    assert calls == []


async def test_revalidator_sends_secret_header():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        await WebRevalidator(http, "https://x/api/revalidate", "s3cret").revalidate()
    assert seen[0].method == "POST"
    assert seen[0].headers["x-revalidate-secret"] == "s3cret"


async def test_revalidator_error_has_no_secret():
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(401))
    ) as http:
        with pytest.raises(RevalidateError) as exc:
            await WebRevalidator(http, "https://x/api/revalidate", "s3cret").revalidate()
    assert "s3cret" not in str(exc.value)
    assert "401" in str(exc.value)


async def test_revalidator_network_error_is_revalidate_error():
    def handler(request):
        raise httpx.ConnectError("boom")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        with pytest.raises(RevalidateError):
            await WebRevalidator(http, "https://x/api/revalidate", "s3cret").revalidate()
