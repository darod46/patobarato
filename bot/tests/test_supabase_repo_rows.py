"""SupabaseRepository row shapes against a recording fake client (no database needed)."""

from decimal import Decimal

from patobarato.models import ParsedOffer
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
