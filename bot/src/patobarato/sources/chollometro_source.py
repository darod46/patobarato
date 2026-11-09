"""Deal source reading chollometro.com: follows threads, publishes the hot ones and ends them.

One run, with a shared budget of Chollometro pages (thread pages and /visit/ links):

1. Read /nuevos; record new threads of registered stores and refresh the watched ones.
2. Published threads the listing shows as expired are ended (no page needed).
3. Published threads not in the listing are checked on their page, oldest check first.
4. Watched threads that left the listing are re-read, hottest first, while they can warm up.
5. Watched threads that qualify have their /visit/ link resolved, once: QUALIFIED or SKIPPED.
6. Ending an offer: publication ``ended``, Telegram post edited, website revalidated.
7. QUALIFIED threads are published, best first, while the hourly cap has room.

When Chollometro blocks us, no more pages are requested; step 7 still runs and the
error is raised at the end so the scheduler records it.
"""

import asyncio
import dataclasses
import json
import logging
import unicodedata
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import TypeVar

from patobarato.admin.posts import PostService
from patobarato.admin.revalidate import WebRevalidator
from patobarato.config import Settings
from patobarato.core.pipeline import Pipeline
from patobarato.models import (
    ApiSource,
    ChollometroThread,
    OfferStatus,
    ParsedOffer,
    PriceQuote,
    PublicationStatus,
    ThreadState,
    TrackedThread,
)
from patobarato.parsing.extract import StoreLink, resolve_store_link
from patobarato.parsing.links import UrlResolver
from patobarato.publishing.format import normalize_hashtag
from patobarato.sources.chollometro_client import ChollometroBlocked, ChollometroClient
from patobarato.sources.chollometro_rules import discount_of, qualifies, rank_key, reconcile_price
from patobarato.storage.repository import Repository
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.chollometro")

DEFAULT_CONFIG: dict[str, float] = {
    "min_temperature": 50,
    "min_discount": 40,
    "max_per_hour": 10,
    "warm_hours": 24,
    "max_pages_per_run": 5,
}
# Pause between two Chollometro pages of one run.
PAGE_DELAY_SECONDS = 2.0
STORE_PRICE_TIMEOUT_SECONDS = 5.0
# A longer voucher, or one with spaces, is a condition ("Aplicar cupón de 5 €"), not a code.
MAX_COUPON_CODE_LENGTH = 30
CAP_WINDOW = timedelta(minutes=60)

_T = TypeVar("_T")


def thread_to_snapshot(t: ChollometroThread) -> dict:
    """The thread as JSON-safe data (stored in ``TrackedThread.snapshot``)."""
    data = dataclasses.asdict(t)
    data["price"] = None if t.price is None else str(t.price)
    data["previous_price"] = None if t.previous_price is None else str(t.previous_price)
    data["published_at"] = t.published_at.isoformat()
    return data


def thread_from_snapshot(data: dict) -> ChollometroThread:
    def decimal(value: str | None) -> Decimal | None:
        return None if value is None else Decimal(value)

    return ChollometroThread(
        **{
            **data,
            "price": decimal(data["price"]),
            "previous_price": decimal(data["previous_price"]),
            "categories": list(data["categories"]),
            "published_at": datetime.fromisoformat(data["published_at"]),
        }
    )


def _key(name: str) -> str:
    """Comparable store name: no case, accents, spaces or punctuation."""
    decomposed = unicodedata.normalize("NFKD", name.casefold())
    return "".join(c for c in decomposed if c.isalnum())


def _ended(t: ChollometroThread) -> bool:
    return t.expired or t.sold_out


def _coupon_code(voucher: str | None) -> str | None:
    if not voucher or len(voucher) > MAX_COUPON_CODE_LENGTH or any(c.isspace() for c in voucher):
        return None
    return voucher


@dataclass(frozen=True)
class _Config:
    min_temperature: float
    min_discount: int
    max_per_hour: int
    warm_hours: float
    max_pages_per_run: int

    @classmethod
    def of(cls, config: dict) -> "_Config":
        def value(key: str) -> float:
            raw = config.get(key)
            return DEFAULT_CONFIG[key] if raw is None else raw

        return cls(
            min_temperature=float(value("min_temperature")),
            min_discount=int(value("min_discount")),
            max_per_hour=int(value("max_per_hour")),
            warm_hours=float(value("warm_hours")),
            max_pages_per_run=int(value("max_pages_per_run")),
        )


