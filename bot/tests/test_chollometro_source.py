import dataclasses
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
import pytest

from patobarato.config import Settings
from patobarato.core.pipeline import Pipeline
from patobarato.models import (
    ChollometroThread,
    OfferStatus,
    ParsedOffer,
    PriceQuote,
    PublicationStatus,
    ThreadState,
    TrackedThread,
)
from patobarato.parsing.links import UrlResolver
from patobarato.sources.chollometro_client import ChollometroBlocked
from patobarato.sources.chollometro_source import (
    ChollometroSource,
    thread_from_snapshot,
    thread_to_snapshot,
)
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.amazon import AmazonStore
from patobarato.stores.registry import StoreRegistry

NOW = datetime(2026, 11, 9, 12, 0, tzinfo=UTC)
STORE_IMAGE = "https://m.media-amazon.com/images/I/store.jpg"


def _asin(n: int) -> str:
    return f"B0TEST{n:04d}"


def _thread(
    n: int,
    temperature: float = 60.0,
    *,
    merchant: str | None = "Amazon",
    price: str | None = "20",
    previous: str | None = None,
    discount: int | None = None,
    expired: bool = False,
    coupon: str | None = None,
    categories: list[str] | None = None,
    published_at: datetime = NOW - timedelta(hours=1),
) -> ChollometroThread:
    return ChollometroThread(
        thread_id=n,
        title=f"Producto {n}",
        url=f"https://www.chollometro.com/ofertas/producto-{n}",
        visit_url=f"https://www.chollometro.com/visit/homenew/{n}",
        merchant=merchant,
        price=Decimal(price) if price is not None else None,
        previous_price=Decimal(previous) if previous is not None else None,
        discount=discount,
        temperature=temperature,
        expired=expired,
        sold_out=False,
        coupon=coupon,
        categories=categories or [],
        published_at=published_at,
    )


class FakeClient:
    """Programmable listing and thread pages; counts the requests that use up budget."""

    def __init__(self) -> None:
        self.listing: list[ChollometroThread] = []
        self.pages: dict[str, ChollometroThread | None] = {}
        # visit URL -> store URL; default: the Amazon page of the thread's ASIN.
        self.visits: dict[str, str | None] = {}
        self.block_threads = False
        self.thread_calls: list[str] = []
        self.visit_calls: list[str] = []

    @property
    def requests(self) -> int:
        return len(self.thread_calls) + len(self.visit_calls)

    async def fetch_new(self) -> list[ChollometroThread]:
        return list(self.listing)

    async def fetch_thread(self, url: str) -> ChollometroThread | None:
        self.thread_calls.append(url)
        if self.block_threads:
            raise ChollometroBlocked("403")
        return self.pages.get(url)

    async def resolve_visit(self, visit_url: str) -> str | None:
        self.visit_calls.append(visit_url)
        if visit_url in self.visits:
            return self.visits[visit_url]
        n = int(visit_url.rsplit("/", 1)[1])
        return f"https://www.amazon.es/dp/{_asin(n)}?ref=chollo"


class FakeAmazon(AmazonStore):
    def __init__(self) -> None:
        super().__init__("patobarato-21", None)
        self.quotes: dict[str, PriceQuote | None] = {}

    async def find_image(self, product_id: str, canonical_url: str) -> str | None:
        return STORE_IMAGE

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        return self.quotes.get(product_id)


class FakePublisher:
    def __init__(self) -> None:
        self.calls: list[tuple[str, bytes | None]] = []

    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]:
        self.calls.append((caption, photo))
        return (-100123, len(self.calls))


class FakePosts:
    def __init__(self) -> None:
        self.synced: list[int] = []

    async def sync_post(self, publication_id: int) -> dict:
        self.synced.append(publication_id)
        return {"edited": True}


class FakeRevalidator:
    def __init__(self) -> None:
        self.calls = 0

    async def revalidate(self) -> None:
        self.calls += 1


class SpyPipeline(Pipeline):
    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.offers: list[tuple[int, ParsedOffer, datetime]] = []

    async def process_offer(self, source_id, external_id, offer, raw_text, detected_at):
        self.offers.append((external_id, offer, detected_at))
        return await super().process_offer(source_id, external_id, offer, raw_text, detected_at)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> datetime:
        return self.now


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        telegram_api_id=1,
        telegram_api_hash="hash",
        telegram_bot_token="token",
        supabase_url="https://example.supabase.co",
        supabase_service_key="key",
    )


