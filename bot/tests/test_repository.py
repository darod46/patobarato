import dataclasses
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.models import CouponUpsert, OfferStatus, ParsedOffer
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def make_offer(asin: str = "B000000001", title: str = "Pato") -> ParsedOffer:
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


async def test_upsert_product_idempotent():
    repo = InMemoryRepository()
    first = await repo.upsert_product(make_offer(title="Old"))
    second = await repo.upsert_product(make_offer(title="New"))
    other = await repo.upsert_product(make_offer(asin="B000000002"))
    assert first == second
    assert other != first
    assert repo.product_titles[first] == "New"


async def test_insert_offer_duplicate_returns_none():
    repo = InMemoryRepository()
    source = repo.add_source("@canal")
    offer = make_offer()
    product_id = await repo.upsert_product(offer)
    first = await repo.insert_offer(product_id, source.id, 10, offer, "raw", NOW)
    again = await repo.insert_offer(product_id, source.id, 10, offer, "raw", NOW)
    other_message = await repo.insert_offer(product_id, source.id, 11, offer, "raw", NOW)
    assert first is not None
    assert again is None
    assert other_message is not None


async def test_last_publication_is_most_recent():
    repo = InMemoryRepository()
    source = repo.add_source("@canal")
    offer = make_offer()
    product_id = await repo.upsert_product(offer)
    assert await repo.get_last_publication(product_id, "ES") is None
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    assert offer_id is not None
    for days_ago, price in [(5, "20.00"), (1, "15.00"), (9, "30.00")]:
        await repo.insert_publication(
            offer_id, product_id, "ES", -100, 1, Decimal(price),
            "https://www.amazon.es/dp/B000000001?tag=patobarato-21",
            NOW - timedelta(days=days_ago),
        )
    last = await repo.get_last_publication(product_id, "ES")
    assert last is not None
    assert last.published_price == Decimal("15.00")
    assert last.published_at == NOW - timedelta(days=1)
    assert await repo.get_last_publication(product_id, "FR") is None


async def test_sync_sources_registers_new_channels_once():
    repo = InMemoryRepository()
    first = await repo.sync_sources({"-1001": "Uno", "-1002": "Dos"}, "ES")
    again = await repo.sync_sources({"-1001": "Uno", "-1002": "Dos"}, "ES")
    assert [s.identifier for s in first] == ["-1001", "-1002"]
    assert {s.country for s in first} == {"ES"}
    assert again == first
    assert repo.source_names() == {"-1001": "Uno", "-1002": "Dos"}


async def test_sync_sources_returns_only_active_requested_channels():
    repo = InMemoryRepository()
    repo.add_source("-1002", active=False)
    repo.add_source("-1003")
    synced = await repo.sync_sources({"-1001": "Uno", "-1002": "Dos"}, "ES")
    assert [s.identifier for s in synced] == ["-1001"]


async def test_test_helpers_and_unknown_offer_status_noop():
    repo = InMemoryRepository()
    source = repo.add_source("@canal")
    offer = make_offer()
    product_id = await repo.upsert_product(offer)
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    await repo.set_offer_status(999, OfferStatus.PUBLISHED)
    assert repo.offer_statuses() == [OfferStatus.PENDING]
    await repo.set_offer_status(offer_id, OfferStatus.PUBLISHED)
    await repo.insert_publication(
        offer_id, product_id, "ES", -100, 7, Decimal("9.99"), "url", NOW
    )
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED]
    (pub,) = repo.publications()
    assert pub["message_id"] == 7 and pub["offer_id"] == offer_id


async def test_insert_offer_stores_normalized_unique_hashtags():
    repo = InMemoryRepository()
    source = repo.add_source("@canal")
    product_id = await repo.upsert_product(make_offer())
    offer = dataclasses.replace(make_offer(), hashtags=["Sony", "sony", "Auri-culares", "#"])
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    assert repo.offer_hashtags(offer_id) == ["sony", "auriculares"]


async def test_set_product_image_is_stored():
    repo = InMemoryRepository()
    await repo.set_product_image(7, "https://img/x.jpg")
    assert repo.product_images == {7: "https://img/x.jpg"}


