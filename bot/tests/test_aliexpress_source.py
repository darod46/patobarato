import dataclasses
import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from patobarato.config import Settings
from patobarato.models import OfferStatus
from patobarato.sources.aliexpress_source import AliExpressSource, offer_message_id
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.aliexpress_client import AliExpressError, AliProduct

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        telegram_api_id=1,
        telegram_api_hash="hash",
        telegram_bot_token="token",
        supabase_url="https://example.supabase.co",
        supabase_service_key="key",
    )


def _product(pid, discount, price="10.00", original=None, image="http://img/x.jpg"):
    return AliProduct(
        product_id=pid,
        title=f"Producto {pid}",
        price=Decimal(price),
        original_price=Decimal(original) if original else None,
        discount=discount,
        image_url=image,
        url=f"https://es.aliexpress.com/item/{pid}.html?x=1",
        promotion_link=f"https://s.click.aliexpress.com/e/{pid}",
    )


class _Client:
    def __init__(self, products, link=None, hot_error=None):
        self.products = products
        self.hot_error = hot_error
        self.search_calls: list[dict] = []
        self.link = link  # str: link_generate result; Exception: raised; None: raises no_link
        self.calls: list[dict] = []
        self.link_calls: list[str] = []

    async def link_generate(self, url):
        self.link_calls.append(url)
        if isinstance(self.link, str):
            return self.link
        raise self.link or AliExpressError("no_link", "No promotion link returned")

    async def product_query(self, keywords, category_ids, page_size, page_no, sort="LAST_VOLUME_DESC"):
        self.search_calls.append(
            dict(keywords=keywords, category_ids=category_ids, page_size=page_size, page_no=page_no)
        )
        return self.products

    async def hot_products(self, category_ids, keywords, page_size, page_no):
        if self.hot_error:
            raise self.hot_error
        self.calls.append(
            dict(category_ids=category_ids, keywords=keywords, page_size=page_size, page_no=page_no)
        )
        return self.products


def _setup(products, config=None, hashtags=None, country="ES", clock=None, hot_error=None):
    repo = InMemoryRepository()
    source = repo.add_api_source(
        "aliexpress_api", "hot", country=country, config=config or {}, hashtags=hashtags or []
    )
    client = _Client(products, hot_error=hot_error)
    return repo, source, client, AliExpressSource(client, repo, _settings(), clock or (lambda: NOW))


PRODUCTS = [_product("1", 50), _product("2", 25), _product("3", 40)]


async def test_filters_by_min_discount_and_publishes_web_only():
    repo, source, _, runner = _setup(PRODUCTS, hashtags=["chollo"])

    await runner.run(source)

    pubs = repo.publications()
    assert [p["channel"] for p in pubs] == ["web", "web"]
    assert all(p["chat_id"] is None and p["message_id"] is None for p in pubs)
    assert pubs[0]["affiliate_url"] == "https://s.click.aliexpress.com/e/1"
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED_WEB] * 2
    assert len(repo.product_images) == 2
    assert repo.offer_hashtags(1) == ["chollo", "aliexpress"]


async def test_same_day_second_run_is_skipped_quietly(caplog):
    repo, source, _, runner = _setup(PRODUCTS)
    await runner.run(source)

    with caplog.at_level(logging.DEBUG):
        await runner.run(source)

    assert "s.click.aliexpress.com" not in caplog.text
    # insert_offer returns None for an already seen (source, product, day): nothing new.
    assert len(repo.publications()) == 2
    assert len(repo.offer_statuses()) == 2


async def test_max_results_limits_to_first():
    repo, source, client, runner = _setup(PRODUCTS, config={"max_results": 1})

    await runner.run(source)

    assert len(repo.publications()) == 1
    assert repo.publications()[0]["published_price"] == Decimal("10.00")
    assert client.calls[0]["page_size"] >= 1


