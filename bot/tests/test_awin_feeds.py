import logging
from datetime import UTC, datetime
from decimal import Decimal

from patobarato.config import Settings
from patobarato.models import ApiSource, AwinFeedProduct, CatalogRow
from patobarato.sources.awin_feeds import AwinFeedsSource
from patobarato.sources.awin_source import AwinFeedError
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 9, 3, 0, tzinfo=UTC)
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
        id=9, type="awin_feeds", identifier="awin-feeds", country="ES",
        config=config or {}, every_minutes=1440, hashtags=[], last_run_at=None,
    )


def _product(i) -> AwinFeedProduct:
    return AwinFeedProduct(
        external_id=str(i), title=f"Producto {i}", description=None, brand="B", gtin=None,
        category="C", price=Decimal("10.00"), sale_price=None, in_stock=True,
        image_url=None, url=f"https://shop/{i}", affiliate_url=f"https://aff/{i}",
    )


class _FakeClient:
    """feeds: advertiser id -> list of products, optionally ending with an exception."""

    def __init__(self, feeds):
        self.feeds = feeds
        self.calls = []

    async def download_feed(self, advertiser_id, locale="es_ES"):
        self.calls.append(advertiser_id)
        for item in self.feeds[advertiser_id]:
            if isinstance(item, Exception):
                raise item
            yield item


class _SpyRepo(InMemoryRepository):
    def __init__(self):
        super().__init__()
        self.batches = []
        self.oos_calls = []

    async def upsert_catalog_products(self, rows):
        self.batches.append(len(rows))
        await super().upsert_catalog_products(rows)

    async def mark_catalog_out_of_stock(self, store, seen_ids):
        self.oos_calls.append(store)
        return await super().mark_catalog_out_of_stock(store, seen_ids)


def _source_runner(client, repo, sleeps=None, **kw):
    async def sleep(seconds):
        if sleeps is not None:
            sleeps.append(seconds)

    return AwinFeedsSource(
        client, repo, _settings(awin_merchants=MERCHANTS), clock=lambda: NOW, sleep=sleep, **kw
    )


def _row(store, ext_id, in_stock=True) -> CatalogRow:
    return CatalogRow(
        store=store, external_id=ext_id, title="t", description=None, brand=None, gtin=None,
        category=None, price=Decimal("1"), sale_price=None, currency="EUR", in_stock=in_stock,
        image_url=None, url=f"https://shop/{ext_id}", affiliate_url="https://aff", feed_updated_at=NOW,
    )


async def test_run_upserts_in_batches():
    repo = _SpyRepo()
    client = _FakeClient({1234: [_product(i) for i in range(1201)], 5678: []})
    await _source_runner(client, repo).run(_source())
    assert repo.batches == [500, 500, 201]
    assert len(repo.catalog) == 1201
    row = repo.catalog[("pccomponentes", "7")]
    assert row.feed_updated_at == NOW
    assert row.currency == "EUR"
    assert repo.feed_runs[("pccomponentes", 1234)] == {"last_run_at": NOW, "products": 1201, "last_error": None}


async def test_run_dedupes_repeated_ids_within_a_batch():
    repo = _SpyRepo()
    client = _FakeClient({1234: [_product(1), _product(1), _product(2)], 5678: []})
    await _source_runner(client, repo).run(_source())
    assert repo.batches == [2]
    assert repo.feed_runs[("pccomponentes", 1234)]["products"] == 2


async def test_run_marks_missing_out_of_stock_after_success(caplog):
    repo = _SpyRepo()
    await repo.upsert_catalog_products([_row("pccomponentes", x) for x in "abc"])
    client = _FakeClient({1234: [_product("a"), _product("b")], 5678: []})
    with caplog.at_level(logging.INFO, logger="patobarato.awin_feeds"):
        await _source_runner(client, repo).run(_source())
    assert repo.catalog[("pccomponentes", "c")].in_stock is False
    assert repo.catalog[("pccomponentes", "a")].in_stock is True
    assert "out_of_stock=1" in caplog.text


async def test_run_failed_feed_keeps_stock_and_records_error():
    repo = _SpyRepo()
    await repo.upsert_catalog_products([_row("pccomponentes", "old")])
    repo.batches.clear()
    feed = [_product(i) for i in range(300)] + [AwinFeedError("HTTP 429")]
    client = _FakeClient({1234: feed, 5678: []})
    await _source_runner(client, repo).run(_source())
    assert repo.batches == [300]
    assert "pccomponentes" not in repo.oos_calls
    assert repo.catalog[("pccomponentes", "old")].in_stock is True
    run = repo.feed_runs[("pccomponentes", 1234)]
    assert run["last_error"] == "AwinFeedError: HTTP 429"


async def test_run_sleeps_between_feeds_not_after_last():
    sleeps = []
    client = _FakeClient({1234: [], 5678: []})
    await _source_runner(client, _SpyRepo(), sleeps, pause_seconds=12.5).run(_source())
    assert client.calls == [1234, 5678]
    assert sleeps == [12.5]


async def test_run_without_merchants_warns(caplog):
    client = _FakeClient({})
    runner = AwinFeedsSource(client, _SpyRepo(), _settings(awin_merchants={"x": None}), clock=lambda: NOW)
    with caplog.at_level(logging.WARNING, logger="patobarato.awin_feeds"):
        await runner.run(_source())
    assert client.calls == []
    assert "no merchant ids" in caplog.text


async def test_run_isolates_one_merchant_failure(caplog):
    repo = _SpyRepo()
    client = _FakeClient({1234: [AwinFeedError("HTTP 500")], 5678: [_product(1)]})
    with caplog.at_level(logging.ERROR, logger="patobarato.awin_feeds"):
        await _source_runner(client, repo).run(_source())
    assert ("mediamarkt", "1") in repo.catalog
    assert repo.feed_runs[("mediamarkt", 5678)]["last_error"] is None
    assert repo.feed_runs[("pccomponentes", 1234)]["last_error"] == "AwinFeedError: HTTP 500"
    assert "AwinFeedError: HTTP 500" in caplog.text
    assert "http" not in caplog.text.replace("HTTP", "").lower()


async def test_run_config_merchants_take_priority():
    client = _FakeClient({42: [_product(1)]})
    await _source_runner(client, _SpyRepo()).run(_source({"merchants": {"fnac": 42}}))
    assert client.calls == [42]
