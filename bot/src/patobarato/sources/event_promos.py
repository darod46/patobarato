"""AliExpress campaign products synced into the ``event_promos`` table."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol

from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource, EventPromoRow, EventRef
from patobarato.storage.repository import Repository
from patobarato.stores.aliexpress_client import AliPromoPage

logger = logging.getLogger("patobarato.event_promos")


class _PromoClient(Protocol):
    async def featured_promo_products(
        self, promo_name: str, page_no: int = 1, page_size: int = 50
    ) -> AliPromoPage: ...


class EventPromosSource:
    """Refreshes each event's AliExpress campaign products, keeping old rows on any failure."""

    type = "event_promos"

    def __init__(
        self,
        client: _PromoClient,
        repo: Repository,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        pause_seconds: float = 1.5,
        max_pages: int = 3,
        page_size: int = 50,
    ) -> None:
        self._client = client
        self._repo = repo
        self._clock = clock
        self._sleep = sleep
        self._pause_seconds = pause_seconds
        self._max_pages = max_pages
        self._page_size = page_size
        self._called = False  # whether this run already made an API call

    async def run(self, source: ApiSource) -> None:
        events = await self._repo.list_events_with_promo()
        if not events:
            logger.info("event_promos: no events with an AliExpress campaign; nothing to sync")
            return
        self._called = False
        failed = 0
        for event in events:
            if not await self._sync_event(event):
                failed += 1
        if failed == len(events):
            # Lets the scheduler record sources.last_error.
            raise RuntimeError(f"event_promos: all {failed} events failed")

    async def _sync_event(self, event: EventRef) -> bool:
        """True when the event's rows were replaced; False when previous rows were kept."""
        rows: list[EventPromoRow] = []
        try:
            for page_no in range(1, self._max_pages + 1):
                if self._called:
                    await self._sleep(self._pause_seconds)
                self._called = True
                page = await self._client.featured_promo_products(
                    event.aliexpress_promo, page_no, self._page_size
                )
                for product in page.products:
                    if product.promotion_link is None:
                        continue  # affiliate_url is required
                    original = product.original_price
                    rows.append(
                        EventPromoRow(
                            external_id=product.product_id,
                            title=product.title,
                            price=product.price,
                            original_price=original if original is not None and original > product.price else None,
                            image_url=product.image_url,
                            affiliate_url=product.promotion_link,
                            position=len(rows) + 1,
                        )
                    )
                if not page.has_more:
                    break
                if page_no == 1 and not rows:
                    break
        except Exception as e:
            logger.error("event_promos: %s kept previous rows — %s: %s", event.slug, type(e).__name__, e)
            return False
        if not rows:
            logger.error("event_promos: %s returned no products; kept previous rows", event.slug)
            return False
        await self._repo.replace_event_promos(event.id, rows)
        return True
