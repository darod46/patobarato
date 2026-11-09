import dataclasses
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.models import (
    CouponUpsert,
    EventPromoRow,
    EventRef,
    GuideProduct,
    OfferStatus,
    ParsedOffer,
    PublicationStatus,
)
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
    assert await repo.get_products_without_image() == [
        (without, "B000000002", "ES", "amazon", "https://www.amazon.es/dp/B000000002")
    ]


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


async def test_last_publication_filters_by_channel():
    repo = InMemoryRepository()
    product_id = await repo.upsert_product(make_offer())
    await repo.insert_publication(
        1, product_id, "ES", None, None, Decimal("9.99"), "https://x", NOW, channel="web"
    )
    assert await repo.get_last_publication(product_id, "ES", channel="telegram") is None
    web = await repo.get_last_publication(product_id, "ES", channel="web")
    assert web is not None and web.published_price == Decimal("9.99")
    await repo.insert_publication(
        2, product_id, "ES", -100, 1, Decimal("8.00"), "https://x", NOW + timedelta(days=1)
    )
    any_channel = await repo.get_last_publication(product_id, "ES")
    assert any_channel is not None and any_channel.published_price == Decimal("8.00")
    telegram = await repo.get_last_publication(product_id, "ES", channel="telegram")
    assert telegram is not None and telegram.published_price == Decimal("8.00")
    web = await repo.get_last_publication(product_id, "ES", channel="web")
    assert web is not None and web.published_price == Decimal("9.99")


async def test_upsert_product_stores_url():
    repo = InMemoryRepository()
    product_id = await repo.upsert_product(
        dataclasses.replace(make_offer(), product_url="https://shop.example/p/1")
    )
    assert repo.product_urls[product_id] == "https://shop.example/p/1"
    assert await repo.get_products_without_image() == [
        (product_id, "B000000001", "ES", "amazon", "https://shop.example/p/1")
    ]


async def test_list_guide_products_dedupes_and_skips_drafts():
    repo = InMemoryRepository()
    shared = GuideProduct("amazon", "B2", "https://a/B2", "Dos", None)
    repo.add_guide_product(GuideProduct("amazon", "B3", "https://a/B3", "Tres", None))
    repo.add_guide_product(shared)
    repo.add_guide_product(shared)  # same item in a second published guide
    draft = GuideProduct("amazon", "[ASIN]", "https://a/x", "Draft", None)
    repo.add_guide_product(draft, published=False)
    products = await repo.list_guide_products()
    assert [p.external_id for p in products] == ["B2", "B3"]


async def test_upsert_product_price_keeps_price_on_error():
    repo = InMemoryRepository()
    await repo.upsert_product_price(
        1, checked_at=NOW, price=Decimal("99.90"), previous_price=Decimal("120")
    )
    later = NOW + timedelta(hours=1)
    await repo.upsert_product_price(1, checked_at=later, error="captcha")
    row = repo.prices[1]
    assert row["price"] == Decimal("99.90")
    assert row["previous_price"] == Decimal("120")
    assert row["error"] == "captcha"
    assert row["checked_at"] == later


async def test_upsert_product_price_clears_error_on_success():
    repo = InMemoryRepository()
    await repo.upsert_product_price(1, checked_at=NOW, error="captcha")
    assert repo.prices[1]["price"] is None
    await repo.upsert_product_price(1, checked_at=NOW, price=Decimal("5"))
    assert repo.prices[1]["error"] is None
    assert repo.prices[1]["price"] == Decimal("5")


async def test_find_product_id_returns_id_or_none():
    repo = InMemoryRepository()
    assert await repo.find_product_id("amazon", "ES", "B000000001") is None
    product_id = await repo.upsert_product(make_offer())
    assert await repo.find_product_id("amazon", "ES", "B000000001") == product_id
    assert await repo.find_product_id("amazon", "PT", "B000000001") is None


def _catalog_row(store="pccomponentes", ext="a", in_stock=True, url=None):
    from patobarato.models import CatalogRow

    return CatalogRow(
        store=store, external_id=ext, title="t", description=None, brand=None, gtin=None,
        category=None, price=Decimal("1"), sale_price=None, currency="EUR", in_stock=in_stock,
        image_url=None, url=url or f"https://shop/{ext}", affiliate_url="https://aff", feed_updated_at=NOW,
    )


