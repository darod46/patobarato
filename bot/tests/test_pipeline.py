import asyncio
import dataclasses
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest
from telethon.errors import FloodWaitError, ImageProcessFailedError, PhotoInvalidDimensionsError

from patobarato.config import Settings
from patobarato.core.pipeline import (
    MIN_PUBLISH_INTERVAL_SECONDS,
    PRICE_FETCH_TIMEOUT_SECONDS,
    Pipeline,
)
from patobarato.models import OfferStatus, PriceQuote, SourceMessage
from patobarato.parsing.extract import extract_offers
from patobarato.parsing.links import UrlResolver
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.amazon import AmazonStore
from patobarato.stores.base import BaseStore
from patobarato.stores.registry import StoreRegistry

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
SHORT_URL = "https://amzn.to/a"
BOOM_URL = "https://amzn.to/boom"
AFFILIATE_URL = "https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21"


class FakeAmazon(AmazonStore):
    """Real Amazon links, image lookup through a fake finder."""

    def __init__(self, finder) -> None:
        super().__init__("patobarato-21", None)
        self._finder = finder

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        if self._finder is None:
            return None
        return await self._finder.find(product_id, "ES")


def _handler(request: httpx.Request) -> httpx.Response:
    if request.url.path == "/boom":
        raise RuntimeError("resolver exploded")
    if request.url.path == "/a":
        return httpx.Response(
            301, headers={"Location": "https://www.amazon.es/dp/B09XS7JWHH?ref=x"}
        )
    return httpx.Response(404)


class FakePublisher:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[tuple[str, bytes | None]] = []

    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]:
        self.calls.append((caption, photo))
        if self.fail:
            raise RuntimeError("telegram down")
        return (-100123, len(self.calls))


async def _no_photo(msg: SourceMessage, url: str) -> bytes | None:
    return None


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        telegram_api_id=1,
        telegram_api_hash="hash",
        telegram_bot_token="token",
        supabase_url="https://example.supabase.co",
        supabase_service_key="key",
    )


def _msg(
    source_id: int = 1,
    message_id: int = 1,
    price: str = "249,99€",
    url: str = SHORT_URL,
    received_at: datetime = NOW,
) -> SourceMessage:
    return SourceMessage(
        source_id=source_id,
        message_id=message_id,
        text=f"Sony WH-1000XM5 a {price} {url}",
        urls=[url],
        hashtags=[],
        received_at=received_at,
    )


@pytest.fixture
async def resolver():
    async with httpx.AsyncClient(transport=httpx.MockTransport(_handler)) as client:
        yield UrlResolver(client)


@pytest.fixture
def repo():
    return InMemoryRepository()


@pytest.fixture
def publisher():
    return FakePublisher()


class FakeTime:
    """Monotonic clock plus a sleep that advances it instantly."""

    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def fake_time():
    return FakeTime()


@pytest.fixture
def make_pipeline(repo, resolver, publisher, fake_time):
    def factory(
        photo_provider=_no_photo,
        pub=None,
        repository=None,
        image_finder=None,
        registry=None,
        image_downloader=None,
        **extra,
    ) -> Pipeline:
        if registry is None:
            registry = StoreRegistry([FakeAmazon(image_finder)])
        return Pipeline(
            repository or repo,
            resolver,
            pub or publisher,
            photo_provider,
            _settings(),
            clock=lambda: NOW,
            sleep=fake_time.sleep,
            monotonic=fake_time.monotonic,
            registry=registry,
            image_downloader=image_downloader,
            **extra,
        )

    return factory


async def _wait_for(condition: Callable[[], bool], timeout: float = 2.0) -> None:
    async def poll() -> None:
        while not condition():
            await asyncio.sleep(0.01)

    await asyncio.wait_for(poll(), timeout)


async def _stop(task: asyncio.Task) -> None:
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_new_offer_published_with_affiliate_url(make_pipeline, repo, publisher):
    pipeline = make_pipeline()

    statuses = await pipeline.process(_msg())

    assert statuses == [OfferStatus.PUBLISHED]
    assert len(publisher.calls) == 1
    caption, photo = publisher.calls[0]
    assert AFFILIATE_URL in caption
    assert "249,99" in caption
    assert photo is None
    publications = repo.publications()
    assert len(publications) == 1
    assert publications[0]["affiliate_url"] == AFFILIATE_URL
    assert publications[0]["published_price"] == Decimal("249.99")
    assert publications[0]["published_at"] == NOW
    assert publications[0]["chat_id"] == -100123
    assert publications[0]["message_id"] == 1
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED]


