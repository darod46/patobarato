"""Ends active Amazon deals whose current price went above the published one."""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from telethon.errors import MessageIdInvalidError

from patobarato.admin.posts import PostError
from patobarato.core.pipeline import utcnow
from patobarato.models import DealToCheck, PriceQuote
from patobarato.sources.amazon_page import is_block
from patobarato.storage.repository import Repository
from patobarato.stores.base import Store
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.deal_check")

STORE = "amazon"
COUNTRY = "ES"
DEFAULT_DELAY_SECONDS = 1.5
BLOCKED_STREAK_LIMIT = 2
# PostError raised by sync_post when the post's channel no longer resolves.
_CHANNEL_GONE = "No se encuentra el canal"
_URL = re.compile(r"https?://\S+")


class PostSyncer(Protocol):
    async def sync_post(self, publication_id: int) -> dict: ...


def _is_permanent(error: Exception) -> bool:
    """An edit failure that retrying never fixes (old channel, deleted message)."""
    if isinstance(error, MessageIdInvalidError):
        return True
    return isinstance(error, PostError) and str(error).startswith(_CHANNEL_GONE)


def _n(value: int) -> str:
    return f"{value:,}".replace(",", ".")


@dataclass
class CheckSummary:
    checked: int = 0
    ended: int = 0
    kept: int = 0
    unknown: int = 0
    failed: int = 0
    stale_ended: int = 0
    posts_edited: int = 0
    edit_failed: int = 0
    posts_pending: int = 0
    stopped_blocked: bool = False
    dry_run: bool = False
    max_age_days: int = 30

    def format(self) -> str:
        checked = (
            f"Comprobadas {_n(self.checked)}: {_n(self.ended)} caducadas, "
            f"{_n(self.kept)} siguen, {_n(self.unknown)} sin precio"
        )
        if self.failed:
            checked += f", {_n(self.failed)} sin leer"
        lines = [
            checked + ".",
            f"Caducadas por antigüedad (>{self.max_age_days} días): {_n(self.stale_ended)}.",
        ]
        if self.dry_run:
            lines.insert(0, "Simulación: no se ha escrito nada ni editado ningún post.")
        else:
            lines.append(
                f"Posts editados: {_n(self.posts_edited)} ({_n(self.edit_failed)} fallos)."
            )
            if self.posts_pending:
                lines.append(f"Pendientes de editar: {_n(self.posts_pending)}.")
        if self.stopped_blocked:
            lines.append(
                "Amazon ha bloqueado dos peticiones seguidas; parada. "
                "Vuelve a lanzarlo más tarde."
            )
        return "\n".join(lines)


