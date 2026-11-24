import dataclasses
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.models import ParsedOffer, PriceQuote, PublicationStatus
from patobarato.sources.deal_check import CheckSummary, DealChecker
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.base import BaseStore
from patobarato.stores.registry import StoreRegistry

NOW = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)


class FakeStore(BaseStore):
    """Quotes per asin: a PriceQuote, a failure reason (str) or None (no reason)."""

    id = "amazon"
    name = "Amazon"

    def __init__(self, quotes=None):
        self.quotes = quotes or {}
        self.calls: list[tuple[str, str]] = []
        self._last_failure: str | None = None

    @property
    def last_failure(self):
        return self._last_failure

    def product_id(self, url):
        return url.rsplit("/", 1)[-1]

    def canonical_url(self, product_id, country):
        return f"https://www.amazon.es/dp/{product_id}"

    async def fetch_price(self, product_id, canonical_url):
        self.calls.append((product_id, canonical_url))
        value = self.quotes.get(product_id)
        if isinstance(value, list):
            value = value.pop(0)
        if isinstance(value, PriceQuote):
            self._last_failure = None
            return value
        self._last_failure = value
        return None


def _offer(asin):
    return ParsedOffer(
        asin=asin,
        country="ES",
        store="amazon",
        title=f"Producto {asin}",
        price=Decimal("9.99"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url=f"https://www.amazon.es/dp/{asin}",
        product_url=f"https://www.amazon.es/dp/{asin}",
    )


async def _seed(repo, asin, price="10.00", age_days=1, **kwargs):
    offer = _offer(asin)
    source = repo.add_source(f"@c{asin}")
    product_id = await repo.upsert_product(offer)
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    return await repo.insert_publication(
        offer_id, product_id, "ES", -1001, 5, Decimal(price), "https://aff",
        NOW - timedelta(days=age_days), **kwargs,
    )


def _pub(repo, publication_id):
    return next(p for p in repo.publications() if p["id"] == publication_id)


def _quote(price):
    return PriceQuote(Decimal(price), None)


def _make(repo, store, delay=1.5):
    sleeps: list[float] = []

    async def sleep(seconds):
        sleeps.append(seconds)

    checker = DealChecker(
        StoreRegistry([store]), repo, clock=lambda: NOW, sleep=sleep, delay_seconds=delay
    )
    return checker, sleeps


async def test_price_up_ends_and_leaves_post_pending(caplog):
    repo = InMemoryRepository()
    pid = await _seed(repo, "B01", "29.99")
    store = FakeStore({"B01": _quote("34.99")})
    checker, _ = _make(repo, store)
    with caplog.at_level(logging.INFO, logger="patobarato.deal_check"):
        summary = await checker.run()
    row = _pub(repo, pid)
    assert row["status"] == PublicationStatus.ENDED
    assert row["ended_at"] == NOW and row["checked_at"] == NOW
    assert row["post_synced_at"] is None
    assert summary.checked == 1 and summary.ended == 1
    assert summary.posts_pending == 1
    assert store.calls == [("B01", "https://www.amazon.es/dp/B01")]
    assert "DealCheck: amazon B01 published 29.99 now 34.99 -> ended" in caplog.text
    assert "https://aff" not in caplog.text


async def test_same_or_lower_price_kept_and_checked():
    repo = InMemoryRepository()
    same = await _seed(repo, "B01", "10.00")
    lower = await _seed(repo, "B02", "10.00")
    store = FakeStore({"B01": _quote("10.00"), "B02": _quote("8.50")})
    checker, _ = _make(repo, store)
    summary = await checker.run()
    for pid in (same, lower):
        row = _pub(repo, pid)
        assert row["status"] == PublicationStatus.ACTIVE
        assert row["checked_at"] == NOW
    assert summary.kept == 2 and summary.ended == 0
    assert summary.posts_pending == 0


async def test_no_price_is_unknown_and_checked():
    repo = InMemoryRepository()
    no_price = await _seed(repo, "B01")
    no_reason = await _seed(repo, "B02")
    store = FakeStore({"B01": "no price in page", "B02": None})
    checker, _ = _make(repo, store)
    summary = await checker.run()
    assert summary.unknown == 2 and summary.failed == 0
    for pid in (no_price, no_reason):
        row = _pub(repo, pid)
        assert row["checked_at"] == NOW
        assert row["status"] == PublicationStatus.ACTIVE


async def test_network_failure_is_failed_and_not_checked():
    repo = InMemoryRepository()
    pid = await _seed(repo, "B01")
    other = await _seed(repo, "B02")
    store = FakeStore({"B01": "network error (ConnectTimeout)", "B02": "HTTP 404"})
    checker, _ = _make(repo, store)
    summary = await checker.run()
    assert summary.failed == 2 and summary.stopped_blocked is False
    assert _pub(repo, pid)["checked_at"] is None
    assert _pub(repo, other)["checked_at"] is None


async def test_two_blocks_in_a_row_stop():
    repo = InMemoryRepository()
    for i, age in enumerate([1, 2, 3, 4]):
        await _seed(repo, f"B0{i}", age_days=age)
    store = FakeStore(
        {"B00": _quote("1.00"), "B01": "captcha", "B02": "HTTP 503", "B03": _quote("1.00")}
    )
    checker, _ = _make(repo, store)
    summary = await checker.run()
    assert summary.stopped_blocked is True
    assert [c[0] for c in store.calls] == ["B00", "B01", "B02"]
    assert summary.checked == 3 and summary.kept == 1 and summary.failed == 2


async def test_block_success_block_does_not_stop():
    repo = InMemoryRepository()
    for i, age in enumerate([1, 2, 3, 4]):
        await _seed(repo, f"B0{i}", age_days=age)
    store = FakeStore(
        {
            "B00": "captcha",
            "B01": _quote("1.00"),
            "B02": "blocked page (no product, title 'Amazon.es')",
            "B03": _quote("1.00"),
        }
    )
    checker, _ = _make(repo, store)
    summary = await checker.run()
    assert summary.stopped_blocked is False
    assert len(store.calls) == 4
    assert summary.failed == 2 and summary.kept == 2


async def test_sleeps_between_requests():
    repo = InMemoryRepository()
    for i in range(3):
        await _seed(repo, f"B0{i}", age_days=i + 1)
    store = FakeStore({f"B0{i}": _quote("1.00") for i in range(3)})
    checker, sleeps = _make(repo, store, delay=2.0)
    await checker.run()
    assert sleeps == [2.0, 2.0]


async def test_stale_deals_ended_and_counted_as_pending_posts():
    repo = InMemoryRepository()
    stale = [await _seed(repo, f"S0{i}", age_days=31 + i) for i in range(3)]
    old_unsynced = await _seed(
        repo, "E01", status=PublicationStatus.ENDED, ended_at=NOW - timedelta(days=2)
    )
    checker, _ = _make(repo, FakeStore())
    summary = await checker.run()
    assert summary.stale_ended == 3
    assert all(_pub(repo, pid)["status"] == PublicationStatus.ENDED for pid in stale)
    assert all(_pub(repo, pid)["post_synced_at"] is None for pid in stale)
    # the three just ended plus the old one still waiting for the server bot
    assert summary.posts_pending == 4
    assert _pub(repo, old_unsynced)["post_synced_at"] is None


async def test_dry_run_writes_nothing():
    repo = InMemoryRepository()
    await _seed(repo, "B01", "5.00")
    await _seed(repo, "B02", "5.00", age_days=2)
    await _seed(repo, "B03", "5.00", age_days=3)
    await _seed(repo, "S01", age_days=40)
    store = FakeStore({"B01": _quote("9.00"), "B02": _quote("5.00"), "B03": "no price"})
    checker, _ = _make(repo, store)
    before = [dict(p) for p in repo.publications()]
    summary = await checker.run(dry_run=True)
    assert summary.dry_run is True
    assert (summary.ended, summary.kept, summary.unknown, summary.stale_ended) == (1, 1, 1, 1)
    assert repo.publications() == before
    assert summary.posts_pending == 0
    assert "Posts pendientes" not in summary.format()


def test_format_text():
    summary = CheckSummary(
        checked=600, ended=41, kept=530, unknown=29, stale_ended=1812,
        posts_pending=1771,
    )
    text = summary.format()
    assert "Comprobadas 600: 41 caducadas, 530 siguen, 29 sin precio." in text
    assert "Caducadas por antigüedad (>30 días): 1.812." in text
    assert "Posts pendientes de editar en el servidor: 1.771." in text
    assert "editados" not in text
    assert "bloqueado" not in text
    assert "Posts pendientes de editar en el servidor: 0." in CheckSummary().format()


def test_format_blocked_failed_and_dry_run():
    text = dataclasses.replace(
        CheckSummary(), checked=3, failed=2, stopped_blocked=True, dry_run=True
    ).format()
    assert "2 sin leer" in text
    assert "Amazon ha bloqueado dos peticiones seguidas; parada." in text
    assert "Simulación" in text


async def test_page_without_price_resets_block_streak():
    repo = InMemoryRepository()
    for i, age in enumerate([1, 2, 3]):
        await _seed(repo, f"B0{i}", age_days=age)
    store = FakeStore({"B00": "captcha", "B01": "no price in page", "B02": "HTTP 503"})
    checker, _ = _make(repo, store)
    summary = await checker.run()
    assert summary.stopped_blocked is False and len(store.calls) == 3


async def test_without_amazon_store_still_ends_stale():
    repo = InMemoryRepository()
    stale = await _seed(repo, "S01", age_days=40)
    checker = DealChecker(StoreRegistry([]), repo, clock=lambda: NOW)
    summary = await checker.run()
    assert summary.stale_ended == 1 and summary.checked == 0
    assert _pub(repo, stale)["status"] == PublicationStatus.ENDED
    assert summary.posts_pending == 1


