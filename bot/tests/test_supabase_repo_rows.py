"""SupabaseRepository row shapes against a recording fake client (no database needed)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.models import EventPromoRow, EventRef, ParsedOffer, PublicationStatus
from patobarato.storage.supabase_repo import SupabaseRepository

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


class _Query:
    def __init__(self, log: list, data: list) -> None:
        self._log = log
        self._data = data

    def __getattr__(self, name: str):
        def call(*args, **kwargs):
            self._log.append((name, args, kwargs))
            return self

        return call

    @property
    def not_(self):
        # postgrest-py exposes ``not_`` as a property that negates the next filter
        self._log.append(("not_", (), {}))
        return self

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
    assert "guide_items!inner" in select and "guides!inner(status, published_at)" in select


async def test_list_guide_products_filters_scheduled_beyond_seven_days(monkeypatch):
    now = datetime(2026, 11, 22, 12, 0, tzinfo=UTC)
    monkeypatch.setattr("patobarato.core.pipeline.utcnow", lambda: now)

    def row(ext, published_at):
        return {
            "store": "amazon",
            "external_id": ext,
            "url": f"https://s/{ext}",
            "guide_items": {
                "name": ext,
                "image_url": None,
                "guides": {"status": "published", "published_at": published_at},
            },
        }

    client = _Client([
        row("A_NULL", None),
        row("B_PAST", "2026-11-01T10:00:00+00:00"),
        row("C_SOON", "2026-11-25T10:00:00Z"),
        row("D_FAR", (now + timedelta(days=10)).isoformat()),
    ])
    products = await SupabaseRepository(client).list_guide_products()
    assert [p.external_id for p in products] == ["A_NULL", "B_PAST", "C_SOON"]


async def test_upsert_product_price_success_sends_full_row():
    client = _Client([])
    await SupabaseRepository(client).upsert_product_price(
        7,
        checked_at=NOW,
        price=Decimal("9.5"),
        previous_price=None,
        affiliate_url="https://aff.example/x",
    )
    args, kwargs = next((a, k) for n, a, k in client.log if n == "upsert")
    assert kwargs == {"on_conflict": "product_id"}
    assert args[0]["product_id"] == 7
    assert args[0]["price"] == "9.5"
    assert args[0]["previous_price"] is None
    assert args[0]["error"] is None
    assert args[0]["currency"] == "EUR"
    assert args[0]["affiliate_url"] == "https://aff.example/x"
    assert args[0]["checked_at"] == NOW.isoformat()


async def test_upsert_product_price_error_sends_minimal_payload():
    client = _Client([{"price": 9.5, "previous_price": 12, "currency": "EUR"}])
    await SupabaseRepository(client).upsert_product_price(7, checked_at=NOW, error="captcha")
    args, kwargs = next((a, k) for n, a, k in client.log if n == "upsert")
    assert args[0] == {"product_id": 7, "checked_at": NOW.isoformat(), "error": "captcha"}
    assert kwargs == {"on_conflict": "product_id"}
    assert not any(n == "select" for n, _, _ in client.log)


async def test_find_product_id_selects_by_key_and_returns_none_when_missing():
    client = _Client([{"id": 9}])
    assert await SupabaseRepository(client).find_product_id("awin", "ES", "p1") == 9
    assert ("table", ("products",), {}) in client.log
    for column, value in (("store", "awin"), ("country", "ES"), ("asin", "p1")):
        assert ("eq", (column, value), {}) in client.log
    assert ("limit", (1,), {}) in client.log
    assert await SupabaseRepository(_Client([])).find_product_id("awin", "ES", "p1") is None


class _ScriptedClient:
    """Recording client whose select/update responses are scripted per table call order."""

    def __init__(self, selects=(), update_size=lambda chunk: len(chunk)):
        self.log: list = []
        self._selects = list(selects)
        self._update_size = update_size

    def table(self, name: str):
        client = self
        log = self.log
        log.append(("table", (name,), {}))

        class Q:
            kind = "select"

            def __getattr__(self, method):
                def call(*args, **kwargs):
                    log.append((method, args, kwargs))
                    if method == "update":
                        self.kind = "update"
                    if method == "in_":
                        self.chunk = args[1]
                    return self

                return call

            def execute(self):
                class R:
                    pass

                r = R()
                if self.kind == "update":
                    r.data = [{"id": i} for i in range(client._update_size(self.chunk))]
                else:
                    r.data = client._selects.pop(0) if client._selects else []
                return r

        return Q()


def _catalog_row():
    from patobarato.models import CatalogRow

    return CatalogRow(
        store="mediamarkt", external_id="e1", title="t", description=None, brand=None, gtin=None,
        category=None, price=Decimal("12.50"), sale_price=Decimal("9.99"), currency="EUR", in_stock=True,
        image_url=None, url="https://shop/e1", affiliate_url="https://aff/e1", feed_updated_at=NOW,
    )


async def test_upsert_catalog_products_row_shape():
    client = _Client([])
    await SupabaseRepository(client).upsert_catalog_products([_catalog_row()])
    name, args, kwargs = next(e for e in client.log if e[0] == "upsert")
    assert kwargs == {"on_conflict": "store,external_id"}
    row = args[0][0]
    assert row["price"] == "12.50" and row["sale_price"] == "9.99"
    assert row["feed_updated_at"] == NOW.isoformat()
    assert row["updated_at"]
    assert ("table", ("catalog_products",), {}) in client.log


async def test_record_feed_run_row_shape():
    client = _Client([])
    await SupabaseRepository(client).record_feed_run("mediamarkt", 5678, NOW, 3, "x")
    _, args, kwargs = next(e for e in client.log if e[0] == "upsert")
    assert kwargs == {"on_conflict": "store,advertiser_id"}
    assert args[0] == {
        "store": "mediamarkt", "advertiser_id": 5678, "last_run_at": NOW.isoformat(),
        "products": 3, "last_error": "x",
    }


async def test_mark_catalog_out_of_stock_updates_the_complement_in_chunks():
    stored = [{"external_id": f"id{i:04d}"} for i in range(2500)]
    pages = [stored[:1000], stored[1000:2000], stored[2000:]]
    seen = {f"id{i:04d}" for i in range(100)}  # 2400 missing -> chunks of 500x4/400
    client = _ScriptedClient(pages)
    count = await SupabaseRepository(client).mark_catalog_out_of_stock("mediamarkt", seen)
    assert count == 2400
    ranges = [a for n, a, _ in client.log if n == "range"]
    assert ranges == [(0, 999), (1000, 1999), (2000, 2999)]
    chunks = [a[1] for n, a, _ in client.log if n == "in_"]
    assert [len(c) for c in chunks] == [500] * 4 + [400]
    assert not set(chunks[0]) & seen
    assert ("update", ({"in_stock": False},), {}) in client.log
    assert ("eq", ("store", "mediamarkt"), {}) in client.log


async def test_mark_catalog_out_of_stock_nothing_missing_or_empty_seen():
    client = _ScriptedClient([[{"external_id": "a"}]])
    assert await SupabaseRepository(client).mark_catalog_out_of_stock("s", {"a"}) == 0
    assert not any(n == "update" for n, _, _ in client.log)
    client = _ScriptedClient()
    assert await SupabaseRepository(client).mark_catalog_out_of_stock("s", set()) == 0
    assert client.log == []


async def test_find_catalog_product_prefers_in_stock_and_latest():
    client = _Client([])
    assert await SupabaseRepository(client).find_catalog_product("mediamarkt", "https://shop/e1") is None
    names = [e[0] for e in client.log]
    assert ("eq", ("in_stock", True), {}) in client.log
    assert ("order", ("updated_at",), {"desc": True}) in client.log
    assert names.index("order") < names.index("limit")


async def test_list_events_with_promo_filters_null_and_empty():
    client = _Client([
        {"id": 2, "slug": "aliexpress-1111", "aliexpress_promo": "11.11 Big Sale"},
        {"id": 5, "slug": "x", "aliexpress_promo": "p"},
    ])
    events = await SupabaseRepository(client).list_events_with_promo()
    assert events == [
        EventRef(2, "aliexpress-1111", "11.11 Big Sale"),
        EventRef(5, "x", "p"),
    ]
    assert ("table", ("events",), {}) in client.log
    names = [(n, a) for n, a, _ in client.log]
    assert ("select", ("id, slug, aliexpress_promo",)) in names
    assert names.index(("not_", ())) < names.index(("is_", ("aliexpress_promo", "null")))
    assert ("neq", ("aliexpress_promo", "")) in names
    assert ("order", ("id",)) in names


async def test_replace_event_promos_deletes_then_inserts():
    client = _Client([])
    rows = [
        EventPromoRow("1", "A", Decimal("19.99"), None, None, "https://aff/1", 1),
        EventPromoRow("2", "B", Decimal("5"), Decimal("9.5"), "https://img/2", "https://aff/2", 2),
    ]
    await SupabaseRepository(client).replace_event_promos(7, rows)
    ops = [(n, a) for n, a, _ in client.log if n in ("table", "delete", "eq", "insert")]
    assert [o[0] for o in ops] == ["table", "delete", "eq", "table", "insert"]
    assert ops[0][1] == ("event_promos",) and ops[3][1] == ("event_promos",)
    assert ops[2][1] == ("event_id", 7)
    payload = ops[4][1][0]
    assert [p["external_id"] for p in payload] == ["1", "2"]
    assert payload[0]["event_id"] == 7
    assert payload[0]["price"] == "19.99" and payload[0]["original_price"] is None
    assert payload[0]["position"] == 1 and payload[0]["currency"] == "EUR"
    assert payload[1]["original_price"] == "9.5" and payload[1]["image_url"] == "https://img/2"
    assert payload[0]["affiliate_url"] == "https://aff/1"
    assert datetime.fromisoformat(payload[0]["synced_at"]).tzinfo is not None


async def test_replace_event_promos_empty_only_deletes():
    client = _Client([])
    await SupabaseRepository(client).replace_event_promos(7, [])
    names = [n for n, _, _ in client.log]
    assert "delete" in names and "insert" not in names


async def test_insert_publication_writes_price_before_coupon_only_when_set():
    client = _Client([{"id": 7}])
    repo = SupabaseRepository(client)
    await repo.insert_publication(1, 2, "ES", -1, 5, Decimal("9.99"), "https://aff", NOW)
    await repo.insert_publication(
        1, 2, "ES", -1, 6, Decimal("9.99"), "https://aff", NOW, price_before_coupon=True
    )
    rows = [args[0] for name, args, _ in client.log if name == "insert"]
    assert "price_before_coupon" not in rows[0]
    assert rows[1]["price_before_coupon"] is True


async def test_insert_draft_publication_row_has_status_and_no_ids():
    client = _Client([{"id": 9}])
    pub_id = await SupabaseRepository(client).insert_publication(
        1, 2, "ES", None, None, Decimal("5"), "u", NOW, status=PublicationStatus.DRAFT
    )
    assert pub_id == 9
    row = next(a[0] for n, a, _ in client.log if n == "insert")
    assert row["status"] == "draft"
    assert "chat_id" not in row and "message_id" not in row


async def test_last_publication_excludes_drafts():
    client = _Client([])
    await SupabaseRepository(client).get_last_publication(1, "ES")
    assert ("neq", ("status", "draft"), {}) in client.log


async def test_claim_jobs_updates_conditionally_and_keeps_returned_rows():
    class Client(_Client):
        def table(self, name):
            q = super().table(name)
            if name == "admin_jobs":
                orig = q.execute
                log = self.log

                def execute():
                    if any(n == "update" for n, _, _ in log):
                        q._data = [{"id": 1, "type": "publish", "payload": {"x": 1}}]
                    else:
                        q._data = [{"id": 1}, {"id": 2}]
                    return orig()

                q.execute = execute
            return q

    client = Client([])
    jobs = await SupabaseRepository(client).claim_jobs(5)
    assert [(j.id, j.type, j.payload) for j in jobs] == [(1, "publish", {"x": 1})] * 2
    assert ("eq", ("status", "pending"), {}) in client.log
    assert any(n == "update" and a[0]["status"] == "running" for n, a, _ in client.log)


async def test_finish_job_status_by_error():
    client = _Client([])
    repo = SupabaseRepository(client)
    await repo.finish_job(1, result={"a": 1})
    await repo.finish_job(2, error="boom")
    updates = [a[0] for n, a, _ in client.log if n == "update"]
    assert updates[0]["status"] == "done" and updates[0]["result"] == {"a": 1}
    assert updates[1]["status"] == "error" and updates[1]["error"] == "boom"


async def test_manual_source_id_raises_when_missing():
    import pytest

    with pytest.raises(RuntimeError, match="manual"):
        await SupabaseRepository(_Client([])).manual_source_id()
    assert await SupabaseRepository(_Client([{"id": 7}])).manual_source_id() == 7


async def test_fail_running_jobs_updates_running_rows():
    client = _Client([{"id": 1}, {"id": 2}])
    assert await SupabaseRepository(client).fail_running_jobs("boom") == 2
    assert ("eq", ("status", "running"), {}) in client.log
    update = next(a[0] for n, a, _ in client.log if n == "update")
    assert update == {"status": "error", "error": "boom"}


async def test_upsert_channel_stats_upserts_id_1():
    client = _Client([])
    await SupabaseRepository(client).upsert_channel_stats(1234, NOW)
    assert ("table", ("channel_stats",), {}) in client.log
    _, args, _ = next(e for e in client.log if e[0] == "upsert")
    assert args[0] == {"id": 1, "members": 1234, "checked_at": NOW.isoformat()}


def _calls(client, name):
    return [(a, k) for n, a, k in client.log if n == name]


async def test_list_deals_to_check_query_and_rows():
    client = _Client([{
        "id": 3, "product_id": 4, "published_price": "9.99",
        "products": {"asin": "B1", "url": "https://amz/B1", "store": "amazon"},
        "offers": {"coupon": None},
    }])
    deals = await SupabaseRepository(client).list_deals_to_check(NOW, 30, 24, 7)
    assert [(d.publication_id, d.product_id, d.asin, d.url, d.published_price) for d in deals] == [
        (3, 4, "B1", "https://amz/B1", Decimal("9.99"))
    ]
    assert ("table", ("publications",), {}) in client.log
    sel = _calls(client, "select")[0][0][0]
    assert "offers!inner(coupon)" in sel and "products!inner(asin, url, store)" in sel
    eqs = [a for a, _ in _calls(client, "eq")]
    assert ("status", "active") in eqs and ("channel", "telegram") in eqs
    assert ("products.store", "amazon") in eqs
    assert _calls(client, "is_")[0][0] == ("offers.coupon", "null")
    assert _calls(client, "gt")[0][0] == ("published_at", (NOW - timedelta(days=30)).isoformat())
    assert _calls(client, "or_")[0][0] == (
        f"checked_at.is.null,checked_at.lt.{(NOW - timedelta(hours=24)).isoformat()}",
    )
    orders = _calls(client, "order")
    assert orders[0] == (("checked_at",), {"desc": False, "nullsfirst": True})
    assert orders[1] == (("published_at",), {"desc": True})
    assert _calls(client, "limit")[0][0] == (7,)


async def test_list_stale_deals_query():
    client = _Client([{"id": 1}, {"id": 2}])
    ids = await SupabaseRepository(client).list_stale_deals(NOW, 30)
    assert ids == [1, 2]
    assert "products!inner(store)" in _calls(client, "select")[0][0][0]
    eqs = [a for a, _ in _calls(client, "eq")]
    assert ("status", "active") in eqs and ("channel", "telegram") in eqs
    assert ("products.store", "amazon") in eqs
    assert _calls(client, "lte")[0][0] == ("published_at", (NOW - timedelta(days=30)).isoformat())


async def test_end_stale_deals_updates_listed_ids():
    client = _Client([{"id": 1}, {"id": 2}])
    ids = await SupabaseRepository(client).end_stale_deals(NOW, 30)
    assert ids == [1, 2]
    (args, _), = _calls(client, "update")
    assert args[0] == {"status": "ended", "ended_at": NOW.isoformat(), "post_synced_at": None}
    assert _calls(client, "in_")[0][0] == ("id", [1, 2])


class _PagedClient(_Client):
    """Returns ``pages[i]`` on the i-th ``execute`` (then empty lists)."""

    def __init__(self, pages: list[list]) -> None:
        super().__init__([])
        self._pages = list(pages)

    def table(self, name: str) -> _Query:
        self.log.append(("table", (name,), {}))
        data = self._pages.pop(0) if self._pages else []
        return _Query(self.log, data)


async def test_list_stale_deals_pages_beyond_row_cap():
    from patobarato.storage.supabase_repo import CATALOG_PAGE

    first = [{"id": i} for i in range(CATALOG_PAGE)]
    second = [{"id": CATALOG_PAGE + 1}, {"id": CATALOG_PAGE + 2}]
    client = _PagedClient([first, second])
    ids = await SupabaseRepository(client).list_stale_deals(NOW, 30)
    assert ids == [r["id"] for r in first + second]
    assert _calls(client, "range") == [
        ((0, CATALOG_PAGE - 1), {}),
        ((CATALOG_PAGE, 2 * CATALOG_PAGE - 1), {}),
    ]
    assert _calls(client, "order")[0][0] == ("id",)


async def test_end_stale_deals_updates_in_chunks():
    from patobarato.storage.supabase_repo import CATALOG_UPDATE_CHUNK

    total = 2 * CATALOG_UPDATE_CHUNK + 50
    client = _PagedClient([[{"id": i} for i in range(total)]])
    ids = await SupabaseRepository(client).end_stale_deals(NOW, 30)
    assert ids == list(range(total))
    chunks = [a[1] for a, _ in _calls(client, "in_")]
    assert len(_calls(client, "update")) == 3
    assert [len(c) for c in chunks] == [CATALOG_UPDATE_CHUNK, CATALOG_UPDATE_CHUNK, 50]
    assert [i for c in chunks for i in c] == ids


async def test_end_stale_deals_without_stale_does_not_update():
    client = _Client([])
    assert await SupabaseRepository(client).end_stale_deals(NOW, 30) == []
    assert _calls(client, "update") == []


async def test_end_publication_mark_checked_mark_post_synced_rows():
    client = _Client([])
    repo = SupabaseRepository(client)
    await repo.end_publication(5, NOW)
    await repo.mark_checked(5, NOW)
    await repo.mark_post_synced(5, NOW)
    iso = NOW.isoformat()
    updates = [a[0] for a, _ in _calls(client, "update")]
    assert updates == [
        {"status": "ended", "ended_at": iso, "checked_at": iso, "post_synced_at": None},
        {"checked_at": iso},
        {"post_synced_at": iso},
    ]
    assert [a for a, _ in _calls(client, "eq")] == [("id", 5)] * 3


async def test_list_ended_posts_to_edit_query():
    client = _Client([{"id": 9}, {"id": 4}])
    assert await SupabaseRepository(client).list_ended_posts_to_edit(5) == [9, 4]
    assert ("status", "ended") in [a for a, _ in _calls(client, "eq")]
    names = [n for n, _, _ in client.log]
    assert names.index("not_") + 1 == names.index("is_")  # message_id is NOT null
    assert [a for a, _ in _calls(client, "is_")] == [
        ("message_id", "null"),
        ("post_synced_at", "null"),
    ]
    assert _calls(client, "order") == [
        (("ended_at",), {"desc": True}),
        (("published_at",), {"desc": True}),
    ]
    assert _calls(client, "limit")[0][0] == (5,)


async def test_count_ended_posts_to_edit_query():
    class _CountQuery(_Query):
        def execute(self):
            class R:
                data = ()
                count = 42

            return R()

    class _CountClient(_Client):
        def table(self, name):
            self.log.append(("table", (name,), {}))
            return _CountQuery(self.log, [])

    client = _CountClient([])
    assert await SupabaseRepository(client).count_ended_posts_to_edit() == 42
    assert _calls(client, "select")[0] == (("id",), {"count": "exact", "head": True})
    assert ("status", "ended") in [a for a, _ in _calls(client, "eq")]
    names = [n for n, _, _ in client.log]
    assert names.index("not_") + 1 == names.index("is_")
    assert [a for a, _ in _calls(client, "is_")] == [
        ("message_id", "null"),
        ("post_synced_at", "null"),
    ]


async def test_list_guides_to_announce_query_and_rows():
    from patobarato.models import GuideToAnnounce

    client = _Client([{"id": 3, "slug": "teles", "title": "Teles", "subtitle": None}])
    assert await SupabaseRepository(client).list_guides_to_announce(NOW) == [
        GuideToAnnounce(3, "teles", "Teles", None)
    ]
    assert ("table", ("guides",), {}) in client.log
    assert _calls(client, "select")[0][0] == ("id, slug, title, subtitle",)
    assert [a for a, _ in _calls(client, "eq")] == [("status", "published")]
    assert [a for a, _ in _calls(client, "lte")] == [("published_at", NOW.isoformat())]
    assert [a for a, _ in _calls(client, "is_")] == [("announced_at", "null")]
    assert _calls(client, "order") == [(("published_at",), {})]
    assert _calls(client, "limit") == []


async def test_last_announced_guide_message_query():
    client = _Client([{"announce_message_id": 77}])
    assert await SupabaseRepository(client).last_announced_guide_message() == 77
    names = [n for n, _, _ in client.log]
    assert names.index("not_") + 1 == names.index("is_")
    assert [a for a, _ in _calls(client, "is_")] == [("announce_message_id", "null")]
    assert _calls(client, "order") == [(("announced_at",), {"desc": True})]
    assert _calls(client, "limit")[0][0] == (1,)
    assert await SupabaseRepository(_Client([])).last_announced_guide_message() is None


async def test_mark_guide_announced_row():
    client = _Client([])
    await SupabaseRepository(client).mark_guide_announced(3, 77, NOW)
    await SupabaseRepository(client).mark_guide_announced(4, None, NOW)
    updates = [a[0] for a, _ in _calls(client, "update")]
    assert updates == [
        {"announced_at": NOW.isoformat(), "announce_message_id": 77},
        {"announced_at": NOW.isoformat(), "announce_message_id": None},
    ]
    assert [a for a, _ in _calls(client, "eq")] == [("id", 3), ("id", 4)]


async def test_upsert_product_price_error_includes_affiliate_url_when_given():
    client = _Client([])
    await SupabaseRepository(client).upsert_product_price(
        7, checked_at=NOW, error="HTTP 403", affiliate_url="https://aff.example/x"
    )
    args, _ = next((a, k) for n, a, k in client.log if n == "upsert")
    assert args[0] == {
        "product_id": 7,
        "checked_at": NOW.isoformat(),
        "error": "HTTP 403",
        "affiliate_url": "https://aff.example/x",
    }


async def test_upsert_product_never_clears_category_or_brand():
    client = _Client([{"id": 5}])
    await SupabaseRepository(client).upsert_product(_offer())
    row = next(a[0] for n, a, _ in client.log if n == "upsert")
    assert "category" not in row and "brand" not in row and "description" not in row


async def test_products_to_enrich_query_and_rows():
    client = _Client([{"id": 9, "title": "Freidora", "enrich_attempts": 1, "publications": [{"id": 3}]}])
    products = await SupabaseRepository(client).products_to_enrich(40)
    assert [(p.id, p.title, p.attempts) for p in products] == [(9, "Freidora", 1)]
    assert ("table", ("products",), {}) in client.log
    assert "publications!inner(id)" in _calls(client, "select")[0][0][0]
    assert _calls(client, "is_")[0][0] == ("description", "null")
    assert ("description_manual", False) in [a for a, _ in _calls(client, "eq")]
    assert _calls(client, "lt")[0][0] == ("enrich_attempts", 3)
    assert _calls(client, "neq")[0][0] == ("publications.status", "draft")
    assert _calls(client, "order")[0] == (("id",), {"desc": True})
    assert _calls(client, "limit")[0][0] == (40,)


async def test_save_product_text_skips_manual_edits():
    client = _Client([])
    await SupabaseRepository(client).save_product_text(9, "Texto", "hogar", NOW)
    assert _calls(client, "update")[0][0][0] == {
        "description": "Texto",
        "category": "hogar",
        "enriched_at": NOW.isoformat(),
    }
    eqs = [a for a, _ in _calls(client, "eq")]
    assert ("id", 9) in eqs and ("description_manual", False) in eqs


async def test_record_enrich_failure_sets_attempts():
    client = _Client([])
    await SupabaseRepository(client).record_enrich_failure(9, 2)
    assert _calls(client, "update")[0][0][0] == {"enrich_attempts": 2}
    assert ("id", 9) in [a for a, _ in _calls(client, "eq")]