async def test_same_offer_from_two_sources_publishes_once(
    make_pipeline, repo, publisher
):
    pipeline = make_pipeline()
    worker = asyncio.create_task(pipeline.run())
    try:
        await pipeline.submit(_msg(source_id=1, message_id=10))
        await pipeline.submit(_msg(source_id=2, message_id=20))
        await _wait_for(
            lambda: len(repo.offer_statuses()) == 2
            and OfferStatus.PENDING not in repo.offer_statuses()
        )
    finally:
        await _stop(worker)

    assert len(publisher.calls) == 1
    assert repo.offer_statuses() == [
        OfferStatus.PUBLISHED,
        OfferStatus.SKIPPED_DUPLICATE,
    ]


async def test_cheaper_republishes(make_pipeline, repo, publisher):
    pipeline = make_pipeline()

    first = await pipeline.process(_msg(source_id=1, price="249,99€"))
    second = await pipeline.process(_msg(source_id=2, price="199,99€"))

    assert first == [OfferStatus.PUBLISHED]
    assert second == [OfferStatus.PUBLISHED]
    assert len(publisher.calls) == 2
    assert [p["published_price"] for p in repo.publications()] == [
        Decimal("249.99"),
        Decimal("199.99"),
    ]


async def test_no_price_not_published(make_pipeline, repo, publisher):
    pipeline = make_pipeline()
    msg = SourceMessage(1, 1, f"Sony WH-1000XM5 {SHORT_URL}", [SHORT_URL], [], NOW)

    statuses = await pipeline.process(msg)

    assert statuses == [OfferStatus.SKIPPED_NO_PRICE]
    assert publisher.calls == []
    assert repo.offer_statuses() == [OfferStatus.SKIPPED_NO_PRICE]


async def test_stale_not_published(make_pipeline, repo, publisher):
    pipeline = make_pipeline()

    statuses = await pipeline.process(_msg(received_at=NOW - timedelta(minutes=31)))

    assert statuses == [OfferStatus.SKIPPED_STALE]
    assert publisher.calls == []
    assert repo.offer_statuses() == [OfferStatus.SKIPPED_STALE]


async def test_publish_failure_marks_failed(make_pipeline, repo, caplog):
    failing = FakePublisher(fail=True)
    pipeline = make_pipeline(pub=failing)

    statuses = await pipeline.process(_msg())

    assert statuses == [OfferStatus.PUBLISH_FAILED]
    assert len(failing.calls) == 1
    assert repo.publications() == []
    assert repo.offer_statuses() == [OfferStatus.PUBLISH_FAILED]
    assert any(
        r.name == "patobarato.pipeline" and r.exc_info for r in caplog.records
    )


async def test_photo_provider_error_publishes_without_photo(
    make_pipeline, repo, publisher, caplog
):
    seen: list[tuple[SourceMessage, str]] = []

    async def broken_photo(msg: SourceMessage, url: str) -> bytes | None:
        seen.append((msg, url))
        raise RuntimeError("no preview")

    pipeline = make_pipeline(photo_provider=broken_photo)
    msg = _msg()

    statuses = await pipeline.process(msg)

    assert statuses == [OfferStatus.PUBLISHED]
    assert seen == [(msg, "https://www.amazon.es/dp/B09XS7JWHH")]
    assert len(publisher.calls) == 1
    assert publisher.calls[0][1] is None
    assert any(
        r.name == "patobarato.pipeline" and r.exc_info for r in caplog.records
    )


async def test_photo_is_passed_to_publisher(make_pipeline, publisher):
    async def photo(msg: SourceMessage, url: str) -> bytes | None:
        return b"jpeg"

    pipeline = make_pipeline(photo_provider=photo)

    await pipeline.process(_msg())

    assert publisher.calls[0][1] == b"jpeg"


async def test_listener_error_does_not_stop_worker(
    make_pipeline, repo, publisher, caplog
):
    pipeline = make_pipeline()
    worker = asyncio.create_task(pipeline.run())
    try:
        await pipeline.submit(_msg(message_id=1, url=BOOM_URL))
        await pipeline.submit(_msg(message_id=2))
        await _wait_for(lambda: len(publisher.calls) == 1)
    finally:
        await _stop(worker)

    assert AFFILIATE_URL in publisher.calls[0][0]
    assert repo.offer_statuses() == [OfferStatus.PUBLISHED]
    assert any(
        r.name == "patobarato.pipeline" and r.exc_info for r in caplog.records
    )