class Env:
    def __init__(self, http: httpx.AsyncClient, config: dict | None = None) -> None:
        self.repo = InMemoryRepository()
        self.client = FakeClient()
        self.store = FakeAmazon()
        self.registry = StoreRegistry([self.store])
        self.resolver = UrlResolver(http)
        self.publisher = FakePublisher()
        self.posts = FakePosts()
        self.revalidator = FakeRevalidator()
        self.clock = Clock()
        self.downloads: list[str] = []
        self.sleeps: list[float] = []
        self.source = self.repo.add_api_source(
            "chollometro", "chollometro", config=config or {}, every_minutes=5, hashtags=["chollo"]
        )

        async def download(url: str) -> bytes:
            self.downloads.append(url)
            return b"photo"

        async def no_sleep(seconds: float) -> None:
            self.sleeps.append(seconds)

        async def pipeline_sleep(seconds: float) -> None:
            pass

        self.pipeline = SpyPipeline(
            self.repo,
            self.resolver,
            self.publisher,
            _settings(),
            self.clock,
            pipeline_sleep,
            registry=self.registry,
            image_downloader=download,
        )
        self.runner = ChollometroSource(
            self.client,
            self.resolver,
            self.registry,
            self.repo,
            self.pipeline,
            self.posts,
            self.revalidator,
            _settings(),
            self.clock,
            sleep=no_sleep,
        )

    async def run(self) -> None:
        await self.runner.run(self.source)

    async def thread(self, n: int) -> TrackedThread | None:
        return (await self.repo.get_tracked_threads(self.source.id, [n])).get(n)

    async def states(self) -> dict[int, ThreadState]:
        tracked = await self.repo.list_tracked_threads(self.source.id, list(ThreadState))
        return {t.thread_id: t.state for t in tracked}


@pytest.fixture
async def env():
    transport = httpx.MockTransport(lambda r: httpx.Response(404))
    async with httpx.AsyncClient(transport=transport) as http:
        yield Env(http)


def _big_budget(e: Env) -> None:
    """Room to resolve a dozen /visit/ links in one run (default: 5 pages)."""
    e.source = dataclasses.replace(e.source, config={"max_pages_per_run": 30})


def _published(e: Env) -> list[dict]:
    return [p for p in e.repo.publications() if p["channel"] == "telegram"]


async def test_hot_thread_published_once(env):
    env.client.listing = [_thread(1, 60)]
    await env.run()
    assert len(_published(env)) == 1
    tracked = await env.thread(1)
    assert tracked.state == ThreadState.PUBLISHED
    assert tracked.publication_id == _published(env)[0]["id"]
    assert tracked.store_url == f"https://www.amazon.es/dp/{_asin(1)}?ref=chollo"


async def test_republished_thread_is_not_processed_twice(env):
    env.client.listing = [_thread(1, 60)]
    await env.run()
    env.clock.now += timedelta(minutes=5)
    await env.run()
    assert len(_published(env)) == 1
    assert len(env.pipeline.offers) == 1
    assert len(env.client.visit_calls) == 1


async def test_cold_thread_warms_up_later(env):
    env.client.listing = [_thread(1, 10)]
    await env.run()
    assert _published(env) == []
    assert (await env.thread(1)).state == ThreadState.WATCHING
    second = NOW + timedelta(minutes=20)
    env.clock.now = second
    env.client.listing = [_thread(1, 55)]
    await env.run()
    assert len(_published(env)) == 1
    assert env.pipeline.offers[0][2] == second
    assert (await env.thread(1)).qualified_at == second


async def test_discount_alone_qualifies(env):
    env.client.listing = [_thread(1, 5, price="55", previous="100")]
    await env.run()
    assert len(_published(env)) == 1
    assert (await env.thread(1)).discount == 45


async def test_unregistered_merchant_ignored(env):
    env.client.listing = [_thread(1, 90, merchant="Carrefour"), _thread(2, 90, merchant=None)]
    await env.run()
    assert await env.states() == {}
    assert env.client.requests == 0
    assert _published(env) == []


