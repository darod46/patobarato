import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest

from patobarato.config import Settings
from patobarato.core.pipeline import MIN_PUBLISH_INTERVAL_SECONDS, Pipeline
from patobarato.models import OfferStatus, SourceMessage
from patobarato.parsing.links import UrlResolver
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
SHORT_URL = "https://amzn.to/a"
BOOM_URL = "https://amzn.to/boom"
AFFILIATE_URL = "https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21"


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
        self.calls: list[tuple[str, str, bytes | None]] = []

    async def publish(
        self, caption: str, button_url: str, photo: bytes | None
    ) -> tuple[int, int]:
        self.calls.append((caption, button_url, photo))
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
    def factory(photo_provider=_no_photo, pub=None, repository=None) -> Pipeline:
        return Pipeline(
            repository or repo,
            resolver,
            pub or publisher,
            photo_provider,
            _settings(),
            clock=lambda: NOW,
            sleep=fake_time.sleep,
            monotonic=fake_time.monotonic,
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
    caption, button_url, photo = publisher.calls[0]
    assert button_url == AFFILIATE_URL
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
    assert publisher.calls[0][2] is None
    assert any(
        r.name == "patobarato.pipeline" and r.exc_info for r in caplog.records
    )


async def test_photo_is_passed_to_publisher(make_pipeline, publisher):
    async def photo(msg: SourceMessage, url: str) -> bytes | None:
        return b"jpeg"

    pipeline = make_pipeline(photo_provider=photo)

    await pipeline.process(_msg())

    assert publisher.calls[0][2] == b"jpeg"


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

    assert publisher.calls[0][1] == AFFILIATE_URL
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