# --- M9: persistence failure after a successful publish ---------------------------


class FlakyRepository(InMemoryRepository):
    """Fails the first ``n`` insert_publication / PUBLISHED status writes."""

    def __init__(self, publication_failures: int = 0, status_failures: int = 0) -> None:
        super().__init__()
        self.publication_failures = publication_failures
        self.status_failures = status_failures
        self.publication_attempts = 0

    async def insert_publication(self, *args, **kwargs) -> int:
        self.publication_attempts += 1
        if self.publication_failures > 0:
            self.publication_failures -= 1
            raise RuntimeError("supabase down")
        return await super().insert_publication(*args, **kwargs)

    async def set_offer_status(self, offer_id, status) -> None:
        if status == OfferStatus.PUBLISHED and self.status_failures > 0:
            self.status_failures -= 1
            raise RuntimeError("supabase down")
        await super().set_offer_status(offer_id, status)


async def test_publication_insert_retried_once(make_pipeline, publisher):
    flaky = FlakyRepository(publication_failures=1)
    pipeline = make_pipeline(repository=flaky)

    assert await pipeline.process(_msg()) == [OfferStatus.PUBLISHED]

    assert flaky.publication_attempts == 2
    assert len(flaky.publications()) == 1
    assert flaky.offer_statuses() == [OfferStatus.PUBLISHED]
    assert len(publisher.calls) == 1


async def test_publication_insert_failing_twice_is_logged_not_raised(
    make_pipeline, publisher, caplog
):
    flaky = FlakyRepository(publication_failures=2)
    pipeline = make_pipeline(repository=flaky)

    with caplog.at_level(logging.ERROR, logger="patobarato.pipeline"):
        statuses = await pipeline.process(_msg())

    assert statuses == [OfferStatus.PUBLISHED]
    assert flaky.publication_attempts == 2
    assert flaky.publications() == []
    assert flaky.offer_statuses() == [OfferStatus.PUBLISHED]
    [record] = [r for r in caplog.records if "publicado pero no registrado" in r.getMessage()]
    assert record.levelno == logging.ERROR
    assert "-100123" in record.getMessage()  # chat_id
    assert "message_id=1" in record.getMessage()


async def test_published_status_retried_once(make_pipeline):
    flaky = FlakyRepository(status_failures=1)
    pipeline = make_pipeline(repository=flaky)

    assert await pipeline.process(_msg()) == [OfferStatus.PUBLISHED]

    assert flaky.offer_statuses() == [OfferStatus.PUBLISHED]
    assert flaky.publication_attempts == 1


async def test_published_status_failing_twice_does_not_stop_worker(
    make_pipeline, publisher, caplog
):
    flaky = FlakyRepository(status_failures=2)
    pipeline = make_pipeline(repository=flaky)
    worker = asyncio.create_task(pipeline.run())
    try:
        with caplog.at_level(logging.ERROR, logger="patobarato.pipeline"):
            await pipeline.submit(_msg(message_id=1, price="249,99€"))
            await pipeline.submit(_msg(source_id=2, message_id=2, price="199,99€"))
            await _wait_for(lambda: len(publisher.calls) == 2 and len(flaky.publications()) == 2)
    finally:
        await _stop(worker)

    assert flaky.publication_attempts == 2  # not re-inserted by the status retry
    assert any("publicado pero no registrado" in r.getMessage() for r in caplog.records)


# --- M11: pacing between publications -----------------------------------------------


async def test_consecutive_publications_are_spaced(make_pipeline, publisher, fake_time):
    pipeline = make_pipeline()

    await pipeline.process(_msg(source_id=1, price="249,99€"))
    await pipeline.process(_msg(source_id=2, price="199,99€"))

    assert len(publisher.calls) == 2
    assert fake_time.sleeps == [MIN_PUBLISH_INTERVAL_SECONDS]
    assert MIN_PUBLISH_INTERVAL_SECONDS >= 3


async def test_no_wait_when_interval_already_passed(make_pipeline, publisher, fake_time):
    pipeline = make_pipeline()

    await pipeline.process(_msg(source_id=1, price="249,99€"))
    fake_time.now += 2
    await pipeline.process(_msg(source_id=2, price="199,99€"))
    fake_time.now += 10
    await pipeline.process(_msg(source_id=3, price="149,99€"))

    assert len(publisher.calls) == 3
    assert fake_time.sleeps == [pytest.approx(1.0)]


