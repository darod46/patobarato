import logging
from decimal import Decimal

import pytest

from patobarato.models import ApiSource
from patobarato.sources.event_promos import EventPromosSource
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.aliexpress_client import AliExpressError, AliProduct, AliPromoPage


def _source() -> ApiSource:
    return ApiSource(
        id=1, type="event_promos", identifier="event-promos", country="ES",
        config={}, every_minutes=1440, hashtags=[], last_run_at=None,
    )


def _product(i, price="10.00", original="20.00", link="https://aff/x") -> AliProduct:
    return AliProduct(
        product_id=str(i), title=f"P{i}", price=Decimal(price),
        original_price=Decimal(original) if original is not None else None,
        discount=None, image_url=None, url=f"https://ali/{i}",
        promotion_link=link if link is None else f"{link}/{i}",
    )


def _page(start, count, has_more) -> AliPromoPage:
    return AliPromoPage([_product(start + n) for n in range(count)], has_more)


class FakePromoClient:
    """pages: promo name -> {page_no: AliPromoPage | Exception}; a bare dict is used for every promo."""

    def __init__(self, pages):
        self.pages = pages
        self.calls: list[tuple[str, int]] = []

    async def featured_promo_products(self, promo_name, page_no=1, page_size=50):
        self.calls.append((promo_name, page_no))
        pages = self.pages[promo_name] if promo_name in self.pages else self.pages
        item = pages[page_no]
        if isinstance(item, Exception):
            raise item
        return item


class Sleeps:
    def __init__(self):
        self.calls: list[float] = []

    async def __call__(self, seconds):
        self.calls.append(seconds)


def _make(client, repo, sleeps=None, **kw):
    return EventPromosSource(client, repo, sleep=sleeps or Sleeps(), **kw)


async def test_replaces_rows_after_full_pagination():
    repo = InMemoryRepository()
    event_id = repo.add_event("black-friday", "bf")
    client = FakePromoClient({1: _page(0, 50, True), 2: _page(50, 50, True), 3: _page(100, 50, False)})
    sleeps = Sleeps()

    await _make(client, repo, sleeps).run(_source())

    rows = repo.event_promos[event_id]
    assert [r.position for r in rows] == list(range(1, 151))
    assert rows[0].external_id == "0" and rows[149].external_id == "149"
    assert rows[0].affiliate_url == "https://aff/x/0"
    assert sleeps.calls == [1.5, 1.5]


async def test_keeps_rows_when_second_page_fails(caplog):
    repo = InMemoryRepository()
    failing = repo.add_event("a", "pa")
    ok = repo.add_event("b", "pb")
    repo.event_promos[failing] = ["old"]
    client = FakePromoClient({
        "pa": {1: _page(0, 50, True), 2: AliExpressError("7", "boom")},
        "pb": {1: _page(0, 2, False)},
    })

    with caplog.at_level(logging.ERROR, logger="patobarato.event_promos"):
        await _make(client, repo).run(_source())

    assert repo.event_promos[failing] == ["old"]
    assert len(repo.event_promos[ok]) == 2
    assert "event_promos: a kept previous rows — AliExpressError: AliExpress error 7: boom" in caplog.text


async def test_keeps_rows_on_empty_first_page(caplog):
    repo = InMemoryRepository()
    a = repo.add_event("a", "pa")
    repo.add_event("b", "pb")
    repo.event_promos[a] = ["old"]
    client = FakePromoClient({"pa": {1: AliPromoPage([], False)}, "pb": {1: _page(0, 1, False)}})

    with caplog.at_level(logging.ERROR, logger="patobarato.event_promos"):
        await _make(client, repo).run(_source())

    assert repo.event_promos[a] == ["old"]
    assert "event_promos: a returned no products; kept previous rows" in caplog.text


async def test_stops_at_max_pages():
    repo = InMemoryRepository()
    repo.add_event("a", "pa")
    client = FakePromoClient({n: _page(n * 50, 50, True) for n in range(1, 10)})

    await _make(client, repo).run(_source())

    assert [page for _, page in client.calls] == [1, 2, 3]


async def test_one_failed_event_does_not_block_next():
    repo = InMemoryRepository()
    a = repo.add_event("a", "pa")
    b = repo.add_event("b", "pb")
    client = FakePromoClient({"pa": {1: AliExpressError("7", "x")}, "pb": {1: _page(0, 3, False)}})

    await _make(client, repo).run(_source())

    assert a not in repo.event_promos
    assert len(repo.event_promos[b]) == 3


