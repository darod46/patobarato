"""Ends active Amazon deals whose current price went above the published one.

No Telegram here: the ended deals' posts are edited by the server bot's
``ended_posts`` runner (see ``sources/ended_posts.py``).
"""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

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
BLOCKED_STREAK_LIMIT = 4
BLOCK_BACKOFF_SECONDS = 20.0
_URL = re.compile(r"https?://\S+")


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
            lines.insert(0, "Simulación: no se ha escrito nada.")
        else:
            lines.append(
                f"Posts pendientes de editar en el servidor: {_n(self.posts_pending)}."
            )
        if self.stopped_blocked:
            lines.append(
                "Amazon ha bloqueado cuatro peticiones seguidas; parada. "
                "Vuelve a lanzarlo más tarde."
            )
        return "\n".join(lines)


class DealChecker:
    def __init__(
        self,
        registry: StoreRegistry,
        repo: Repository,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        delay_seconds: float = DEFAULT_DELAY_SECONDS,
        max_age_days: int = 30,
        recheck_hours: int = 48,
        limit: int = 600,
    ) -> None:
        self._registry = registry
        self._repo = repo
        self._clock = clock
        self._sleep = sleep
        self._delay = delay_seconds
        self._max_age_days = max_age_days
        self._recheck_hours = recheck_hours
        self._limit = limit
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

        store = self._registry.get(STORE)
        if store is None:
            logger.warning("DealCheck: store %s not enabled, no deals checked", STORE)
        else:
            deals = await self._repo.list_deals_to_check(
                now, self._max_age_days, self._recheck_hours, self._limit
            )
            await self._check_deals(store, deals, summary)
        if not dry_run:
            # Includes deals ended by earlier runs that the server bot has not edited yet.
            summary.posts_pending = await self._repo.count_ended_posts_to_edit()
        logger.info("DealCheck: %s", summary.format().replace("\n", " "))
        return summary

    async def _check_deals(
        self, store: Store, deals: list[DealToCheck], summary: CheckSummary
    ) -> None:
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
            if blocked_streak:
                # Amazon serves the odd generic page; a longer pause usually clears it.
                await self._sleep(BLOCK_BACKOFF_SECONDS)

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

    async def _pause(self) -> None:
        """Sleeps between Amazon requests."""
        if self._requested:
            await self._sleep(self._delay)
        self._requested = True