async def test_first_publication_does_not_wait(make_pipeline, fake_time):
    await make_pipeline().process(_msg())

    assert fake_time.sleeps == []


class FakeImageFinder:
    def __init__(self, url: str | None = "https://m.media-amazon.com/images/I/X._AC_SL500_.jpg", fail: bool = False) -> None:
        self.url = url
        self.fail = fail
        self.calls: list[tuple[str, str]] = []

    async def find(self, asin: str, country: str) -> str | None:
        self.calls.append((asin, country))
        if self.fail:
            raise RuntimeError("amazon down")
        return self.url


async def test_published_offer_stores_amazon_image_link(make_pipeline, repo):
    finder = FakeImageFinder()
    await make_pipeline(image_finder=finder).process(_msg())
    assert finder.calls == [("B09XS7JWHH", "ES")]
    assert list(repo.product_images.values()) == [
        "https://m.media-amazon.com/images/I/X._AC_SL500_.jpg"
    ]


async def test_no_image_found_leaves_product_without_image(make_pipeline, repo):
    finder = FakeImageFinder(url=None)
    statuses = await make_pipeline(image_finder=finder).process(_msg())
    assert statuses == [OfferStatus.PUBLISHED]
    assert repo.product_images == {}


async def test_image_lookup_failure_still_publishes(make_pipeline, repo, caplog):
    finder = FakeImageFinder(fail=True)
    with caplog.at_level(logging.ERROR, logger="patobarato.pipeline"):
        statuses = await make_pipeline(image_finder=finder).process(_msg())
    assert statuses == [OfferStatus.PUBLISHED]
    assert len(repo.publications()) == 1
    assert repo.product_images == {}
    assert any(
        r.levelno == logging.ERROR and "B09XS7JWHH" in r.getMessage()
        for r in caplog.records
    )


async def test_no_image_lookup_when_publish_fails(make_pipeline):
    finder = FakeImageFinder()
    await make_pipeline(pub=FakePublisher(fail=True), image_finder=finder).process(_msg())
    assert finder.calls == []


class FakeStore(BaseStore):
    id = "fake"
    name = "Tienda Fake"

    def __init__(
        self,
        fail_affiliate: bool = False,
        image: str | None = None,
        affiliate: str | None | type(...) = ...,
    ) -> None:
        self.fail_affiliate = fail_affiliate
        self.affiliate = affiliate
        self.image = image
        self.affiliate_calls: list[tuple[str, str]] = []
        self.image_calls: list[tuple[str, str]] = []

    def matches(self, url: str) -> bool:
        return "fake.example" in url

    def product_id(self, url: str) -> str | None:
        return "P1"

    def canonical_url(self, product_id: str, country: str) -> str:
        return f"https://fake.example/p/{product_id}"

    async def affiliate_url(self, canonical_url: str, product_id: str) -> str | None:
        self.affiliate_calls.append((canonical_url, product_id))
        if self.fail_affiliate:
            raise RuntimeError("affiliate api down")
        if self.affiliate is not ...:
            return self.affiliate
        return canonical_url + "?aff=1"

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        self.image_calls.append((product_id, canonical_url))
        return self.image


def _fake_msg() -> SourceMessage:
    url = "https://fake.example/p/P1"
    return SourceMessage(
        source_id=1,
        message_id=1,
        text=f"Cacharro a 10,00€ {url}",
        urls=[url],
        hashtags=[],
        received_at=NOW,
    )


async def test_failed_affiliate_url_is_not_published_and_logs(
    make_pipeline, repo, publisher, caplog
):
    store = FakeStore(fail_affiliate=True)
    with caplog.at_level(logging.WARNING, logger="patobarato.pipeline"):
        statuses = await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    assert statuses == [OfferStatus.SKIPPED_NO_AFFILIATE]
    assert publisher.calls == []
    assert repo.publications() == []
    assert repo.offer_statuses() == [OfferStatus.SKIPPED_NO_AFFILIATE]
    assert any(
        "affiliate=missing store=fake product=P1" in r.getMessage()
        and "not published" in r.getMessage()
        for r in caplog.records
    )


async def test_none_affiliate_url_is_not_published(make_pipeline, repo, publisher):
    store = FakeStore(affiliate=None)
    statuses = await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    assert statuses == [OfferStatus.SKIPPED_NO_AFFILIATE]
    assert publisher.calls == []


