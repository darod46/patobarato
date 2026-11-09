import dataclasses
import os
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from patobarato.models import CouponUpsert, OfferStatus, ParsedOffer, PublicationStatus
from patobarato.storage.supabase_repo import SupabaseRepository

pytestmark = pytest.mark.skipif(
    not (os.getenv("SUPABASE_TEST_URL") and os.getenv("SUPABASE_TEST_KEY")),
    reason="SUPABASE_TEST_URL / SUPABASE_TEST_KEY not set",
)

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


@pytest.fixture
def client():
    from supabase import create_client

    return create_client(
        os.environ["SUPABASE_TEST_URL"], os.environ["SUPABASE_TEST_KEY"]
    )


@pytest.fixture
def repo(client):
    return SupabaseRepository(client)


@pytest.fixture
def asin(client):
    value = "T" + uuid.uuid4().hex[:9].upper()
    yield value
    products = client.table("products").select("id").eq("asin", value).execute().data
    ids = [p["id"] for p in products]
    if ids:
        # offers/publications of these products are removed by the source fixture
        client.table("publications").delete().in_("product_id", ids).execute()
        client.table("offers").delete().in_("product_id", ids).execute()
        client.table("products").delete().in_("id", ids).execute()


def make_offer(asin: str, title: str = "Pato") -> ParsedOffer:
    return ParsedOffer(
        asin=asin,
        country="ES",
        store="amazon",
        title=title,
        price=Decimal("9.99"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url=f"https://www.amazon.es/dp/{asin}",
        product_url=f"https://www.amazon.es/dp/{asin}",
    )


@pytest.fixture
def source(client):
    identifier = "@test_" + uuid.uuid4().hex[:8]
    row = (
        client.table("sources")
        .insert({"identifier": identifier, "country": "ES", "active": True})
        .execute()
        .data[0]
    )
    yield row
    offers = client.table("offers").select("id").eq("source_id", row["id"]).execute()
    ids = [o["id"] for o in offers.data]
    if ids:
        client.table("publications").delete().in_("offer_id", ids).execute()
        client.table("offers").delete().in_("id", ids).execute()
    client.table("sources").delete().eq("id", row["id"]).execute()


async def test_upsert_product_idempotent(repo, client, asin):
    first = await repo.upsert_product(make_offer(asin, "Old"))
    second = await repo.upsert_product(make_offer(asin, "New"))
    assert first == second
    row = client.table("products").select("title").eq("id", first).execute().data[0]
    assert row["title"] == "New"


async def test_insert_offer_duplicate_returns_none(repo, source, asin):
    offer = make_offer(asin)
    product_id = await repo.upsert_product(offer)
    first = await repo.insert_offer(product_id, source["id"], 10, offer, "raw", NOW)
    again = await repo.insert_offer(product_id, source["id"], 10, offer, "raw", NOW)
    assert first is not None
    assert again is None
    await repo.set_offer_status(first, OfferStatus.PUBLISHED)


async def test_insert_offer_stores_hashtags(repo, client, source, asin):
    product_id = await repo.upsert_product(make_offer(asin))
    offer = dataclasses.replace(make_offer(asin), hashtags=["Sony", "auriculares"])
    offer_id = await repo.insert_offer(product_id, source["id"], 7, offer, "raw", NOW)
    row = client.table("offers").select("hashtags").eq("id", offer_id).execute().data[0]
    assert row["hashtags"] == ["sony", "auriculares"]


async def test_last_publication_is_most_recent(repo, source, asin):
    offer = make_offer(asin)
    product_id = await repo.upsert_product(offer)
    assert await repo.get_last_publication(product_id, "ES") is None
    offer_id = await repo.insert_offer(product_id, source["id"], 1, offer, "raw", NOW)
    assert offer_id is not None
    for days_ago, price in [(5, "20.00"), (1, "15.00"), (9, "30.00")]:
        await repo.insert_publication(
            offer_id, product_id, "ES", -100, 1, Decimal(price),
            f"https://www.amazon.es/dp/{asin}?tag=patobarato-21",
            NOW - timedelta(days=days_ago),
        )
    last = await repo.get_last_publication(product_id, "ES")
    assert last is not None
    assert last.published_price == Decimal("15.00")
    assert last.published_at == NOW - timedelta(days=1)
    assert last.published_at.utcoffset() == timedelta(0)
    assert last.status is PublicationStatus.ACTIVE


async def test_sync_sources_registers_once_and_skips_inactive(repo, client):
    new_id = "-100" + str(uuid.uuid4().int)[:10]
    off_id = "-100" + str(uuid.uuid4().int)[:10]
    client.table("sources").insert({"identifier": off_id, "active": False}).execute()
    try:
        first = await repo.sync_sources({new_id: "Nuevo", off_id: "Apagado"}, "ES")
        again = await repo.sync_sources({new_id: "Nuevo", off_id: "Apagado"}, "ES")
        assert [s.identifier for s in first] == [new_id]
        assert first[0].country == "ES"
        assert again == first
        rows = client.table("sources").select("name").eq("identifier", new_id).execute()
        assert [r["name"] for r in rows.data] == ["Nuevo"]
    finally:
        client.table("sources").delete().in_("identifier", [new_id, off_id]).execute()


@pytest.fixture
def api_source(client):
    row = (
        client.table("sources")
        .insert(
            {
                "type": "aliexpress_api",
                "identifier": "test_" + uuid.uuid4().hex[:8],
                "country": "ES",
                "active": True,
                "config": {"k": 1},
                "every_minutes": 30,
                "hashtags": ["x"],
            }
        )
        .execute()
        .data[0]
    )
    yield row
    client.table("coupons").delete().eq("source_id", row["id"]).execute()
    client.table("sources").delete().eq("id", row["id"]).execute()


def _coupon(source_id: int, external_id: str, title: str = "Cupón") -> CouponUpsert:
    return CouponUpsert(
        source_id=source_id, external_id=external_id, store="awin", code="PATO10",
        title=title, conditions=None, url="https://x", starts_at=None, expires_at=None,
    )


async def test_upsert_coupon_and_deactivate(repo, client, api_source):
    sid = api_source["id"]
    first = await repo.upsert_coupon(_coupon(sid, "a", "Old"))
    assert await repo.upsert_coupon(_coupon(sid, "a", "New")) == first
    await repo.upsert_coupon(_coupon(sid, "b"))
    rows = client.table("coupons").select("title").eq("source_id", sid).execute().data
    assert len(rows) == 2
    assert client.table("coupons").select("title").eq("id", first).execute().data[0]["title"] == "New"
    assert await repo.deactivate_coupons_not_in(sid, {"a"}) == 1
    assert await repo.deactivate_coupons_not_in(sid, set()) == 1
    assert await repo.upsert_coupon(_coupon(sid, "a")) == first
    row = client.table("coupons").select("active").eq("id", first).execute().data[0]
    assert row["active"] is True


async def test_list_api_sources_and_mark_run(repo, client, api_source):
    sources = await repo.list_api_sources()
    mine = next(s for s in sources if s.id == api_source["id"])
    assert mine.type == "aliexpress_api" and mine.config == {"k": 1}
    assert all(s.type != "telegram_channel" for s in sources)
    await repo.mark_source_run(mine.id, NOW, "boom")
    row = client.table("sources").select("last_error").eq("id", mine.id).execute().data[0]
    assert row["last_error"] == "boom"


async def test_web_publication_without_telegram_ids(repo, source, asin):
    offer = make_offer(asin)
    product_id = await repo.upsert_product(offer)
    offer_id = await repo.insert_offer(product_id, source["id"], 3, offer, "raw", NOW)
    assert offer_id is not None
    await repo.insert_publication(
        offer_id, product_id, "ES", None, None, Decimal("5.00"), "https://x", NOW,
        channel="web",
    )
    last = await repo.get_last_publication(product_id, "ES")
    assert last is not None and last.published_price == Decimal("5.00")