@dataclass
class _Run:
    source: ApiSource
    config: _Config
    now: datetime
    pages: int = 0
    listed: set[int] = field(default_factory=set)
    links: dict[int, StoreLink] = field(default_factory=dict)  # resolved during this run
    ended: int = 0
    published: int = 0

    def has_budget(self) -> bool:
        return self.pages < self.config.max_pages_per_run


class ChollometroSource:
    type = "chollometro"

    def __init__(
        self,
        client: ChollometroClient,
        resolver: UrlResolver,
        registry: StoreRegistry,
        repo: Repository,
        pipeline: Pipeline,
        posts: PostService,
        revalidator: WebRevalidator,
        settings: Settings,
        clock: Callable[[], datetime],
        *,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        page_delay_seconds: float = PAGE_DELAY_SECONDS,
    ) -> None:
        self._client = client
        self._resolver = resolver
        self._registry = registry
        self._repo = repo
        self._pipeline = pipeline
        self._posts = posts
        self._revalidator = revalidator
        self._settings = settings
        self._clock = clock
        self._sleep = sleep
        self._page_delay = page_delay_seconds

    async def run(self, source: ApiSource) -> None:
        run = _Run(source, _Config.of(source.config), self._clock())
        blocked: ChollometroBlocked | None = None
        try:
            try:
                await self._read_listing(run)
                await self._watch_publications(run)
                await self._rewarm(run)
                await self._resolve_qualifying(run)
            except ChollometroBlocked as exc:
                logger.warning("Chollometro blocked us (%s): no more pages this run", exc)
                blocked = exc
            await self._publish_qualified(run)
        finally:
            if run.ended:
                await self._revalidate()
        logger.info(
            "Chollometro: %s listed, %s pages, %s published, %s ended",
            len(run.listed),
            run.pages,
            run.published,
            run.ended,
        )
        if blocked is not None:
            raise blocked

    # Steps 1-2 ------------------------------------------------------------

    async def _read_listing(self, run: _Run) -> None:
        stores = {
            _key(text)
            for store in map(self._registry.get, self._registry.ids)
            if store is not None
            for text in (store.name, store.id)
        }
        listing = [
            t
            for t in await self._client.fetch_new()
            if t.merchant and _key(t.merchant) in stores
        ]
        run.listed = {t.thread_id for t in listing}
        tracked = await self._repo.get_tracked_threads(run.source.id, list(run.listed))
        for thread in listing:
            known = tracked.get(thread.thread_id)
            if known is None:
                await self._save(self._observed(self._new(run, thread), thread, run.now))
            elif known.state == ThreadState.WATCHING:
                await self._save(self._observed(known, thread, run.now))
            elif known.state == ThreadState.QUALIFIED and _ended(thread):
                await self._save(self._skipped(known, "expired"))
            elif known.state == ThreadState.PUBLISHED:
                if _ended(thread):
                    await self._end(run, known, thread)
                else:
                    await self._save(self._checked(known, thread, run.now))

    def _new(self, run: _Run, thread: ChollometroThread) -> TrackedThread:
        return TrackedThread(
            source_id=run.source.id,
            thread_id=thread.thread_id,
            url=thread.url,
            state=ThreadState.WATCHING,
            temperature=thread.temperature,
            discount=discount_of(thread),
            first_seen_at=run.now,
            published_at=thread.published_at,
            qualified_at=None,
            store_url=None,
            publication_id=None,
            last_checked_at=None,
        )

    @staticmethod
    def _checked(t: TrackedThread, thread: ChollometroThread, now: datetime) -> TrackedThread:
        return replace(
            t,
            temperature=thread.temperature,
            discount=discount_of(thread),
            last_checked_at=now,
            snapshot=thread_to_snapshot(thread),
        )

    def _observed(
        self, t: TrackedThread, thread: ChollometroThread, now: datetime
    ) -> TrackedThread:
        """A watched thread with fresh data; an expired one is dropped."""
        checked = self._checked(t, thread, now)
        return self._skipped(checked, "expired") if _ended(thread) else checked

    # Step 3 ---------------------------------------------------------------

    async def _watch_publications(self, run: _Run) -> None:
        window = timedelta(days=self._settings.republish_after_days)
        due: list[TrackedThread] = []
        for t in await self._repo.list_tracked_threads(run.source.id, [ThreadState.PUBLISHED]):
            if run.now - (t.qualified_at or t.first_seen_at) > window:
                await self._save(replace(t, state=ThreadState.ENDED))  # post left as it is
            elif t.publication_id is not None and t.thread_id not in run.listed:
                due.append(t)
        due.sort(key=lambda t: t.last_checked_at or datetime.min.replace(tzinfo=UTC))
        for t in due:
            if not run.has_budget():
                return
            _, thread = await self._fetch_thread(run, t)
            if thread is not None and _ended(thread):
                await self._end(run, t, thread)
            elif thread is not None:
                await self._save(self._checked(t, thread, run.now))
            else:
                await self._save(replace(t, last_checked_at=run.now))

    # Step 4 ---------------------------------------------------------------

    async def _rewarm(self, run: _Run) -> None:
        warm = timedelta(hours=run.config.warm_hours)
        due: list[TrackedThread] = []
        for t in await self._repo.list_tracked_threads(run.source.id, [ThreadState.WATCHING]):
            if t.thread_id in run.listed:
                continue
            if run.now - t.published_at > warm:
                await self._save(self._skipped(t, "cold"))
            elif not self._qualifies(run, t):  # those that qualify go to step 5 as they are
                due.append(t)
        due.sort(key=lambda t: -t.temperature)
        for t in due:
            if not run.has_budget():
                return
            ok, thread = await self._fetch_thread(run, t)
            if thread is not None:
                await self._save(self._observed(t, thread, run.now))
            elif ok:
                await self._save(self._skipped(t, "not_found"))
            else:
                await self._save(replace(t, last_checked_at=run.now))

    # Step 5 ---------------------------------------------------------------

    async def _resolve_qualifying(self, run: _Run) -> None:
        watching = await self._repo.list_tracked_threads(run.source.id, [ThreadState.WATCHING])
        candidates = sorted(
            (t for t in watching if self._qualifies(run, t)),
            key=lambda t: rank_key(t.temperature, t.discount),
        )
        for t in candidates:
            visit_url = thread_from_snapshot(t.snapshot).visit_url
            if visit_url is None:
                await self._save(self._skipped(t, "unknown_store"))
                continue
            if not run.has_budget():
                continue
            store_url = await self._page(run, lambda: self._client.resolve_visit(visit_url))
            link = await self._store_link(store_url) if store_url else None
            if link is None:
                logger.info(
                    "Chollometro thread %s: no registered store at %s", t.thread_id, store_url
                )
                await self._save(self._skipped(replace(t, store_url=store_url), "unknown_store"))
                continue
            run.links[t.thread_id] = link
            await self._save(
                replace(t, state=ThreadState.QUALIFIED, qualified_at=run.now, store_url=store_url)
            )

    # Step 6 ---------------------------------------------------------------

    async def _end(self, run: _Run, t: TrackedThread, thread: ChollometroThread) -> None:
        ended = replace(self._checked(t, thread, run.now), state=ThreadState.ENDED)
        publication_id = t.publication_id
        if publication_id is None:  # nothing was recorded to edit
            await self._save(ended)
            return
        try:
            await self._repo.set_publication_status(publication_id, PublicationStatus.ENDED)
        except Exception as exc:
            logger.error(
                "Could not end publication %s: %s: %s", publication_id, type(exc).__name__, exc
            )
            return  # still PUBLISHED: retried on a later run
        try:
            await self._posts.sync_post(publication_id)
        except Exception as exc:
            logger.error(
                "Could not edit the post of publication %s: %s: %s",
                publication_id,
                type(exc).__name__,
                exc,
            )
        await self._save(ended)
        run.ended += 1
        logger.info("Chollometro thread %s ended: publication %s", t.thread_id, publication_id)

    async def _revalidate(self) -> None:
        try:
            await self._revalidator.revalidate()
        except Exception as exc:
            logger.error("Could not revalidate the website: %s: %s", type(exc).__name__, exc)

    # Step 7 ---------------------------------------------------------------

    async def _publish_qualified(self, run: _Run) -> None:
        stale_after = timedelta(minutes=self._settings.stale_after_minutes)
        pending: list[TrackedThread] = []
        for t in await self._repo.list_tracked_threads(run.source.id, [ThreadState.QUALIFIED]):
            if t.qualified_at is None or run.now - t.qualified_at > stale_after:
                await self._save(self._skipped(t, "stale"))
            else:
                pending.append(t)
        if not pending:
            return
        used = await self._repo.count_publications_since(run.source.id, run.now - CAP_WINDOW)
        slots = run.config.max_per_hour - used
        for t in sorted(pending, key=lambda t: rank_key(t.temperature, t.discount)):
            if slots <= 0:
                return
            if await self._publish(run, t):
                slots -= 1

    async def _publish(self, run: _Run, t: TrackedThread) -> bool:
        assert t.qualified_at is not None
        thread = thread_from_snapshot(t.snapshot)
        link = run.links.get(t.thread_id)
        if link is None and t.store_url:
            link = await self._store_link(t.store_url)
        if link is None:
            await self._save(self._skipped(t, "unknown_store"))
            return False
        offer = await self._offer(run.source, thread, link)
        if offer is None:
            await self._save(self._skipped(t, OfferStatus.SKIPPED_MISMATCH.value))
            return False
        result = await self._pipeline.process_offer(
            run.source.id,
            t.thread_id,
            offer,
            raw_text=json.dumps(t.snapshot, ensure_ascii=False),
            detected_at=t.qualified_at,
        )
        if result.status != OfferStatus.PUBLISHED:
            await self._save(self._skipped(t, result.status.value))
            return False
        if result.publication_id is None:
            logger.warning(
                "Chollometro thread %s published without a stored publication: "
                "its end will not be tracked",
                t.thread_id,
            )
        await self._save(
            replace(
                t,
                state=ThreadState.PUBLISHED,
                publication_id=result.publication_id,
                last_checked_at=run.now,
            )
        )
        run.published += 1
        return True

    async def _offer(
        self, source: ApiSource, thread: ChollometroThread, link: StoreLink
    ) -> ParsedOffer | None:
        """The offer to publish, or None when the store's price contradicts the deal."""
        categories = [normalize_hashtag(c) for c in thread.categories]
        offer = ParsedOffer(
            asin=link.product_id,
            country=link.country,
            store=link.store.id,
            title=thread.title,
            price=None,
            previous_price=None,
            coupon=_coupon_code(thread.coupon),
            hashtags=list(dict.fromkeys([*filter(None, categories), *source.hashtags])),
            canonical_url=link.canonical,
            product_url=link.canonical,
        )
        if thread.price is None:
            return offer  # the pipeline takes the store's price
        quote = await self._quote(link)
        # Any voucher text counts as a condition explaining a higher store price.
        reconciled = reconcile_price(thread.price, thread.coupon, quote)
        if reconciled is None:
            logger.info(
                "Chollometro thread %s: store price %s above %s — skipped",
                thread.thread_id,
                quote.price if quote else None,
                thread.price,
            )
            return None
        price, store_previous = reconciled
        previous = store_previous if store_previous is not None else thread.previous_price
        return replace(
            offer,
            price=price,
            previous_price=previous if previous is not None and previous > price else None,
            image_url=quote.image_url if quote is not None else None,
        )

    # Helpers --------------------------------------------------------------

    def _qualifies(self, run: _Run, t: TrackedThread) -> bool:
        if not t.snapshot:
            return False
        thread = thread_from_snapshot(t.snapshot)
        return qualifies(thread, run.config.min_temperature, run.config.min_discount)

    async def _page(self, run: _Run, request: Callable[[], Awaitable[_T]]) -> _T:
        """One Chollometro page from the run's budget, paced."""
        if run.pages:
            await self._sleep(self._page_delay)
        run.pages += 1
        return await request()

    async def _fetch_thread(
        self, run: _Run, t: TrackedThread
    ) -> tuple[bool, ChollometroThread | None]:
        """``(read, thread)``: read is False when the page could not be fetched."""
        try:
            thread = await self._page(run, lambda: self._client.fetch_thread(t.url))
        except ChollometroBlocked:
            raise
        except Exception as exc:
            logger.warning(
                "Chollometro thread %s could not be read: %s: %s",
                t.thread_id,
                type(exc).__name__,
                exc,
            )
            return False, None
        return True, thread

    async def _store_link(self, url: str) -> StoreLink | None:
        try:
            return await resolve_store_link(url, self._resolver, self._registry)
        except Exception as exc:
            logger.warning("Store link of %s failed: %s: %s", url, type(exc).__name__, exc)
            return None

    async def _quote(self, link: StoreLink) -> PriceQuote | None:
        try:
            return await asyncio.wait_for(
                link.store.fetch_price(link.product_id, link.canonical),
                STORE_PRICE_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            logger.warning(
                "Store price for %s %s failed: %s: %s",
                link.store.id,
                link.product_id,
                type(exc).__name__,
                exc,
            )
            return None

    @staticmethod
    def _skipped(t: TrackedThread, reason: str) -> TrackedThread:
        return replace(t, state=ThreadState.SKIPPED, skip_reason=reason)

    async def _save(self, t: TrackedThread) -> None:
        await self._repo.save_tracked_thread(t)
