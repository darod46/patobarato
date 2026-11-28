"""@patobaratobot: price-drop alerts for Amazon and AliExpress products, one conversation per user.

The user sends a product link and the bot starts following it (up to ``MAX_ALERTS`` products), creates the
product on the web if needed and answers with its page. ``/lista`` shows the list and ``/borrar N`` removes
one. The prices are re-read by the ``price_alerts`` runner (checker.py), which sends the notices.
"""

import html
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from patobarato.core.pipeline import utcnow
from patobarato.models import ParsedOffer, TrackedProduct
from patobarato.parsing.extract import _store_links
from patobarato.parsing.links import UrlResolver
from patobarato.parsing.text import URL_RE
from patobarato.publishing.format import format_price, priced_at_line
from patobarato.publishing.web_links import deal_url
from patobarato.storage.repository import Repository
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.alerts")

MAX_ALERTS = 10
SUPPORTED_STORES = ("amazon", "aliexpress")
COUNTRY = "ES"
STORE_NAMES = {"amazon": "Amazon", "aliexpress": "AliExpress"}

WELCOME = (
    "🦆 <b>Alertas de precio de PatoBarato</b>\n\n"
    "Envíame el enlace de un producto de <b>Amazon</b> o <b>AliExpress</b> y te aviso cuando baje de precio.\n\n"
    f"Puedes seguir hasta {MAX_ALERTS} productos:\n"
    "• Envía un enlace para añadirlo.\n"
    "• /lista para ver tus productos.\n"
    "• /borrar 2 para quitar el producto número 2.\n"
    "• /ayuda para ver este mensaje."
)
NOT_UNDERSTOOD = "No te he entendido. Envíame el enlace de un producto de Amazon o AliExpress, o usa /lista o /ayuda."
UNSUPPORTED = "Ese enlace no es de un producto de Amazon España ni de AliExpress. Copia el enlace desde la página del producto."
NO_PRICE = "Ahora mismo no puedo leer el precio de ese producto. Prueba de nuevo dentro de un rato."
FAILED = "Algo ha fallado al añadir el producto. Prueba de nuevo dentro de un rato."

_BORRAR_RE = re.compile(r"^/?(?:borrar|eliminar|quitar)(?:@\w+)?\s+(\d+)\s*$", re.IGNORECASE)
_COMMAND_RE = re.compile(r"^/(\w+)(?:@\w+)?\s*$")


@dataclass(frozen=True)
class AlertUser:
    telegram_id: int
    chat_id: int
    username: str | None = None
    first_name: str | None = None


def _title(text: str, limit: int = 90) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