async def test_products_without_image_lists_only_missing_ones():
    repo = InMemoryRepository()
    with_image = await repo.upsert_product(make_offer(asin="B000000001"))
    without = await repo.upsert_product(make_offer(asin="B000000002"))
    await repo.set_product_image(with_image, "https://img/x.jpg")
    assert await repo.get_products_without_image() == [(without, "B000000002", "ES", "amazon")]


async def test_insert_web_publication_without_telegram_ids():
    repo = InMemoryRepository()
    product_id = await repo.upsert_product(make_offer())
    await repo.insert_publication(
        1, product_id, "ES", None, None, Decimal("9.99"), "https://x", NOW, channel="web"
    )
    last = await repo.get_last_publication(product_id, "ES")
    assert last is not None and last.published_price == Decimal("9.99")
    (pub,) = repo.publications()
    assert pub["channel"] == "web" and pub["chat_id"] is None


async def test_insert_publication_defaults_to_telegram_channel():
    repo = InMemoryRepository()
    await repo.insert_publication(1, 1, "ES", -1, 5, Decimal("1"), "https://x", NOW)
    assert repo.publications()[0]["channel"] == "telegram"


def make_coupon(external_id: str = "a", title: str = "Cupón", source_id: int = 1) -> CouponUpsert:
    return CouponUpsert(
        source_id=source_id,
        external_id=external_id,
        store="awin",
        code="PATO10",
        title=title,
        conditions=None,
        url="https://x",
        starts_at=None,
        expires_at=None,
    )


async def test_upsert_coupon_twice_keeps_one_updated_row():
    repo = InMemoryRepository()
    first = await repo.upsert_coupon(make_coupon(title="Old"))
    second = await repo.upsert_coupon(make_coupon(title="New"))
    assert first == second
    assert len(repo.coupons) == 1
    assert repo.coupons[first]["title"] == "New"


async def test_upsert_coupon_reactivates_deactivated_coupon():
    repo = InMemoryRepository()
    coupon_id = await repo.upsert_coupon(make_coupon("a"))
    assert await repo.deactivate_coupons_not_in(1, set()) == 1
    assert repo.coupons[coupon_id]["active"] is False
    assert await repo.upsert_coupon(make_coupon("a")) == coupon_id
    assert repo.coupons[coupon_id]["active"] is True


async def test_deactivate_coupons_not_in_returns_count():
    repo = InMemoryRepository()
    await repo.upsert_coupon(make_coupon("a"))
    b = await repo.upsert_coupon(make_coupon("b"))
    other = await repo.upsert_coupon(make_coupon("z", source_id=2))
    assert await repo.deactivate_coupons_not_in(1, {"a"}) == 1
    assert repo.coupons[b]["active"] is False
    assert repo.coupons[other]["active"] is True
    assert await repo.deactivate_coupons_not_in(1, set()) == 1  # only "a" was left
    assert await repo.deactivate_coupons_not_in(1, set()) == 0


async def test_list_api_sources_excludes_telegram_and_inactive():
    repo = InMemoryRepository()
    repo.add_source("@canal")
    keep = repo.add_api_source("aliexpress_api", "ali", config={"k": 1}, every_minutes=30, hashtags=["x"])
    repo.add_api_source("awin_promotions", "off", active=False)
    sources = await repo.list_api_sources()
    assert [s.id for s in sources] == [keep.id]
    assert sources[0].type == "aliexpress_api" and sources[0].config == {"k": 1}
    assert sources[0].every_minutes == 30 and sources[0].last_run_at is None


async def test_mark_source_run_stores_date_and_error():
    repo = InMemoryRepository()
    src = repo.add_api_source("aliexpress_api", "ali")
    await repo.mark_source_run(src.id, NOW, "boom")
    assert repo.source_runs[src.id] == (NOW, "boom")
    assert (await repo.list_api_sources())[0].last_run_at == NOW
    await repo.mark_source_run(src.id, NOW, None)
    assert repo.source_runs[src.id] == (NOW, None)
