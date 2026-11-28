"""Runner ``price_alerts``: re-reads the tracked products' prices and tells their followers about drops."""

import asyncio
import html
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from decimal import Decimal

from patobarato.alerts.service import STORE_NAMES, _title
from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource, ProductToCheck
from patobarato.publishing.format import discount_percent, format_price, priced_at_line
from patobarato.publishing.web_links import deal_url
from patobarato.storage.repository import Repository
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.price_alerts")

CHECK_EVERY = timedelta(hours=12)
DEFAULT_BATCH = 30
# Pause between store requests, so Amazon does not see a burst.
DEFAULT_DELAY_SECONDS = 20.0


class UserBlocked(Exception):
    """The user blocked the bot: no more notices for them."""


# (chat_id, text) -> None; raises UserBlocked when Telegram says so.
Sender = Callable[[int, str], Awaitable[None]]


def drop_message(product: ProductToCheck, before: Decimal, now_price: Decimal, at: datetime, page: str | None) -> str:
    pct = discount_percent(now_price, before)
    lines = [
        "📉 <b>¡Ha bajado de precio!</b>",
        "",
        html.escape(_title(product.title)),
        f"Antes <s>{format_price(before)} €</s> → ahora <b>{format_price(now_price)} €</b>"
        + (f" (-{pct} %)" if pct > 0 else "")
        + f" en {STORE_NAMES.get(product.store, product.store)}",
        priced_at_line(at),
    ]
    if page:
        lines += ["", f"👉 {page}"]
    return "\n".join(lines)


class PriceAlertChecker:
    type = "price_alerts"

    def __init__(
        self,
        repo: Repository,
        registry: StoreRegistry,
        send: Sender,
        site_url: str,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._repo = repo
        self._registry = registry
        self._send = send
        self._site_url = site_url
        self._clock = clock
        self._sleep = sleep

    async def run(self, source: ApiSource) -> None:
        cfg = source.config
        hours = float(cfg.get("every_hours", CHECK_EVERY.total_seconds() / 3600))
        batch = int(cfg.get("batch", DEFAULT_BATCH))
        delay = float(cfg.get("delay_seconds", DEFAULT_DELAY_SECONDS))
        due = await self._repo.products_to_check(self._clock() - timedelta(hours=hours), batch)
        notices = 0
        for index, product in enumerate(due):
            if index:
                await self._sleep(delay)
            try:
                notices += await self._check(product)
            except Exception as e:
                logger.error("PriceAlerts: product %d failed: %s: %s", product.product_id, type(e).__name__, e)
        if due:
            logger.info("PriceAlerts: %d products checked, %d notices", len(due), notices)

    async def _check(self, product: ProductToCheck) -> int:
        store = self._registry.get(product.store)
        if store is None:
            return 0
        canonical = store.canonical_url(product.asin, product.country)
        now = self._clock()
        quote = await store.fetch_price(product.asin, canonical)
        if quote is None or quote.price is None or quote.price <= 0:
            reason = getattr(store, "last_failure", None) or "no price"
            await self._repo.upsert_product_price(
                product.product_id, checked_at=now, error=f"PriceAlerts: {reason}"[:200]
            )
            return 0
        await self._repo.upsert_product_price(
            product.product_id,
            checked_at=now,
            price=quote.price,
            previous_price=quote.previous_price,
            affiliate_url=product.affiliate_url,
        )
        page = deal_url(self._site_url, product.store, product.asin, product.slug) if product.slug else None
        sent = 0
        for alert in await self._repo.alerts_for_product(product.product_id):
            if quote.price >= alert.baseline_price:
                continue
            try:
                await self._send(alert.chat_id, drop_message(product, alert.baseline_price, quote.price, now, page))
            except UserBlocked:
                await self._repo.mark_alert_user_blocked(alert.telegram_id, now)
                continue
            await self._repo.set_alert_notified(alert.alert_id, quote.price, now)
            sent += 1
        return sent