async def test_config_is_passed_to_client_and_search_uses_product_query():
    _, source, client, runner = _setup(
        [], config={"query": "search", "keywords": "auriculares", "category_ids": ["15", 7]}
    )

    await runner.run(source)

    assert client.calls == []
    assert client.search_calls[0]["keywords"] == "auriculares"
    assert client.search_calls[0]["category_ids"] == ["15", "7"]


async def test_search_without_keywords_or_categories_warns_and_returns(caplog):
    repo, source, client, runner = _setup(PRODUCTS, config={"query": "search"})
    with caplog.at_level(logging.WARNING):
        await runner.run(source)
    assert client.calls == [] and client.search_calls == []
    assert repo.publications() == []
    assert f"AliExpress source {source.id}: query=search needs keywords or category_ids" in caplog.text


async def test_search_publishes_products():
    repo, source, _, runner = _setup(PRODUCTS, config={"query": "search", "keywords": "11.11"})
    await runner.run(source)
    assert len(repo.publications()) == 2


async def test_hot_falls_back_to_product_query_on_insufficient_permission(caplog):
    err = AliExpressError("InsufficientPermission", "App does not have permission")
    repo, source, client, runner = _setup(
        PRODUCTS, config={"keywords": "11.11", "category_ids": "15"}, hot_error=err
    )
    with caplog.at_level(logging.WARNING):
        await runner.run(source)
    assert client.search_calls[0]["keywords"] == "11.11"
    assert client.search_calls[0]["category_ids"] == ["15"]
    assert len(repo.publications()) == 2
    assert "hotproduct.query not permitted for this app; falling back to product.query" in caplog.text


async def test_hot_insufficient_permission_without_keywords_logs_error_and_publishes_nothing(caplog):
    err = AliExpressError("InsufficientPermission", "App does not have permission")
    repo, source, client, runner = _setup(PRODUCTS, hot_error=err)
    with caplog.at_level(logging.WARNING):
        await runner.run(source)
    assert client.search_calls == []
    assert repo.publications() == []
    errors = [r.getMessage() for r in caplog.records if r.levelno == logging.ERROR]
    assert any("keywords or category_ids" in m for m in errors)


async def test_hot_other_errors_still_propagate():
    import pytest

    err = AliExpressError("IllegalRequest", "bad")
    _, source, client, runner = _setup(PRODUCTS, config={"keywords": "x"}, hot_error=err)
    with pytest.raises(AliExpressError):
        await runner.run(source)
    assert client.search_calls == []


async def test_discount_computed_from_original_price_and_missing_is_filtered():
    products = [
        _product("1", None, price="6.00", original="10.00"),  # 40% computed
        _product("2", None, price="9.00"),  # unknown -> 0
    ]
    repo, source, _, runner = _setup(products)

    await runner.run(source)

    assert len(repo.publications()) == 1


async def test_min_discount_zero_keeps_everything_and_price_range_filters():
    products = [_product("1", None, price="5"), _product("2", None, price="50"), _product("3", None, price="500")]
    repo, source, _, runner = _setup(
        products, config={"min_discount": 0, "min_price": 10, "max_price": 100}
    )

    await runner.run(source)

    assert len(repo.publications()) == 1
    assert repo.publications()[0]["published_price"] == Decimal("50")


async def test_offer_uses_source_country_and_no_image_means_no_set_image():
    repo, source, _, runner = _setup([_product("1", 50, image=None)], country="PT")

    await runner.run(source)

    assert repo.publications()[0]["country"] == "PT"
    assert repo.product_images == {}


async def test_does_not_log_promotion_links_on_publish_or_failure(caplog):
    repo, source, _, runner = _setup(PRODUCTS)

    async def boom(*args, **kwargs):
        raise RuntimeError("fail")

    with caplog.at_level(logging.DEBUG):
        await runner.run(source)
        await runner.run(source)
        repo.insert_publication = boom
        runner._client.products = [_product("9", 50)]
        await runner.run(source)
    assert len(repo.publications()) == 2
    assert caplog.records
    assert all("s.click.aliexpress.com" not in r.getMessage() for r in caplog.records)