async def test_affiliate_equal_to_canonical_is_not_published(make_pipeline, repo, publisher):
    store = FakeStore(affiliate="https://fake.example/p/P1")
    statuses = await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    assert statuses == [OfferStatus.SKIPPED_NO_AFFILIATE]
    assert publisher.calls == []
    assert repo.publications() == []


async def test_no_affiliate_skips_before_photo_work_and_publish_slot(make_pipeline, fake_time):
    finder = FakeImageFinder()
    downloads: list[str] = []

    async def downloader(url: str) -> bytes:
        downloads.append(url)
        return b"x"

    store = FakeStore(affiliate=None, image="https://img.example/a.jpg")
    pipeline = make_pipeline(registry=StoreRegistry([store]), image_downloader=downloader)
    await pipeline.process(_fake_msg())
    assert store.image_calls == []
    assert downloads == []
    assert fake_time.sleeps == []


async def test_store_affiliate_url_and_name_used_in_caption(make_pipeline, publisher):
    store = FakeStore()
    await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    caption = publisher.calls[0][0]
    assert "🛒 Ver en Tienda Fake:" in caption
    assert "https://fake.example/p/P1?aff=1" in caption


async def test_prefilled_affiliate_url_is_used_as_is(make_pipeline, publisher):
    class Prefilled(FakeStore):
        pass

    store = Prefilled()
    registry = StoreRegistry([store])
    from patobarato.parsing import extract as extract_module

    real = extract_module.extract_offers

    async def with_affiliate(msg, resolver, reg):
        offers = await real(msg, resolver, reg)
        return [dataclasses.replace(o, affiliate_url="https://aff.example/x") for o in offers]

    import patobarato.core.pipeline as pipeline_module

    original = pipeline_module.extract_offers
    pipeline_module.extract_offers = with_affiliate
    try:
        await make_pipeline(registry=registry).process(_fake_msg())
    finally:
        pipeline_module.extract_offers = original
    assert store.affiliate_calls == []
    assert "https://aff.example/x" in publisher.calls[0][0]


async def test_offer_image_url_skips_find_image(make_pipeline, repo):
    store = FakeStore(image="https://img/found.jpg")
    await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    assert store.image_calls == [("P1", "https://fake.example/p/P1")]
    assert list(repo.product_images.values()) == ["https://img/found.jpg"]


async def test_telegram_post_goes_out_after_web_only_publication(
    make_pipeline, repo, publisher, resolver
):
    pipeline = make_pipeline()
    [offer] = await extract_offers(_msg(), resolver, StoreRegistry([FakeAmazon(None)]))
    product_id = await repo.upsert_product(offer)
    await repo.insert_publication(
        99, product_id, "ES", None, None, Decimal("249.99"), "https://x", NOW, channel="web"
    )

    statuses = await pipeline.process(_msg())

    assert statuses == [OfferStatus.PUBLISHED]
    assert len(publisher.calls) == 1


class PricedStore(FakeStore):
    """A store whose page has a price (or None, or fails)."""

    def __init__(self, quote: PriceQuote | None = None, fail: bool = False, **kwargs) -> None:
        super().__init__(**kwargs)
        self.quote = quote
        self.fail = fail
        self.price_calls: list[tuple[str, str]] = []

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        self.price_calls.append((product_id, canonical_url))
        if self.fail:
            raise RuntimeError("store page down")
        return self.quote


def _priceless_msg() -> SourceMessage:
    url = "https://fake.example/p/P1"
    return SourceMessage(1, 1, f"PRECIAZO!\nCacharro\n{url}", [url], [], NOW)


async def test_missing_text_price_is_fetched_from_the_store(make_pipeline, repo, publisher):
    store = PricedStore(PriceQuote(Decimal("8.50"), Decimal("12.00"), image_url="https://img/q.jpg"))

    statuses = await make_pipeline(registry=StoreRegistry([store])).process(_priceless_msg())

    assert statuses == [OfferStatus.PUBLISHED]
    assert store.price_calls == [("P1", "https://fake.example/p/P1")]
    caption = publisher.calls[0][0]
    assert "8,50" in caption
    assert "12" in caption
    assert repo.publications()[0]["published_price"] == Decimal("8.50")
    # The quote's image is the product image: no extra lookup.
    assert store.image_calls == []
    assert list(repo.product_images.values()) == ["https://img/q.jpg"]


async def test_text_price_is_not_fetched(make_pipeline):
    store = PricedStore(PriceQuote(Decimal("1"), None))
    await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    assert store.price_calls == []


