import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.models import ApiSource, GuideProduct, PriceQuote
from patobarato.sources.guide_prices import GuidePriceRefresher
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.base import BaseStore
from patobarato.stores.registry import StoreRegistry

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
SOURCE = ApiSource(1, "guide_prices", "guide-prices", "ES", {}, 360, [], None)


class FakeStore(BaseStore):
    id = "fake"
    name = "Fake"

    def __init__(self, quotes=None, affiliate=None):
        self.quotes = quotes or {}
        self.affiliate = affiliate
        self.calls: list[tuple[str, str]] = []

    def product_id(self, url):
        return url.rsplit("/", 1)[-1]

    def canonical_url(self, product_id, country):
        return f"https://fake.example/p/{product_id}?canon=1"

    async def affiliate_url(self, canonical_url, product_id):
        if isinstance(self.affiliate, Exception):
            raise self.affiliate
        return self.affiliate

    async def fetch_price(self, product_id, canonical_url):
        self.calls.append((product_id, canonical_url))
        value = self.quotes.get(product_id)
        if isinstance(value, list):
            return value.pop(0)
        return value


def _gp(ext, store="fake", name=None):
    return GuideProduct(store, ext, f"https://fake.example/p/{ext}", name or f"Guía {ext}", None)


def _make(products, store=None, delay=1.5):
    repo = InMemoryRepository()
    for p in products:
        repo.add_guide_product(p)
    sleeps: list[float] = []

    async def sleep(seconds):
        sleeps.append(seconds)

    stores = [store] if store else []
    refresher = GuidePriceRefresher(
        StoreRegistry(stores), repo, clock=lambda: NOW, sleep=sleep, delay_seconds=delay
    )
    return repo, refresher, sleeps


def test_type():
    assert GuidePriceRefresher.type == "guide_prices"


async def test_refresh_writes_price_and_image():
    store = FakeStore({"a": PriceQuote(Decimal("9.99"), Decimal("12.00"), image_url="http://img/a.jpg")})
    repo, refresher, _ = _make([_gp("a")], store)
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.prices[pid]["price"] == Decimal("9.99")
    assert repo.prices[pid]["previous_price"] == Decimal("12.00")
    assert repo.prices[pid]["error"] is None
    assert repo.prices[pid]["checked_at"] == NOW
    assert repo.product_images[pid] == "http://img/a.jpg"
    assert store.calls == [("a", "https://fake.example/p/a?canon=1")]


async def test_refresh_records_error_and_keeps_old_price():
    store = FakeStore({"a": [PriceQuote(Decimal("5"), None), None]})
    repo, refresher, _ = _make([_gp("a")], store)
    await refresher.run(SOURCE)
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.prices[pid]["error"] == "no price"
    assert repo.prices[pid]["price"] == Decimal("5")


async def test_refresh_unknown_store_marks_store_disabled():
    repo, refresher, _ = _make([_gp("a", store="gone"), _gp("b", store="gone")])
    existing = await repo.upsert_product(_offer_for("gone", "a"))
    await refresher.run(SOURCE)
    assert repo.prices[existing]["error"] == "store_disabled"
    # the product that did not exist is skipped, not inserted
    assert await repo.find_product_id("gone", "ES", "b") is None


def _offer_for(store, ext):
    from patobarato.models import ParsedOffer

    return ParsedOffer(
        asin=ext, country="ES", store=store, title="Existente", price=None, previous_price=None,
        coupon=None, hashtags=[], canonical_url=f"https://x/{ext}", product_url=f"https://x/{ext}",
    )


