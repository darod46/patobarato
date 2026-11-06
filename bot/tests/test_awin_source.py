import json
import logging
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from patobarato.config import Settings
from patobarato.models import ApiSource, CouponUpsert
from patobarato.sources.awin_source import AwinClient, AwinPromotion, AwinPromotionsSource
from patobarato.storage.repository import InMemoryRepository

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "awin_promotions.json").read_text())
MERCHANTS = {"pccomponentes": 1234, "mediamarkt": 5678, "elcorteingles": None}


def _settings(**kw) -> Settings:
    return Settings(
        _env_file=None,
        telegram_api_id=1,
        telegram_api_hash="hash",
        telegram_bot_token="token",
        supabase_url="https://example.supabase.co",
        supabase_service_key="key",
        **kw,
    )


def _source(config=None) -> ApiSource:
    return ApiSource(
        id=7,
        type="awin_promotions",
        identifier="awin-es",
        country="ES",
        config=config or {},
        every_minutes=360,
        hashtags=[],
        last_run_at=None,
    )


def _client(handler) -> AwinClient:
    return AwinClient(httpx.AsyncClient(transport=httpx.MockTransport(handler)), "999", "secret-token")


class _FakeClient:
    def __init__(self, promotions=None, error=None):
        self.promotions_result = promotions or []
        self.error = error
        self.calls = []

    async def promotions(self, advertiser_ids):
        self.calls.append(advertiser_ids)
        if self.error:
            raise self.error
        return self.promotions_result


class _SpyRepo(InMemoryRepository):
    def __init__(self):
        super().__init__()
        self.deactivations = []

    async def deactivate_coupons_not_in(self, source_id, external_ids):
        self.deactivations.append((source_id, set(external_ids)))
        return await super().deactivate_coupons_not_in(source_id, external_ids)


async def _promotions_from_fixture():
    def handler(request):
        return httpx.Response(200, json=FIXTURE)

    return await _client(handler).promotions([1234, 5678])


async def test_client_posts_documented_body_and_bearer():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=FIXTURE)

    promos = await _client(handler).promotions([1234, 5678])

    assert len(seen) == 1
    req = seen[0]
    assert req.method == "POST"
    assert str(req.url) == "https://api.awin.com/publishers/999/promotions/"
    assert req.headers["Authorization"] == "Bearer secret-token"
    body = json.loads(req.content)
    assert body == {
        "filters": {
            "advertiserIds": [1234, 5678],
            "regionCodes": ["ES"],
            "type": "voucher",
            "membership": "joined",
        },
        "pagination": {"page": 1, "pageSize": 200},
    }
    assert len(promos) == 3


async def test_client_maps_fields_and_dates():
    promos = await _promotions_from_fixture()
    first, second, third = promos
    assert first == AwinPromotion(
        promotion_id="111001",
        advertiser_id=1234,
        title="5% de descuento en componentes",
        description="Descuento en toda la categoria de componentes",
        terms="Valido para compras superiores a 100 EUR. No acumulable.",
        code="COMP5",
        url_tracking=FIXTURE["data"][0]["urlTracking"],
        start=datetime(2026, 11, 1, tzinfo=UTC),
        end=datetime(2026, 11, 30, 23, 59, 59, tzinfo=UTC),
    )
    assert second.start == datetime(2026, 11, 5, 8, tzinfo=timezone(timedelta(hours=1)))
    assert second.end is None and second.terms is None
    assert third.code is None


async def test_client_tolerates_missing_keys():
    def handler(request):
        return httpx.Response(200, json={"data": [{"promotionId": 5, "advertiser": {"id": 1}}]})

    [promo] = await _client(handler).promotions([1])
    assert promo.promotion_id == "5"
    assert promo.code is None and promo.start is None and promo.end is None
    assert promo.title == "" and promo.url_tracking == ""


async def test_client_paginates_until_short_page():
    pages = []

    def handler(request):
        page = json.loads(request.content)["pagination"]["page"]
        pages.append(page)
        count = 200 if page == 1 else 2
        data = [{"promotionId": page * 1000 + i, "advertiser": {"id": 1}} for i in range(count)]
        return httpx.Response(200, json={"data": data})

    promos = await _client(handler).promotions([1])
    assert pages == [1, 2]
    assert len(promos) == 202