async def test_store_without_price_still_skips(make_pipeline, repo, publisher):
    store = PricedStore(None)
    statuses = await make_pipeline(registry=StoreRegistry([store])).process(_priceless_msg())
    assert statuses == [OfferStatus.SKIPPED_NO_PRICE]
    assert store.price_calls == [("P1", "https://fake.example/p/P1")]
    assert publisher.calls == []


async def test_store_price_failure_is_logged_and_skips(make_pipeline, publisher, caplog):
    store = PricedStore(fail=True)
    with caplog.at_level(logging.WARNING, logger="patobarato.pipeline"):
        statuses = await make_pipeline(registry=StoreRegistry([store])).process(_priceless_msg())
    assert statuses == [OfferStatus.SKIPPED_NO_PRICE]
    assert len(store.price_calls) == 1
    assert publisher.calls == []
    assert any("store page down" in r.getMessage() for r in caplog.records)


async def test_stale_priceless_message_does_not_fetch(make_pipeline):
    store = PricedStore(PriceQuote(Decimal("8.50"), None))
    msg = dataclasses.replace(_priceless_msg(), received_at=NOW - timedelta(days=1))
    statuses = await make_pipeline(registry=StoreRegistry([store])).process(msg)
    assert statuses == [OfferStatus.SKIPPED_NO_PRICE]
    assert store.price_calls == []


async def test_store_previous_price_not_above_price_is_dropped(make_pipeline, publisher):
    store = PricedStore(PriceQuote(Decimal("8.50"), Decimal("8.50")))
    await make_pipeline(registry=StoreRegistry([store])).process(_priceless_msg())
    assert "8,50" in publisher.calls[0][0]
    assert publisher.calls[0][0].count("8,50") == 1


TWO_OFFERS = (
    "Auriculares 249,99€ https://www.amazon.es/dp/B09XS7JWHH\n\n"
    "Ratón 19,95€ https://www.amazon.es/dp/B0BDJH7LQ2"
)


def _attached_msg(text: str, urls: list[str]) -> SourceMessage:
    async def attached() -> bytes | None:
        return b"attached"

    return SourceMessage(1, 1, text, urls, [], NOW, attached_photo=attached)


class RecordingProvider:
    def __init__(self, result: bytes | None = None) -> None:
        self.result = result
        self.seen: list[SourceMessage] = []

    async def __call__(self, msg: SourceMessage, url: str) -> bytes | None:
        self.seen.append(msg)
        return self.result


async def test_attached_photo_offered_only_for_single_offer_messages(make_pipeline):
    provider = RecordingProvider()
    url = "https://www.amazon.es/dp/B09XS7JWHH"
    await make_pipeline(photo_provider=provider).process(_attached_msg(f"Cascos 9€ {url}", [url]))
    two = _attached_msg(
        TWO_OFFERS, ["https://www.amazon.es/dp/B09XS7JWHH", "https://www.amazon.es/dp/B0BDJH7LQ2"]
    )
    await make_pipeline(photo_provider=provider, repository=InMemoryRepository()).process(two)

    single, *multi = provider.seen
    assert single.attached_photo is not None
    assert len(multi) == 2
    assert all(m.attached_photo is None for m in multi)


class FakeDownloader:
    def __init__(self, result: bytes | None = b"downloaded", fail: bool = False) -> None:
        self.result = result
        self.fail = fail
        self.urls: list[str] = []

    async def __call__(self, url: str) -> bytes | None:
        self.urls.append(url)
        if self.fail:
            raise RuntimeError("cdn down")
        return self.result


def _pipeline_with_downloader(make_pipeline, store, downloader, provider=_no_photo) -> Pipeline:
    return make_pipeline(
        registry=StoreRegistry([store]), photo_provider=provider, image_downloader=downloader
    )


async def test_store_image_is_downloaded_when_telegram_has_no_photo(make_pipeline, repo, publisher):
    store = FakeStore(image="https://img/found.jpg")
    downloader = FakeDownloader()

    await _pipeline_with_downloader(make_pipeline, store, downloader).process(_fake_msg())

    assert downloader.urls == ["https://img/found.jpg"]
    assert publisher.calls[0][1] == b"downloaded"
    # One lookup serves both the post photo and the product image.
    assert store.image_calls == [("P1", "https://fake.example/p/P1")]
    assert list(repo.product_images.values()) == ["https://img/found.jpg"]


