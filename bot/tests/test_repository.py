import dataclasses
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.models import OfferStatus, ParsedOffer
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
    assert await repo.get_products_without_image() == [(without, "B000000002", "ES")]