async def test_client_http_error_raises():
    def handler(request):
        return httpx.Response(401, json={"error": "unauthorized"})

    with pytest.raises(httpx.HTTPStatusError):
        await _client(handler).promotions([1])


async def test_source_upserts_vouchers_and_deactivates_rest():
    repo = _SpyRepo()
    client = _FakeClient(await _promotions_from_fixture())
    await AwinPromotionsSource(client, repo, _settings(awin_merchants=MERCHANTS)).run(_source())

    assert client.calls == [[1234, 5678]]
    rows = sorted(repo.coupons.values(), key=lambda r: r["external_id"])
    assert [r["external_id"] for r in rows] == ["111001", "111002"]
    assert rows[0]["store"] == "pccomponentes"
    assert rows[0]["code"] == "COMP5"
    assert rows[0]["source_id"] == 7
    assert rows[0]["url"] == FIXTURE["data"][0]["urlTracking"]
    assert rows[0]["conditions"].startswith("Valido para compras")
    assert rows[0]["starts_at"] == datetime(2026, 11, 1, tzinfo=UTC)
    assert rows[0]["expires_at"] == datetime(2026, 11, 30, 23, 59, 59, tzinfo=UTC)
    # terms is null: falls back to the description
    assert rows[1]["store"] == "mediamarkt"
    assert rows[1]["conditions"] == "Cupon para televisores seleccionados"
    assert rows[1]["expires_at"] is None
    assert repo.deactivations == [(7, {"111001", "111002"})]


async def test_source_failure_deactivates_nothing():
    repo = _SpyRepo()
    await repo.upsert_coupon(
        CouponUpsert(7, "old", "pccomponentes", "OLD", "Old", None, "https://x", None, None)
    )
    error = httpx.HTTPStatusError(
        "boom", request=httpx.Request("POST", "https://api.awin.com/x"), response=httpx.Response(500)
    )
    source = AwinPromotionsSource(_FakeClient(error=error), repo, _settings(awin_merchants=MERCHANTS))
    with pytest.raises(httpx.HTTPStatusError):
        await source.run(_source())
    assert repo.deactivations == []
    assert all(row["active"] for row in repo.coupons.values())


async def test_successful_empty_fetch_deactivates_all():
    repo = _SpyRepo()
    await AwinPromotionsSource(_FakeClient([]), repo, _settings(awin_merchants=MERCHANTS)).run(_source())
    assert repo.deactivations == [(7, set())]


async def test_unknown_advertiser_is_skipped():
    repo = _SpyRepo()
    promos = await _promotions_from_fixture()
    stranger = AwinPromotion("999", 4242, "T", None, None, "CODE", "https://t", None, None)
    await AwinPromotionsSource(
        _FakeClient([*promos, stranger]), repo, _settings(awin_merchants=MERCHANTS)
    ).run(_source())
    assert repo.deactivations == [(7, {"111001", "111002"})]


async def test_config_merchants_override_settings():
    repo = _SpyRepo()
    client = _FakeClient(await _promotions_from_fixture())
    await AwinPromotionsSource(client, repo, _settings(awin_merchants={"pccomponentes": 1})).run(
        _source({"merchants": {"mediamarkt": 5678}})
    )
    assert client.calls == [[5678]]
    assert [r["external_id"] for r in repo.coupons.values()] == ["111002"]


async def test_no_merchants_warns_and_does_nothing(caplog):
    repo = _SpyRepo()
    client = _FakeClient()
    settings = _settings(awin_merchants={"pccomponentes": None})
    with caplog.at_level(logging.WARNING):
        await AwinPromotionsSource(client, repo, settings).run(_source())
    assert client.calls == [] and repo.deactivations == []
    assert any(r.levelno == logging.WARNING for r in caplog.records)


async def test_logs_never_contain_token_or_tracking_url(caplog):
    repo = _SpyRepo()
    with caplog.at_level(logging.DEBUG):
        await AwinPromotionsSource(
            _FakeClient(await _promotions_from_fixture()), repo, _settings(awin_merchants=MERCHANTS)
        ).run(_source())
    assert "awin1.com" not in caplog.text and "secret-token" not in caplog.text