async def test_store_price_image_is_downloaded_without_lookup(make_pipeline, publisher):
    store = PricedStore(PriceQuote(Decimal("8.50"), None, image_url="https://img/q.jpg"))
    downloader = FakeDownloader()

    await _pipeline_with_downloader(make_pipeline, store, downloader).process(_priceless_msg())

    assert downloader.urls == ["https://img/q.jpg"]
    assert store.image_calls == []
    assert publisher.calls[0][1] == b"downloaded"


async def test_telegram_photo_skips_download(make_pipeline, publisher):
    store = FakeStore(image="https://img/found.jpg")
    downloader = FakeDownloader()

    await _pipeline_with_downloader(
        make_pipeline, store, downloader, provider=RecordingProvider(b"tg")
    ).process(_fake_msg())

    assert downloader.urls == []
    assert publisher.calls[0][1] == b"tg"


@pytest.mark.parametrize("downloader", [FakeDownloader(None), FakeDownloader(fail=True)])
async def test_failed_download_publishes_without_photo(make_pipeline, publisher, downloader, caplog):
    store = FakeStore(image="https://img/found.jpg")
    with caplog.at_level(logging.WARNING, logger="patobarato.pipeline"):
        statuses = await _pipeline_with_downloader(make_pipeline, store, downloader).process(_fake_msg())
    assert statuses == [OfferStatus.PUBLISHED]
    assert publisher.calls[0][1] is None


async def test_failed_image_lookup_publishes_without_photo(make_pipeline, publisher):
    class BrokenImages(FakeStore):
        async def find_image(self, product_id: str, canonical_url: str) -> str | None:
            raise RuntimeError("image finder down")

    downloader = FakeDownloader()
    statuses = await _pipeline_with_downloader(make_pipeline, BrokenImages(), downloader).process(_fake_msg())
    assert statuses == [OfferStatus.PUBLISHED]
    assert downloader.urls == []
    assert publisher.calls[0][1] is None


class PhotoRejectingPublisher(FakePublisher):
    def __init__(self, error: Exception) -> None:
        super().__init__()
        self.error = error

    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]:
        self.calls.append((caption, photo))
        if photo is not None:
            raise self.error
        return (-100123, len(self.calls))


async def _photo(msg: SourceMessage, url: str) -> bytes | None:
    return b"bad-photo"