async def test_publication_failure_marks_failed_and_next_product_still_publishes():
    repo, source, _, runner = _setup([_product("1", 50), _product("2", 50)])
    original = repo.insert_publication

    async def flaky(offer_id, *args, **kwargs):
        if offer_id == 1:
            raise RuntimeError("db down")
        return await original(offer_id, *args, **kwargs)

    repo.insert_publication = flaky

    await runner.run(source)

    assert repo.offer_statuses() == [OfferStatus.PUBLISH_FAILED, OfferStatus.PUBLISHED_WEB]
    assert len(repo.publications()) == 1


async def test_image_failure_does_not_block_status():
    repo, source, _, runner = _setup([_product("1", 50)])

    async def boom(product_id, url):
        raise RuntimeError("img")

    repo.set_product_image = boom

    await runner.run(source)

    assert repo.offer_statuses() == [OfferStatus.PUBLISHED_WEB]


async def test_category_ids_as_string_is_wrapped():
    _, source, client, runner = _setup([], config={"category_ids": "15"})
    await runner.run(source)
    assert client.calls[0]["category_ids"] == ["15"]


def test_offer_message_id_is_deterministic_distinct_per_day_and_fits_int64():
    day = date(2026, 11, 6)
    a = offer_message_id("123", day)
    assert a == offer_message_id("123", day)
    assert a != offer_message_id("123", day + timedelta(days=1))
    assert a != offer_message_id("124", day)
    assert 0 <= a < 2**63


async def test_next_day_same_price_is_skipped_duplicate_and_recorded():
    now = [NOW]
    repo, source, _, runner = _setup(PRODUCTS, clock=lambda: now[0])
    await runner.run(source)

    now[0] = NOW + timedelta(days=1)
    await runner.run(source)

    assert len(repo.publications()) == 2
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED_WEB] * 2 + [
        OfferStatus.SKIPPED_DUPLICATE
    ] * 2


async def test_next_day_price_drop_publishes_again():
    now = [NOW]
    repo, source, client, runner = _setup([_product("1", 50, price="10.00")], clock=lambda: now[0])
    await runner.run(source)

    now[0] = NOW + timedelta(days=1)
    client.products = [_product("1", 60, price="8.00")]
    await runner.run(source)

    assert [p["published_price"] for p in repo.publications()] == [Decimal("10.00"), Decimal("8.00")]
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED_WEB] * 2


async def test_missing_promotion_link_is_generated_once():
    product = dataclasses.replace(_product("7", 50), promotion_link=None)
    repo, source, client, runner = _setup([product])
    client.link = "https://s.click.aliexpress.com/e/gen7"
    await runner.run(source)
    assert client.link_calls == ["https://es.aliexpress.com/item/7.html"]
    assert repo.publications()[0]["affiliate_url"] == "https://s.click.aliexpress.com/e/gen7"
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED_WEB]


async def test_missing_promotion_link_and_link_generate_failing_is_not_published(caplog):
    product = dataclasses.replace(_product("7", 50), promotion_link=None)
    repo, source, client, runner = _setup([product])
    with caplog.at_level(logging.WARNING):
        await runner.run(source)
    assert len(client.link_calls) == 1
    assert repo.publications() == []
    assert repo.offer_statuses() == [OfferStatus.SKIPPED_NO_AFFILIATE]
    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("affiliate=missing" in m and "7" in m and "not published" in m for m in warnings)
    assert all("http" not in m for m in warnings)


async def test_api_original_price_is_never_stored_as_previous_price():
    # original_price is often an inflated list price (exactly 2x): a fake -50 %.
    repo, source, _, runner = _setup([_product("1", 50, price="114.32", original="228.64")])

    await runner.run(source)

    assert repo.offer_statuses() == [OfferStatus.PUBLISHED_WEB]
    assert [o["previous_price"] for o in repo._offers.values()] == [None]


async def test_api_publications_are_marked_price_before_coupon():
    repo, source, _, runner = _setup([_product("1", 50)])
    await runner.run(source)
    assert [p["price_before_coupon"] for p in repo.publications()] == [True]