class AlertService:
    def __init__(
        self,
        repo: Repository,
        registry: StoreRegistry,
        resolver: UrlResolver,
        site_url: str,
        clock: Callable[[], datetime] = utcnow,
        max_alerts: int = MAX_ALERTS,
    ) -> None:
        self._repo = repo
        self._registry = registry
        self._resolver = resolver
        self._site_url = site_url
        self._clock = clock
        self._max = max_alerts

    def page_url(self, store: str, asin: str, slug: str | None) -> str | None:
        return deal_url(self._site_url, store, asin, slug) if slug else None

    async def handle(self, user: AlertUser, text: str) -> str:
        """The bot's answer (Telegram HTML) to one private message."""
        await self._repo.upsert_alert_user(user.telegram_id, user.chat_id, user.username, user.first_name)
        text = (text or "").strip()
        if match := _BORRAR_RE.match(text):
            return await self._remove(user, int(match.group(1)))
        command = _COMMAND_RE.match(text)
        name = command.group(1).lower() if command else text.lower()
        if name in ("start", "ayuda", "help"):
            return WELCOME
        if name in ("lista", "list", "mis productos"):
            return await self._list(user)
        if name in ("borrar", "eliminar", "quitar"):
            return "Indica el número del producto, por ejemplo: /borrar 2. Lo ves en /lista."
        urls = URL_RE.findall(text)
        if not urls:
            return NOT_UNDERSTOOD
        try:
            return await self._add(user, urls)
        except Exception as e:
            logger.error("Alerts: adding a product failed: %s: %s", type(e).__name__, e)
            return FAILED

    async def _add(self, user: AlertUser, urls: list[str]) -> str:
        links = [
            link
            for link in await _store_links(urls, self._resolver, self._registry)
            if link.store.id in SUPPORTED_STORES and link.country == COUNTRY
        ]
        if not links:
            return UNSUPPORTED
        link = links[0]
        alerts = await self._repo.list_user_alerts(user.telegram_id)
        product_id = await self._repo.find_product_id(link.store.id, COUNTRY, link.product_id)
        if product_id is not None and any(a.product_id == product_id for a in alerts):
            return "Ya sigues ese producto. Míralo en /lista."
        if len(alerts) >= self._max:
            return (
                f"Ya sigues {self._max} productos, el máximo. Quita alguno con /borrar y vuelve a enviarme "
                "el enlace."
            )
        fetch = getattr(link.store, "fetch_listing", link.store.fetch_price)
        quote = await fetch(link.product_id, link.canonical)
        if quote is None or quote.price is None or quote.price <= 0:
            return NO_PRICE
        now = self._clock()
        if product_id is None:
            if not quote.title:
                return NO_PRICE
            product_id = await self._repo.upsert_product(
                ParsedOffer(
                    asin=link.product_id,
                    country=COUNTRY,
                    store=link.store.id,
                    title=_title(quote.title, 300),
                    price=quote.price,
                    previous_price=None,
                    coupon=None,
                    hashtags=[],
                    canonical_url=link.canonical,
                    product_url=link.canonical,
                )
            )
            if quote.image_url:
                await self._repo.set_product_image(product_id, quote.image_url)
        try:
            affiliate = await link.store.affiliate_url(link.canonical, link.product_id)
        except Exception as e:
            logger.warning("Alerts: no affiliate link for %s: %s", link.product_id, type(e).__name__)
            affiliate = None
        await self._repo.upsert_product_price(
            product_id,
            checked_at=now,
            price=quote.price,
            previous_price=quote.previous_price,
            affiliate_url=affiliate,
        )
        if not await self._repo.add_price_alert(user.telegram_id, product_id, quote.price):
            return "Ya sigues ese producto. Míralo en /lista."
        alerts = await self._repo.list_user_alerts(user.telegram_id)
        added = next((a for a in alerts if a.product_id == product_id), None)
        title = added.title if added else (quote.title or "")
        slug = await self._repo.get_product_slug(product_id)
        page = self.page_url(link.store.id, link.product_id, slug)
        lines = [
            f"✅ <b>Añadido a tu lista</b> ({len(alerts)}/{self._max})",
            "",
            html.escape(_title(title)),
            f"💶 Precio ahora: <b>{format_price(quote.price)} €</b> en {STORE_NAMES[link.store.id]}",
            priced_at_line(now),
            "",
            "Te aviso en cuanto baje de precio.",
        ]
        if page:
            lines += ["", f"👉 {page}"]
        return "\n".join(lines)

    async def _list(self, user: AlertUser) -> str:
        alerts = await self._repo.list_user_alerts(user.telegram_id)
        if not alerts:
            return "Aún no sigues ningún producto. Envíame el enlace de uno de Amazon o AliExpress."
        lines = [f"📋 <b>Tus productos</b> ({len(alerts)}/{self._max})", ""]
        for number, alert in enumerate(alerts, start=1):
            lines.append(f"<b>{number}.</b> {html.escape(_title(alert.title, 70))}")
            lines.append(f"    {_price_text(alert)} · {STORE_NAMES.get(alert.store, alert.store)}")
            page = self.page_url(alert.store, alert.asin, alert.slug)
            if page:
                lines.append(f"    {page}")
        lines += ["", "Para quitar uno: /borrar y su número, por ejemplo /borrar 1."]
        return "\n".join(lines)

    async def _remove(self, user: AlertUser, number: int) -> str:
        alerts = await self._repo.list_user_alerts(user.telegram_id)
        if not 1 <= number <= len(alerts):
            return f"No tienes ningún producto con el número {number}. Mira los números en /lista."
        alert = alerts[number - 1]
        await self._repo.delete_price_alert(user.telegram_id, alert.alert_id)
        return f"🗑️ Quitado: {html.escape(_title(alert.title, 70))}. Ya no te avisaré de su precio."


def _price_text(alert: TrackedProduct) -> str:
    price: Decimal | None = alert.price
    return f"{format_price(price)} €" if price is not None else "precio pendiente"
