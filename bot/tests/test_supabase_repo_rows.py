"""SupabaseRepository row shapes against a recording fake client (no database needed)."""

from datetime import UTC, datetime
from decimal import Decimal

from patobarato.models import ParsedOffer

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
from patobarato.storage.supabase_repo import SupabaseRepository


class _Query:
    def __init__(self, log: list, data: list) -> None:
        self._log = log
        self._data = data

    def __getattr__(self, name: str):
        def call(*args, **kwargs):
            self._log.append((name, args, kwargs))
            return self

        return call

    def execute(self):
        class R:
            data = self._data

        return R()


class _Client:
    def __init__(self, data: list) -> None:
        self.log: list = []
        self._data = data

    def table(self, name: str) -> _Query:
        self.log.append(("table", (name,), {}))
        return _Query(self.log, self._data)


def _offer() -> ParsedOffer:
    return ParsedOffer(
        asin="p1",
        country="ES",
        store="awin",
        title="t",
        price=Decimal("1"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url="https://shop/p1",
        product_url="https://shop/real/p1",
    )


async def test_upsert_product_writes_url():
    client = _Client([{"id": 5}])
    assert await SupabaseRepository(client).upsert_product(_offer()) == 5
    row = next(a[0] for n, a, _ in client.log if n == "upsert")
    assert row["url"] == "https://shop/real/p1"


async def test_products_without_image_returns_url_or_empty():
    client = _Client([
        {"id": 1, "asin": "a", "country": "ES", "store": "awin", "url": "https://shop/a"},
        {"id": 2, "asin": "b", "country": "ES", "store": "amazon", "url": None},
    ])
    rows = await SupabaseRepository(client).get_products_without_image()
    assert rows == [(1, "a", "ES", "awin", "https://shop/a"), (2, "b", "ES", "amazon", "")]


async def test_last_publication_filters_channel_only_when_given():
    client = _Client([])
    repo = SupabaseRepository(client)
    await repo.get_last_publication(1, "ES")
    assert not any(n == "eq" and a == ("channel", "telegram") for n, a, _ in client.log)
    await repo.get_last_publication(1, "ES", channel="telegram")
    assert ("eq", ("channel", "telegram"), {}) in client.log


async def test_list_guide_products_selects_published_and_dedupes():
    def row(store, ext):
        return {
            "store": store,
            "external_id": ext,
            "url": f"https://s/{ext}",
            "guide_items": {"name": f"n{ext}", "image_url": None},
        }

    client = _Client([row("amazon", "B2"), row("amazon", "B1"), row("amazon", "B2")])
    products = await SupabaseRepository(client).list_guide_products()
    assert [p.external_id for p in products] == ["B1", "B2"]
    assert products[0].name == "nB1"
    assert ("table", ("guide_item_stores",), {}) in client.log
    assert ("eq", ("guide_items.guides.status", "published"), {}) in client.log
    select = next(a[0] for n, a, _ in client.log if n == "select")
    assert "guide_items!inner" in select and "guides!inner(status)" in select


async def test_upsert_product_price_success_sends_full_row():
    client = _Client([])
    await SupabaseRepository(client).upsert_product_price(
        7, checked_at=NOW, price=Decimal("9.5"), previous_price=None
    )
    args, kwargs = next((a, k) for n, a, k in client.log if n == "upsert")
    assert kwargs == {"on_conflict": "product_id"}
    assert args[0]["product_id"] == 7
    assert args[0]["price"] == "9.5"
    assert args[0]["previous_price"] is None
    assert args[0]["error"] is None
    assert args[0]["currency"] == "EUR"
    assert args[0]["checked_at"] == NOW.isoformat()


async def test_upsert_product_price_error_keeps_existing_price():
    client = _Client([{"price": 9.5, "previous_price": 12, "currency": "EUR"}])
    await SupabaseRepository(client).upsert_product_price(7, checked_at=NOW, error="captcha")
    row = next(a[0] for n, a, _ in client.log if n == "upsert")
    assert row == {
        "product_id": 7,
        "price": 9.5,
        "previous_price": 12,
        "currency": "EUR",
        "checked_at": NOW.isoformat(),
        "error": "captcha",
    }


async def test_upsert_product_price_error_without_row_inserts_null_price():
    client = _Client([])
    await SupabaseRepository(client).upsert_product_price(7, checked_at=NOW, error="x")
    row = next(a[0] for n, a, _ in client.log if n == "upsert")
    assert row["price"] is None and row["error"] == "x"