async def test_all_events_failed_raises():
    repo = InMemoryRepository()
    repo.add_event("a", "pa")
    repo.add_event("b", "pb")
    client = FakePromoClient({"pa": {1: AliExpressError("7", "x")}, "pb": {1: AliPromoPage([], False)}})

    with pytest.raises(RuntimeError, match="event_promos: all 2 events failed"):
        await _make(client, repo).run(_source())


async def test_no_events_is_a_noop(caplog):
    repo = InMemoryRepository()
    client = FakePromoClient({})

    with caplog.at_level(logging.INFO, logger="patobarato.event_promos"):
        await _make(client, repo).run(_source())

    assert client.calls == []
    assert "no events" in caplog.text


async def test_original_price_only_when_higher():
    repo = InMemoryRepository()
    event_id = repo.add_event("a", "pa")
    products = [
        _product(1, "10.00", "20.00"),
        _product(2, "10.00", "10.00"),
        _product(3, "10.00", "5.00"),
        _product(4, "10.00", None),
    ]
    client = FakePromoClient({1: AliPromoPage(products, False)})

    await _make(client, repo).run(_source())

    assert [r.original_price for r in repo.event_promos[event_id]] == [Decimal("20.00"), None, None, None]


async def test_products_without_link_are_skipped_and_positions_stay_dense():
    repo = InMemoryRepository()
    event_id = repo.add_event("a", "pa")
    products = [_product(1), _product(2, link=None), _product(3)]
    client = FakePromoClient({1: AliPromoPage(products, False)})

    await _make(client, repo).run(_source())

    rows = repo.event_promos[event_id]
    assert [(r.external_id, r.position) for r in rows] == [("1", 1), ("3", 2)]


async def test_pause_between_calls_across_events():
    repo = InMemoryRepository()
    repo.add_event("a", "pa")
    repo.add_event("b", "pb")
    client = FakePromoClient({"pa": {1: _page(0, 1, False)}, "pb": {1: _page(0, 1, False)}})
    sleeps = Sleeps()

    await _make(client, repo, sleeps, pause_seconds=2.0).run(_source())

    assert sleeps.calls == [2.0]


async def test_product_repeated_across_pages_is_kept_once_with_dense_positions():
    repo = InMemoryRepository()
    event_id = repo.add_event("a", "pa")
    client = FakePromoClient({
        1: AliPromoPage([_product(1), _product(2)], True),
        2: AliPromoPage([_product(2), _product(3)], False),
    })

    await _make(client, repo).run(_source())

    rows = repo.event_promos[event_id]
    assert [(r.external_id, r.position) for r in rows] == [("1", 1), ("2", 2), ("3", 3)]


class FailingReplaceRepository(InMemoryRepository):
    """Raises on replace for the given event ids."""

    def __init__(self, failing: set[int] | None = None):
        super().__init__()
        self.failing = failing if failing is not None else set()

    async def replace_event_promos(self, event_id, rows):
        if event_id in self.failing:
            raise ConnectionError("db down")
        await super().replace_event_promos(event_id, rows)


async def test_storage_failure_counts_as_event_failure_and_next_event_syncs(caplog):
    repo = FailingReplaceRepository()
    a = repo.add_event("a", "pa")
    b = repo.add_event("b", "pb")
    repo.failing.add(a)
    repo.event_promos[a] = ["old"]
    client = FakePromoClient({"pa": {1: _page(0, 2, False)}, "pb": {1: _page(0, 3, False)}})

    with caplog.at_level(logging.ERROR, logger="patobarato.event_promos"):
        await _make(client, repo).run(_source())

    assert repo.event_promos[a] == ["old"]
    assert len(repo.event_promos[b]) == 3
    assert "event_promos: a replace failed" in caplog.text
    assert "ConnectionError: db down" in caplog.text
    assert "Traceback" not in caplog.text


async def test_all_events_failing_on_storage_raises():
    repo = FailingReplaceRepository()
    a = repo.add_event("a", "pa")
    b = repo.add_event("b", "pb")
    repo.failing.update({a, b})
    client = FakePromoClient({"pa": {1: _page(0, 1, False)}, "pb": {1: _page(0, 1, False)}})

    with pytest.raises(RuntimeError, match="event_promos: all 2 events failed"):
        await _make(client, repo).run(_source())