class DealChecker:
    def __init__(
        self,
        registry: StoreRegistry,
        repo: Repository,
        posts: PostSyncer,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        delay_seconds: float = DEFAULT_DELAY_SECONDS,
        max_age_days: int = 30,
        recheck_hours: int = 48,
        limit: int = 600,
        edit_limit: int = 100,
    ) -> None:
        self._registry = registry
        self._repo = repo
        self._posts = posts
        self._clock = clock
        self._sleep = sleep
        self._delay = delay_seconds
        self._max_age_days = max_age_days
        self._recheck_hours = recheck_hours
        self._limit = limit
        self._edit_limit = edit_limit
        self._requested = False

    async def run(self, dry_run: bool = False) -> CheckSummary:
        summary = CheckSummary(dry_run=dry_run, max_age_days=self._max_age_days)
        self._requested = False
        now = self._clock()
        if dry_run:
            stale = await self._repo.list_stale_deals(now, self._max_age_days)
        else:
            stale = await self._repo.end_stale_deals(now, self._max_age_days)
        summary.stale_ended = len(stale)

        failed_edits: set[int] = set()
        store = self._registry.get(STORE)
        if store is None:
            logger.warning("DealCheck: store %s not enabled, no deals checked", STORE)
        else:
            deals = await self._repo.list_deals_to_check(
                now, self._max_age_days, self._recheck_hours, self._limit
            )
            failed_edits = await self._check_deals(store, deals, summary)
        if not dry_run:
            await self._edit_ended_posts(summary, failed_edits)
        logger.info("DealCheck: %s", summary.format().replace("\n", " "))
        return summary

    async def _check_deals(
        self, store: Store, deals: list[DealToCheck], summary: CheckSummary
    ) -> set[int]:
        failed_edits: set[int] = set()
        blocked_streak = 0
        for deal in deals:
            await self._pause()
            summary.checked += 1
            quote, reason = await self._fetch(store, deal)
            now = self._clock()
            if quote is not None:
                blocked_streak = 0
                if quote.price > deal.published_price:
                    outcome = "ended"
                    summary.ended += 1
                    if not summary.dry_run:
                        await self._repo.end_publication(deal.publication_id, now)
                        if not await self._sync(deal.publication_id, summary):
                            failed_edits.add(deal.publication_id)
                else:
                    outcome = "kept"
                    summary.kept += 1
                    if not summary.dry_run:
                        await self._repo.mark_checked(deal.publication_id, now)
            elif reason is None or reason.startswith("no price"):
                # The page was read but shows no price (no buy box, out of stock).
                blocked_streak = 0
                outcome = "unknown"
                summary.unknown += 1
                if not summary.dry_run:
                    await self._repo.mark_checked(deal.publication_id, now)
            else:
                outcome = f"failed ({reason})"
                summary.failed += 1
                blocked_streak = blocked_streak + 1 if is_block(reason) else 0
            logger.info(
                "DealCheck: amazon %s published %s now %s -> %s",
                deal.asin,
                deal.published_price,
                quote.price if quote is not None else None,
                outcome,
            )
            if blocked_streak >= BLOCKED_STREAK_LIMIT:
                summary.stopped_blocked = True
                logger.warning(
                    "DealCheck: Amazon blocked %d requests in a row, stopping", blocked_streak
                )
                break
        return failed_edits

    async def _fetch(
        self, store: Store, deal: DealToCheck
    ) -> tuple[PriceQuote | None, str | None]:
        try:
            try:
                canonical = store.canonical_for(deal.url, COUNTRY)
            except ValueError:
                canonical = store.canonical_url(deal.asin, COUNTRY)
            quote = await store.fetch_price(deal.asin, canonical)
        except Exception as e:
            # No traceback: HTTP errors may carry a request URL.
            return None, f"{type(e).__name__}: {_URL.sub('<url>', str(e))}"
        if quote is not None:
            return quote, None
        return None, getattr(store, "last_failure", None)

    async def _edit_ended_posts(self, summary: CheckSummary, failed_edits: set[int]) -> None:
        # Posts whose edit already failed in this run are left for the next one.
        pending = [
            publication_id
            for publication_id in await self._repo.list_ended_posts_to_edit(
                self._edit_limit + len(failed_edits)
            )
            if publication_id not in failed_edits
        ]
        for publication_id in pending[: self._edit_limit]:
            await self._pause()
            await self._sync(publication_id, summary)
        summary.posts_pending = await self._repo.count_ended_posts_to_edit()

    async def _sync(self, publication_id: int, summary: CheckSummary) -> bool:
        """Edits the post; a failure is counted and logged, never raised."""
        try:
            result = await self._posts.sync_post(publication_id)
        except Exception as e:
            summary.edit_failed += 1
            permanent = _is_permanent(e)
            logger.warning(
                "DealCheck: post of publication %d not edited%s: %s: %s",
                publication_id,
                " (will not be retried)" if permanent else "",
                type(e).__name__,
                _URL.sub("<url>", str(e)),
            )
            if permanent:
                # Leaves the edit queue: the post's channel or message is gone.
                await self._repo.mark_post_synced(publication_id, self._clock())
            return False
        if result.get("edited"):
            summary.posts_edited += 1
        return True

    async def _pause(self) -> None:
        """Sleeps between network requests (Amazon reads and Telegram edits)."""
        if self._requested:
            await self._sleep(self._delay)
        self._requested = True