async def test_upsert_catalog_products_is_idempotent_and_stamps_updated_at():
    repo = InMemoryRepository()
    await repo.upsert_catalog_products([_catalog_row()])
    await repo.upsert_catalog_products([dataclasses.replace(_catalog_row(), title="new")])
    assert len(repo.catalog) == 1
    row = repo.catalog[("pccomponentes", "a")]
    assert row.title == "new"
    assert row.updated_at is not None


async def test_mark_catalog_out_of_stock_only_touches_the_store_and_missing_ids():
    repo = InMemoryRepository()
    await repo.upsert_catalog_products(
        [_catalog_row(ext=x) for x in "abc"] + [_catalog_row(store="mediamarkt", ext="z")]
    )
    assert await repo.mark_catalog_out_of_stock("pccomponentes", {"a", "b"}) == 1
    assert repo.catalog[("pccomponentes", "c")].in_stock is False
    assert repo.catalog[("mediamarkt", "z")].in_stock is True
    assert await repo.mark_catalog_out_of_stock("pccomponentes", {"a", "b"}) == 0


async def test_mark_catalog_out_of_stock_empty_set_touches_nothing(caplog):
    repo = InMemoryRepository()
    await repo.upsert_catalog_products([_catalog_row()])
    assert await repo.mark_catalog_out_of_stock("pccomponentes", set()) == 0
    assert repo.catalog[("pccomponentes", "a")].in_stock is True
    assert "empty feed" in caplog.text


async def test_record_feed_run_overwrites_and_find_catalog_product_by_url():
    repo = InMemoryRepository()
    await repo.record_feed_run("pccomponentes", 1, NOW, 5, "boom")
    await repo.record_feed_run("pccomponentes", 1, NOW, 7, None)
    assert repo.feed_runs[("pccomponentes", 1)] == {"last_run_at": NOW, "products": 7, "last_error": None}
    await repo.upsert_catalog_products([_catalog_row(url="https://shop/x")])
    assert (await repo.find_catalog_product("pccomponentes", "https://shop/x")).external_id == "a"
    other = InMemoryRepository()
    await other.upsert_catalog_products(
        [_catalog_row(ext="old", url="https://shop/y", in_stock=False), _catalog_row(ext="new", url="https://shop/y")]
    )
    assert (await other.find_catalog_product("pccomponentes", "https://shop/y")).external_id == "new"
    assert await repo.find_catalog_product("mediamarkt", "https://shop/x") is None
    assert await repo.find_catalog_product("pccomponentes", "https://shop/none") is None


def _promo(external_id: str) -> EventPromoRow:
    return EventPromoRow(
        external_id, f"t{external_id}", Decimal("9.99"), None, None, f"https://aff/{external_id}", 1
    )


async def test_list_events_with_promo_skips_events_without_campaign():
    repo = InMemoryRepository()
    repo.add_event("black-friday")
    repo.add_event("empty", aliexpress_promo="")
    ali = repo.add_event("aliexpress-1111", aliexpress_promo="11.11 Big Sale", status="draft")
    assert [e.slug for e in await repo.list_events_with_promo()] == ["aliexpress-1111"]
    assert (await repo.list_events_with_promo())[0] == EventRef(
        ali, "aliexpress-1111", "11.11 Big Sale"
    )


async def test_replace_event_promos_drops_previous_rows():
    repo = InMemoryRepository()
    ev = repo.add_event("x", aliexpress_promo="p")
    await repo.replace_event_promos(ev, [_promo("1"), _promo("2")])
    await repo.replace_event_promos(ev, [_promo("3")])
    assert [r.external_id for r in repo.event_promos[ev]] == ["3"]


async def _draft(repo: InMemoryRepository, offer: ParsedOffer | None = None) -> tuple[int, int, int]:
    offer = offer or dataclasses.replace(
        make_offer(title="Robot S20"), price=Decimal("149"), previous_price=Decimal("249"),
        coupon="XIAO20", hashtags=["#robot"],
    )
    product_id = await repo.upsert_product(offer)
    source = await repo.manual_source_id()
    offer_id = await repo.insert_offer(product_id, source, 1, offer, "raw", NOW)
    pub_id = await repo.insert_publication(
        offer_id, product_id, "ES", None, None, Decimal("149"), "https://aff/x", NOW,
        status=PublicationStatus.DRAFT,
    )
    return pub_id, offer_id, product_id