async def test_merchant_matched_without_case_accents_or_spaces(env):
    env.client.listing = [_thread(1, 60, merchant="AMAZÓN")]
    await env.run()
    assert (await env.thread(1)).state == ThreadState.PUBLISHED


async def test_cap_ten_per_hour_by_temperature(env):
    _big_budget(env)
    env.client.listing = [_thread(n, 51 + n) for n in range(1, 13)]
    await env.run()
    assert len(_published(env)) == 10
    states = await env.states()
    assert [n for n, s in states.items() if s == ThreadState.QUALIFIED] == [1, 2]
    assert all(states[n] == ThreadState.PUBLISHED for n in range(3, 13))

    env.clock.now = NOW + timedelta(minutes=31)
    await env.run()
    assert len(_published(env)) == 10
    for n in (1, 2):
        tracked = await env.thread(n)
        assert tracked.state == ThreadState.SKIPPED
        assert tracked.skip_reason == "stale"


async def test_cap_counts_publications_from_repo(env):
    product_id = await env.repo.upsert_product(_offer_stub())
    for i in range(10):
        offer_id = await env.repo.insert_offer(
            product_id, env.source.id, 900 + i, _offer_stub(), "x", NOW - timedelta(minutes=30)
        )
        await env.repo.insert_publication(
            offer_id, product_id, "ES", -1, i, Decimal("10"), "https://a",
            NOW - timedelta(minutes=30),
        )
    env.client.listing = [_thread(1, 90)]
    await env.run()
    assert len(_published(env)) == 10
    assert env.pipeline.offers == []
    assert (await env.thread(1)).state == ThreadState.QUALIFIED