async def test_refresh_isolates_repo_exception(caplog):
    store = FakeStore({"a": PriceQuote(Decimal("1"), None), "b": PriceQuote(Decimal("2"), None)})
    repo, refresher, _ = _make([_gp("a"), _gp("b")], store)
    original = repo.upsert_product_price
    calls = 0

    async def flaky(product_id, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("boom")
        await original(product_id, **kwargs)

    repo.upsert_product_price = flaky
    with caplog.at_level(logging.INFO):
        await refresher.run(SOURCE)
    pid_b = await repo.find_product_id("fake", "ES", "b")
    assert repo.prices[pid_b]["price"] == Decimal("2")
    errors = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert errors and all("RuntimeError: boom" in m for m in errors)
    assert all("http" not in r.getMessage() for r in caplog.records)
    assert "boom" in errors[0]


async def test_refresh_sleeps_between_products():
    store = FakeStore({k: PriceQuote(Decimal("1"), None) for k in "abc"})
    _, refresher, sleeps = _make([_gp("a"), _gp("b"), _gp("c")], store, delay=0.7)
    await refresher.run(SOURCE)
    assert sleeps == [0.7, 0.7]


async def test_refresh_no_sleep_for_single_product():
    store = FakeStore({"a": PriceQuote(Decimal("1"), None)})
    _, refresher, sleeps = _make([_gp("a")], store)
    await refresher.run(SOURCE)
    assert sleeps == []


async def test_refresh_existing_title_is_kept():
    store = FakeStore({"a": PriceQuote(Decimal("3"), None)})
    repo, refresher, _ = _make([_gp("a", name="Nombre de la guía")], store)
    pid = await repo.upsert_product(_offer_for("fake", "a"))
    await refresher.run(SOURCE)
    assert repo.product_titles[pid] == "Existente"
    assert repo.prices[pid]["price"] == Decimal("3")


async def test_refresh_new_product_uses_guide_name_and_skips_drafts():
    store = FakeStore({"a": PriceQuote(Decimal("3"), None), "draft": PriceQuote(Decimal("1"), None)})
    repo, refresher, _ = _make([_gp("a", name="Nombre de la guía")], store)
    repo.add_guide_product(_gp("[ASIN]"), published=False)
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.product_titles[pid] == "Nombre de la guía"
    assert [c[0] for c in store.calls] == ["a"]


async def test_refresh_uses_canonical_for_and_logs_totals(caplog):
    store = FakeStore({"a": PriceQuote(Decimal("3"), None)})
    _, refresher, _ = _make([_gp("a")], store)
    with caplog.at_level(logging.INFO):
        await refresher.run(SOURCE)
    assert "GuidePrices: 1 products, 1 updated (0 from_catalog), 0 failed, 0 skipped" in caplog.text


async def test_refresh_bad_url_is_isolated():
    class Raising(FakeStore):
        def canonical_for(self, url, country):
            if url.endswith("/a"):
                raise ValueError("no id")
            return super().canonical_for(url, country)

    store = Raising({"b": PriceQuote(Decimal("2"), None)})
    repo, refresher, _ = _make([_gp("a"), _gp("b")], store)
    await refresher.run(SOURCE)
    assert await repo.find_product_id("fake", "ES", "a") is None
    pid = await repo.find_product_id("fake", "ES", "b")
    assert repo.prices[pid]["price"] == Decimal("2")


async def test_refresh_redacts_urls_in_errors(caplog):
    class Leaky(FakeStore):
        async def fetch_price(self, product_id, canonical_url):
            raise RuntimeError(f"failed GET {canonical_url} now")

    _, refresher, _ = _make([_gp("a")], Leaky())
    with caplog.at_level(logging.ERROR):
        await refresher.run(SOURCE)
    assert "RuntimeError: failed GET <url> now" in caplog.text
    assert "fake.example" not in caplog.text


async def test_refresh_keeps_existing_image_and_sets_missing_one():
    store = FakeStore({k: PriceQuote(Decimal("1"), None, image_url=f"http://img/new-{k}") for k in "ab"})
    repo, refresher, _ = _make([_gp("a"), _gp("b")], store)
    has = await repo.upsert_product(_offer_for("fake", "a"))
    lacks = await repo.upsert_product(_offer_for("fake", "b"))
    await repo.set_product_image(has, "http://img/old")
    await refresher.run(SOURCE)
    assert repo.product_images[has] == "http://img/old"
    assert repo.product_images[lacks] == "http://img/new-b"


async def test_refresh_sets_image_on_product_created_in_this_pass():
    store = FakeStore({"a": PriceQuote(Decimal("1"), None, image_url="http://img/a")})
    repo, refresher, _ = _make([_gp("a")], store)
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.product_images[pid] == "http://img/a"


async def test_refresh_does_not_sleep_after_product_without_network_call():
    store = FakeStore({"b": PriceQuote(Decimal("1"), None), "c": PriceQuote(Decimal("1"), None)})
    _, refresher, sleeps = _make([_gp("a", store="aaa"), _gp("b"), _gp("c")], store)
    await refresher.run(SOURCE)
    assert sleeps == [1.5]


async def test_refresh_stores_affiliate_url():
    store = FakeStore({"a": PriceQuote(Decimal("9.99"), None)}, affiliate="https://aff.example/x")
    repo, refresher, _ = _make([_gp("a")], store)
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.prices[pid]["affiliate_url"] == "https://aff.example/x"


async def test_refresh_affiliate_failure_stores_none_and_logs_without_url(caplog):
    store = FakeStore(
        {"a": PriceQuote(Decimal("9.99"), None)},
        affiliate=RuntimeError("boom https://secret.example/t?k=1"),
    )
    repo, refresher, _ = _make([_gp("a")], store)
    with caplog.at_level(logging.WARNING, logger="patobarato.guide_prices"):
        await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.prices[pid]["price"] == Decimal("9.99")
    assert repo.prices[pid]["affiliate_url"] is None
    assert "affiliate=missing (RuntimeError:" in caplog.text
    assert "secret.example" not in caplog.text


CANON = "https://fake.example/p/a?canon=1"


def _catalog_row(updated_at, sale="8.00", price="10.00", image="http://img/cat", in_stock=True):
    from patobarato.models import CatalogRow

    return CatalogRow(
        "fake", "a", "Título", None, None, None, None, Decimal(price),
        Decimal(sale) if sale else None, "EUR", in_stock, image, CANON,
        "https://aff.example/cat", None, updated_at,
    )


def _put(repo, row):
    repo.catalog[(row.store, row.external_id)] = row


async def test_refresh_prefers_fresh_catalog_row(caplog):
    store = FakeStore({"a": PriceQuote(Decimal("1"), None)}, affiliate="https://aff.example/live")
    repo, refresher, _ = _make([_gp("a")], store)
    _put(repo, _catalog_row(NOW - timedelta(hours=2)))
    with caplog.at_level(logging.INFO):
        await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert store.calls == []
    assert repo.prices[pid]["price"] == Decimal("8.00")
    assert repo.prices[pid]["previous_price"] == Decimal("10.00")
    assert repo.prices[pid]["currency"] == "EUR"
    assert repo.prices[pid]["affiliate_url"] == "https://aff.example/cat"
    assert repo.prices[pid]["error"] is None
    assert repo.prices[pid]["checked_at"] == NOW
    assert repo.product_images[pid] == "http://img/cat"
    assert "1 updated (1 from_catalog)" in caplog.text


async def test_refresh_ignores_stale_catalog_row():
    store = FakeStore({"a": PriceQuote(Decimal("1"), None)})
    repo, refresher, _ = _make([_gp("a")], store)
    _put(repo, _catalog_row(NOW - timedelta(hours=40)))
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert len(store.calls) == 1
    assert repo.prices[pid]["price"] == Decimal("1")


async def test_refresh_catalog_row_without_updated_at_is_stale():
    store = FakeStore({"a": PriceQuote(Decimal("1"), None)})
    repo, refresher, _ = _make([_gp("a")], store)
    _put(repo, _catalog_row(None))
    await refresher.run(SOURCE)
    assert len(store.calls) == 1


async def test_refresh_catalog_row_without_sale_has_no_previous():
    store = FakeStore()
    repo, refresher, _ = _make([_gp("a")], store)
    _put(repo, _catalog_row(NOW - timedelta(hours=1), sale=None))
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("fake", "ES", "a")
    assert repo.prices[pid]["price"] == Decimal("10.00")
    assert repo.prices[pid]["previous_price"] is None


async def test_refresh_catalog_keeps_existing_image_and_does_not_sleep():
    store = FakeStore({"b": PriceQuote(Decimal("1"), None)})
    repo, refresher, sleeps = _make([_gp("a"), _gp("b")], store)
    pid = await repo.upsert_product(_offer_for("fake", "a"))
    await repo.set_product_image(pid, "http://img/old")
    _put(repo, _catalog_row(NOW - timedelta(hours=1)))
    await refresher.run(SOURCE)
    assert repo.product_images[pid] == "http://img/old"
    assert sleeps == []


async def test_refresh_ignores_out_of_stock_catalog_row():
    store = FakeStore({"a": PriceQuote(Decimal("1"), None)})
    repo, refresher, _ = _make([_gp("a")], store)
    _put(repo, _catalog_row(NOW - timedelta(hours=1), in_stock=False))
    await refresher.run(SOURCE)
    assert len(store.calls) == 1


async def test_refresh_catalog_row_exactly_36h_is_stale():
    store = FakeStore({"a": PriceQuote(Decimal("1"), None)})
    repo, refresher, _ = _make([_gp("a")], store)
    _put(repo, _catalog_row(NOW - timedelta(hours=36)))
    await refresher.run(SOURCE)
    assert len(store.calls) == 1


async def test_refresh_finds_awin_row_stored_at_canonical_url_from_tagged_guide_url():
    from patobarato.stores.awin import awin_store

    store = awin_store("pccomponentes", None, None, None)
    repo = InMemoryRepository()
    url = "https://www.pccomponentes.com/foo-bar?tag=x"
    repo.add_guide_product(GuideProduct("pccomponentes", "foo-bar", url, "Foo", None))
    row = _catalog_row(NOW - timedelta(hours=1))
    import dataclasses

    row = dataclasses.replace(row, store="pccomponentes", url=store.canonical_for(url, "ES"))
    _put(repo, row)

    async def sleep(_):
        pass

    refresher = GuidePriceRefresher(StoreRegistry([store]), repo, clock=lambda: NOW, sleep=sleep)
    await refresher.run(SOURCE)
    pid = await repo.find_product_id("pccomponentes", "ES", "foo-bar")
    assert repo.prices[pid]["price"] == Decimal("8.00")