async def test_last_publication_ignores_drafts():
    repo = InMemoryRepository()
    pid = await repo.upsert_product(make_offer())
    await repo.insert_publication(
        1, pid, "ES", 1, 1, Decimal("10"), "u", NOW, channel="telegram"
    )
    await repo.insert_publication(
        1, pid, "ES", None, None, Decimal("5"), "u", NOW + timedelta(hours=1),
        channel="telegram", status=PublicationStatus.DRAFT,
    )
    last = await repo.get_last_publication(pid, "ES", channel="telegram")
    assert last.status == PublicationStatus.ACTIVE
    assert last.published_price == Decimal("10")


async def test_manual_source_id_is_stable():
    repo = InMemoryRepository()
    assert await repo.manual_source_id() == await repo.manual_source_id()


async def test_get_post_joins_offer_and_product():
    repo = InMemoryRepository()
    pub_id, offer_id, product_id = await _draft(repo)
    post = await repo.get_post(pub_id)
    assert (post.title, post.coupon, post.price, post.status) == (
        "Robot S20", "XIAO20", Decimal("149"), PublicationStatus.DRAFT,
    )
    assert (post.offer_id, post.product_id, post.previous_price) == (
        offer_id, product_id, Decimal("249"),
    )
    assert (post.chat_id, post.message_id, post.store, post.country) == (None, None, "amazon", "ES")
    assert post.hashtags == ["robot"]
    assert await repo.get_post(999) is None


async def test_mark_post_published_sets_ids_and_active():
    repo = InMemoryRepository()
    pub_id, _offer_id, _ = await _draft(repo)
    later = NOW + timedelta(days=1)
    await repo.mark_post_published(pub_id, -100, 42, later)
    post = await repo.get_post(pub_id)
    assert (post.chat_id, post.message_id, post.status) == (-100, 42, PublicationStatus.ACTIVE)
    assert repo.publications()[0]["published_at"] == later
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED]


async def test_claim_jobs_claims_once():
    repo = InMemoryRepository()
    repo.add_job("publish", {"a": 1})
    repo.add_job("edit", {"b": 2})
    jobs = await repo.claim_jobs(10)
    assert [j.id for j in jobs] == [1, 2]
    assert (jobs[0].type, jobs[0].payload) == ("publish", {"a": 1})
    assert await repo.claim_jobs(10) == []


async def test_claim_jobs_respects_limit():
    repo = InMemoryRepository()
    for _ in range(3):
        repo.add_job("publish", {})
    assert [j.id for j in await repo.claim_jobs(2)] == [1, 2]
    assert [j.id for j in await repo.claim_jobs(2)] == [3]


async def test_finish_job_done_and_error():
    repo = InMemoryRepository()
    repo.add_job("publish", {})
    repo.add_job("publish", {})
    await repo.claim_jobs(10)
    await repo.finish_job(1, result={"ok": True})
    await repo.finish_job(2, error="boom")
    jobs = repo.jobs()
    assert (jobs[0]["status"], jobs[0]["result"], jobs[0]["error"]) == ("done", {"ok": True}, None)
    assert (jobs[1]["status"], jobs[1]["error"]) == ("error", "boom")


async def test_add_admin_user_stores_non_owner():
    repo = InMemoryRepository()
    await repo.add_admin_user("u1", "a@b.c")
    assert repo.admin_users == {"u1": {"email": "a@b.c", "is_owner": False}}


async def test_fail_running_jobs_only_touches_running():
    repo = InMemoryRepository()
    repo.add_job("publish", {})
    repo.add_job("publish", {})
    repo.add_job("publish", {})
    await repo.claim_jobs(2)
    await repo.finish_job(1, result={})
    assert await repo.fail_running_jobs("interrumpido") == 1
    jobs = repo.jobs()
    assert [j["status"] for j in jobs] == ["done", "error", "pending"]
    assert jobs[1]["error"] == "interrumpido"