def _offer_stub() -> ParsedOffer:
    return ParsedOffer(
        asin="B0PREV0000",
        country="ES",
        store="amazon",
        title="Previa",
        price=Decimal("10"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url="https://www.amazon.es/dp/B0PREV0000",
        product_url="https://www.amazon.es/dp/B0PREV0000",
    )


async def test_same_product_two_threads_dedup_by_decide(env):
    same = f"https://www.amazon.es/dp/{_asin(1)}"
    env.client.visits = {
        "https://www.chollometro.com/visit/homenew/1": same,
        "https://www.chollometro.com/visit/homenew/2": same,
    }
    env.client.listing = [_thread(1, 80), _thread(2, 70)]
    await env.run()
    assert len(_published(env)) == 1
    second = await env.thread(2)
    assert second.state == ThreadState.SKIPPED
    assert second.skip_reason == "skipped_duplicate"


async def test_visit_to_unknown_store_is_skipped_once(env):
    env.client.visits = {
        "https://www.chollometro.com/visit/homenew/1": "https://www.carrefour.es/p/1"
    }
    env.client.listing = [_thread(1, 90)]
    await env.run()
    tracked = await env.thread(1)
    assert tracked.state == ThreadState.SKIPPED
    assert tracked.skip_reason == "unknown_store"
    env.clock.now += timedelta(minutes=5)
    await env.run()
    assert len(env.client.visit_calls) == 1
    assert _published(env) == []


async def test_visit_without_redirect_is_unknown_store(env):
    env.client.visits = {"https://www.chollometro.com/visit/homenew/1": None}
    env.client.listing = [_thread(1, 90)]
    await env.run()
    assert (await env.thread(1)).skip_reason == "unknown_store"


async def test_expired_in_listing_ends_publication(env):
    env.client.listing = [_thread(1, 60)]
    await env.run()
    publication_id = (await env.thread(1)).publication_id
    env.clock.now += timedelta(minutes=5)
    env.client.listing = [_thread(1, 60, expired=True)]
    await env.run()
    assert _published(env)[0]["status"] == PublicationStatus.ENDED
    assert env.posts.synced == [publication_id]
    assert env.revalidator.calls == 1
    assert (await env.thread(1)).state == ThreadState.ENDED
    assert env.client.thread_calls == []

    env.clock.now += timedelta(minutes=5)
    await env.run()
    assert env.posts.synced == [publication_id]
    assert env.revalidator.calls == 1


async def test_expired_via_thread_page(env):
    env.client.listing = [_thread(1, 60)]
    await env.run()
    publication_id = (await env.thread(1)).publication_id
    env.clock.now += timedelta(minutes=5)
    env.client.listing = []
    env.client.pages[_thread(1).url] = _thread(1, 60, expired=True)
    await env.run()
    assert env.client.thread_calls == [_thread(1).url]
    assert _published(env)[0]["status"] == PublicationStatus.ENDED
    assert env.posts.synced == [publication_id]
    assert env.revalidator.calls == 1
    assert (await env.thread(1)).state == ThreadState.ENDED

    env.clock.now += timedelta(minutes=5)
    await env.run()
    assert env.client.thread_calls == [_thread(1).url]
    assert env.posts.synced == [publication_id]
    assert env.revalidator.calls == 1


async def test_end_errors_are_logged_not_raised(env):
    async def boom(*args):
        raise RuntimeError("down")

    env.client.listing = [_thread(1, 60)]
    await env.run()
    env.posts.sync_post = boom
    env.revalidator.revalidate = boom
    env.client.listing = [_thread(1, 60, expired=True)]
    await env.run()
    assert (await env.thread(1)).state == ThreadState.ENDED


async def test_publication_watch_window_ends_without_touching_post(env):
    env.client.listing = [_thread(1, 60)]
    await env.run()
    env.client.listing = []
    env.clock.now = NOW + timedelta(days=7, minutes=1)
    await env.run()
    assert (await env.thread(1)).state == ThreadState.ENDED
    assert env.client.thread_calls == []
    assert env.posts.synced == []
    assert _published(env)[0]["status"] == PublicationStatus.ACTIVE


async def test_cold_thread_out_of_window_is_skipped(env):
    env.client.listing = [_thread(1, 10)]
    await env.run()
    env.client.listing = []
    env.clock.now = NOW + timedelta(hours=24)
    await env.run()
    tracked = await env.thread(1)
    assert tracked.state == ThreadState.SKIPPED
    assert tracked.skip_reason == "cold"
    assert env.client.thread_calls == []


async def test_watching_thread_rewarmed_from_its_page(env):
    env.client.listing = [_thread(1, 10)]
    await env.run()
    env.clock.now += timedelta(minutes=5)
    env.client.listing = []
    env.client.pages[_thread(1).url] = _thread(1, 70)
    await env.run()
    assert env.client.thread_calls == [_thread(1).url]
    assert (await env.thread(1)).state == ThreadState.PUBLISHED


async def test_page_budget_respected():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        env = Env(http, config={"max_pages_per_run": 5})
        # 20 cold threads leave the listing (to re-warm) and 5 hot ones need /visit/.
        env.client.listing = [_thread(n, 10) for n in range(1, 21)]
        await env.run()
        env.clock.now += timedelta(minutes=5)
        env.client.listing = [_thread(n, 90) for n in range(100, 105)]
        await env.run()
    assert len(env.client.thread_calls) + len(env.client.visit_calls) == 5
    assert len(env.sleeps) >= 4  # paused between Chollometro pages


async def test_blocked_stops_run_and_keeps_state(env):
    env.client.listing = [_thread(1, 10)]
    await env.run()
    env.clock.now += timedelta(minutes=5)
    env.client.listing = [_thread(2, 90), _thread(3, 90)]
    env.client.block_threads = True
    with pytest.raises(ChollometroBlocked):
        await env.run()
    assert len(env.client.thread_calls) == 1
    assert env.client.visit_calls == []
    assert (await env.thread(2)).state == ThreadState.WATCHING
    assert (await env.thread(3)).state == ThreadState.WATCHING


async def test_blocked_still_publishes_qualified(env):
    _big_budget(env)
    env.client.listing = [_thread(n, 51 + n) for n in range(1, 12)]  # 11 qualify, 10 slots
    await env.run()
    env.clock.now = NOW + timedelta(minutes=61)
    env.client.listing = []
    env.client.block_threads = True
    with pytest.raises(ChollometroBlocked):
        await env.run()
    # The QUALIFIED one would be stale at 61 min: blocked run still ran the publish step.
    assert (await env.thread(1)).skip_reason == "stale"


async def test_image_never_from_chollometro(env):
    env.client.listing = [_thread(1, 60)]
    await env.run()
    assert env.downloads == [STORE_IMAGE]
    assert all("chollometro" not in url for url in env.repo.product_images.values())
    assert env.publisher.calls[0][1] == b"photo"


async def test_store_quote_image_and_lower_price(env):
    env.store.quotes[_asin(1)] = PriceQuote(
        price=Decimal("18"),
        previous_price=Decimal("30"),
        image_url="https://m.media-amazon.com/q.jpg",
    )
    env.client.listing = [_thread(1, 60, price="20", previous="25")]
    await env.run()
    offer = env.pipeline.offers[0][1]
    assert offer.price == Decimal("18")
    assert offer.previous_price == Decimal("30")
    assert offer.image_url == "https://m.media-amazon.com/q.jpg"
    assert env.downloads == ["https://m.media-amazon.com/q.jpg"]


async def test_higher_store_price_without_coupon_is_mismatch(env):
    env.store.quotes[_asin(1)] = PriceQuote(price=Decimal("25"), previous_price=None)
    env.client.listing = [_thread(1, 60, price="20")]
    await env.run()
    tracked = await env.thread(1)
    assert tracked.state == ThreadState.SKIPPED
    assert tracked.skip_reason == OfferStatus.SKIPPED_MISMATCH.value
    assert _published(env) == []


async def test_free_text_voucher_is_a_condition_not_a_coupon(env):
    env.store.quotes[_asin(1)] = PriceQuote(price=Decimal("25"), previous_price=None)
    env.client.listing = [_thread(1, 60, price="20", coupon="Aplicar cupón de 5 €")]
    await env.run()
    offer = env.pipeline.offers[0][1]
    assert offer.price == Decimal("20")
    assert offer.coupon is None
    assert len(_published(env)) == 1


async def test_coupon_and_hashtags_in_offer(env):
    env.client.listing = [
        _thread(
            1, 60, previous="30", coupon="CODIGO10",
            categories=["Electrónica", "Electrónica", "!!"],
        )
    ]
    await env.run()
    offer = env.pipeline.offers[0][1]
    assert offer.coupon == "CODIGO10"
    assert offer.hashtags == ["electrónica", "chollo"]
    assert offer.asin == _asin(1)
    assert offer.store == "amazon"
    assert offer.country == "ES"
    assert offer.title == "Producto 1"
    assert offer.price == Decimal("20")
    assert offer.previous_price == Decimal("30")
    assert offer.canonical_url == offer.product_url == f"https://www.amazon.es/dp/{_asin(1)}"


async def test_qualified_thread_published_later_from_snapshot(env):
    _big_budget(env)
    env.client.listing = [_thread(n, 51 + n) for n in range(1, 12)]  # 11 qualify, 10 slots
    await env.run()
    assert (await env.thread(1)).state == ThreadState.QUALIFIED
    # 29 minutes later the hour window has room again, but the thread left /nuevos.
    env.client.listing = []
    env.clock.now = NOW + timedelta(minutes=29)
    for p in env.repo._publications:
        p["published_at"] = NOW - timedelta(hours=2)
    await env.run()
    assert (await env.thread(1)).state == ThreadState.PUBLISHED
    assert env.pipeline.offers[-1][0] == 1
    assert env.pipeline.offers[-1][1].title == "Producto 1"


async def test_publication_without_id_is_not_watched(env):
    async def no_publication(*args, **kwargs):
        raise RuntimeError("db down")

    env.repo.insert_publication = no_publication
    env.client.listing = [_thread(1, 60)]
    await env.run()
    tracked = await env.thread(1)
    assert tracked.state == ThreadState.PUBLISHED
    assert tracked.publication_id is None
    env.client.listing = [_thread(1, 60, expired=True)]
    env.clock.now += timedelta(minutes=5)
    await env.run()
    assert env.posts.synced == []
    assert env.client.thread_calls == []


def test_snapshot_round_trip():
    thread = _thread(7, 61.5, previous="30.10", discount=33, coupon="X", categories=["A"])
    snapshot = thread_to_snapshot(thread)
    assert json.loads(json.dumps(snapshot)) == snapshot
    assert thread_from_snapshot(snapshot) == thread
    no_price = dataclasses.replace(thread, price=None)
    assert thread_from_snapshot(thread_to_snapshot(no_price)).price is None