@pytest.mark.parametrize(
    "error", [PhotoInvalidDimensionsError(request=None), ImageProcessFailedError(request=None)]
)
async def test_rejected_photo_is_retried_without_photo(make_pipeline, repo, error, caplog):
    pub = PhotoRejectingPublisher(error)
    with caplog.at_level(logging.WARNING, logger="patobarato.pipeline"):
        statuses = await make_pipeline(photo_provider=_photo, pub=pub).process(_msg())
    assert statuses == [OfferStatus.PUBLISHED]
    assert [photo for _, photo in pub.calls] == [b"bad-photo", None]
    assert len(repo.publications()) == 1
    assert any("without photo" in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize(
    "error", [ConnectionError("down"), FloodWaitError(request=None, capture=60)]
)
async def test_transient_failure_with_photo_is_not_retried(make_pipeline, repo, error):
    pub = PhotoRejectingPublisher(error)
    statuses = await make_pipeline(photo_provider=_photo, pub=pub).process(_msg())
    assert statuses == [OfferStatus.PUBLISH_FAILED]
    assert len(pub.calls) == 1


class SlowStore(PricedStore):
    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        self.price_calls.append((product_id, canonical_url))
        await asyncio.sleep(10)
        return PriceQuote(Decimal("1"), None)


async def test_slow_store_price_times_out_as_no_price(make_pipeline, publisher, caplog):
    store = SlowStore()
    pipeline = make_pipeline(registry=StoreRegistry([store]), price_fetch_timeout_seconds=0.05)
    with caplog.at_level(logging.WARNING, logger="patobarato.pipeline"):
        statuses = await asyncio.wait_for(pipeline.process(_priceless_msg()), 2)
    assert statuses == [OfferStatus.SKIPPED_NO_PRICE]
    assert len(store.price_calls) == 1
    assert publisher.calls == []
    assert any("timed out" in r.getMessage() for r in caplog.records)


def test_price_fetch_timeout_default_is_short():
    assert PRICE_FETCH_TIMEOUT_SECONDS == 5.0


class FakeAliExpress(PricedStore):
    """A priced store with the AliExpress id: its API price is before coupons."""

    id = "aliexpress"
    name = "AliExpress"


SYMINO_TEXT = (
    "🔥 PRECIAZO!\n❗️Aplicar cupón: AEES03\n🚚 Envío gratis\n\n"
    "SYMINO ▫️ Raqueta de Pádel de fibra de carbono\n\n"
    "🔗 Link: https://fake.example/p/P1\n\n📢 #pub"
)


def _symino_msg() -> SourceMessage:
    url = "https://fake.example/p/P1"
    return SourceMessage(1, 1, SYMINO_TEXT, [url], ["pub"], NOW)


async def test_aliexpress_store_price_is_published_as_price_before_coupon(
    make_pipeline, repo, publisher
):
    store = FakeAliExpress(
        PriceQuote(Decimal("114.32"), Decimal("228.64"), title="SYMINO Padel Racket Carbon")
    )

    statuses = await make_pipeline(registry=StoreRegistry([store])).process(_symino_msg())

    assert statuses == [OfferStatus.PUBLISHED]
    caption = publisher.calls[0][0]
    assert "✅ Precio sin cupón: <b>114,32 €</b>" in caption
    assert "🎟️ Cupón: <code>AEES03</code>" in caption
    # The API's list price (often an inflated 2x) is never shown as the previous price.
    assert "228" not in caption
    assert "Antes" not in caption
    [publication] = repo.publications()
    assert publication["price_before_coupon"] is True


async def test_aliexpress_previous_price_from_the_text_is_kept(
    make_pipeline, publisher, monkeypatch
):
    # The parser only keeps a previous price next to a price; an offer may still carry one.
    import patobarato.core.pipeline as pipeline_module

    real = pipeline_module.extract_offers

    async def with_previous(msg, resolver, reg):
        offers = await real(msg, resolver, reg)
        return [dataclasses.replace(o, previous_price=Decimal("150")) for o in offers]

    monkeypatch.setattr(pipeline_module, "extract_offers", with_previous)
    store = FakeAliExpress(PriceQuote(Decimal("114.32"), Decimal("228.64")))
    await make_pipeline(registry=StoreRegistry([store])).process(_symino_msg())
    caption = publisher.calls[0][0]
    assert "❌ Antes: <s>150,00 €</s>" in caption
    assert "228" not in caption


async def test_other_store_price_is_not_marked_before_coupon(make_pipeline, repo, publisher):
    store = PricedStore(PriceQuote(Decimal("8.50"), Decimal("12.00")))
    await make_pipeline(registry=StoreRegistry([store])).process(_priceless_msg())
    assert "✅ Precio: <b>8,50 €</b>" in publisher.calls[0][0]
    assert repo.publications()[0]["price_before_coupon"] is False


async def test_aliexpress_text_price_is_not_marked_before_coupon(make_pipeline, repo, publisher):
    store = FakeAliExpress(PriceQuote(Decimal("1"), None))
    await make_pipeline(registry=StoreRegistry([store])).process(_fake_msg())
    assert store.price_calls == []
    assert "✅ Precio: <b>10,00 €</b>" in publisher.calls[0][0]
    assert repo.publications()[0]["price_before_coupon"] is False


async def test_store_title_mismatch_is_not_published(make_pipeline, repo, publisher, caplog):
    store = FakeAliExpress(
        PriceQuote(
            Decimal("31.08"),
            Decimal("62.16"),
            title="Nothing Ear (a) Auriculares inalámbricos con cancelación de ruido",
        )
    )
    with caplog.at_level(logging.WARNING, logger="patobarato.pipeline"):
        statuses = await make_pipeline(registry=StoreRegistry([store])).process(_symino_msg())

    assert statuses == [OfferStatus.SKIPPED_MISMATCH]
    assert publisher.calls == []
    assert repo.publications() == []
    assert repo.offer_statuses() == [OfferStatus.SKIPPED_MISMATCH]
    assert store.affiliate_calls == []
    message = next(r.getMessage() for r in caplog.records if "mismatch" in r.getMessage())
    assert "SYMINO Raqueta de Pádel" in message
    assert "Nothing Ear (a)" in message


async def test_store_title_match_is_published(make_pipeline, publisher):
    store = FakeAliExpress(
        PriceQuote(Decimal("31.08"), None, title="SYMINO Pickleball Padel Racket")
    )
    statuses = await make_pipeline(registry=StoreRegistry([store])).process(_symino_msg())
    assert statuses == [OfferStatus.PUBLISHED]
