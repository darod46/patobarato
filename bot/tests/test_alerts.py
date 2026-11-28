from datetime import UTC, datetime, timedelta
from decimal import Decimal

from patobarato.alerts.checker import PriceAlertChecker, UserBlocked
from patobarato.alerts.service import MAX_ALERTS, NO_PRICE, UNSUPPORTED, AlertService, AlertUser
from patobarato.models import ApiSource, PriceQuote
from patobarato.parsing.links import asin_from_url, canonical_url, is_amazon_url
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.registry import StoreRegistry

NOW = datetime(2026, 11, 28, 10, 0, tzinfo=UTC)
SITE = "https://www.patobarato.com"
USER = AlertUser(telegram_id=7, chat_id=7, username="ana", first_name="Ana")


class FakeAmazon:
    id = "amazon"
    name = "Amazon"

    def __init__(self) -> None:
        self.prices: dict[str, Decimal | None] = {}
        self.titles: dict[str, str] = {}
        self.fetches: list[str] = []
        self.last_failure = None

    def matches(self, url: str) -> bool:
        return is_amazon_url(url)

    def product_id(self, url: str) -> str | None:
        return asin_from_url(url)

    def canonical_url(self, product_id: str, country: str) -> str:
        return canonical_url(product_id, country)

    def canonical_for(self, url: str, country: str) -> str:
        return canonical_url(asin_from_url(url), country)

    async def affiliate_url(self, canonical: str, product_id: str) -> str:
        return f"{canonical}?tag=patobarato-21"

    async def fetch_price(self, product_id: str, canonical: str) -> PriceQuote | None:
        self.fetches.append(product_id)
        price = self.prices.get(product_id)
        return None if price is None else PriceQuote(price=price, previous_price=None)

    async def fetch_listing(self, product_id: str, canonical: str) -> PriceQuote | None:
        price = self.prices.get(product_id)
        if price is None:
            return None
        return PriceQuote(price=price, previous_price=None, title=self.titles.get(product_id, "Producto"))


class FakeResolver:
    def __init__(self, redirects: dict[str, str] | None = None) -> None:
        self.redirects = redirects or {}

    async def resolve(self, url, is_final):
        url = url if url.startswith("http") else "https://" + url
        url = self.redirects.get(url, url)
        return url if is_final(url) else None


def _setup(redirects=None):
    repo = InMemoryRepository()
    store = FakeAmazon()
    service = AlertService(repo, StoreRegistry([store]), FakeResolver(redirects), SITE, lambda: NOW)
    return repo, store, service


def _asin(n: int) -> str:
    return f"B0TEST{n:04d}"


async def test_help_and_unknown_text():
    _repo, _store, service = _setup()
    assert "Alertas de precio" in await service.handle(USER, "/start")
    assert "/borrar 2" in await service.handle(USER, "/ayuda")
    assert "No te he entendido" in await service.handle(USER, "hola")


async def test_adding_a_link_creates_the_product_price_and_alert_and_answers_with_the_web_page():
    repo, store, service = _setup()
    store.prices[_asin(1)] = Decimal("49.99")
    store.titles[_asin(1)] = "Freidora de aire Cosori 5,5 L"
    reply = await service.handle(USER, f"Mira esto https://www.amazon.es/dp/{_asin(1)}?ref=x")
    assert "Añadido a tu lista</b> (1/10)" in reply
    assert "Freidora de aire Cosori 5,5 L" in reply
    assert "49,99 €" in reply and "Precio y disponibilidad a las 11:00 del 28/11" in reply
    product_id = await repo.find_product_id("amazon", "ES", _asin(1))
    slug = repo.product_slugs[product_id]
    assert f"{SITE}/oferta/amazon/{slug}-{_asin(1).lower()}" in reply
    assert repo.prices[product_id]["affiliate_url"].endswith("?tag=patobarato-21")
    assert repo.alert_users[7]["username"] == "ana"
    [alert] = repo.price_alerts.values()
    assert (alert["product_id"], alert["baseline_price"]) == (product_id, Decimal("49.99"))


async def test_short_links_are_resolved():
    repo, store, service = _setup({"https://amzn.to/abc": f"https://www.amazon.es/dp/{_asin(2)}"})
    store.prices[_asin(2)] = Decimal("10")
    assert "Añadido" in await service.handle(USER, "amzn.to/abc")


async def test_unsupported_links_missing_prices_and_duplicates():
    repo, store, service = _setup()
    assert await service.handle(USER, "https://www.pccomponentes.com/algo") == UNSUPPORTED
    assert await service.handle(USER, f"https://www.amazon.com/dp/{_asin(3)}") == UNSUPPORTED
    assert await service.handle(USER, f"https://www.amazon.es/dp/{_asin(3)}") == NO_PRICE
    assert repo.price_alerts == {}
    store.prices[_asin(3)] = Decimal("5")
    await service.handle(USER, f"https://www.amazon.es/dp/{_asin(3)}")
    assert "Ya sigues ese producto" in await service.handle(USER, f"https://www.amazon.es/dp/{_asin(3)}")
    assert len(repo.price_alerts) == 1


async def test_the_list_is_limited_to_ten_products():
    repo, store, service = _setup()
    for n in range(MAX_ALERTS):
        store.prices[_asin(n)] = Decimal("5")
        await service.handle(USER, f"https://www.amazon.es/dp/{_asin(n)}")
    store.prices[_asin(99)] = Decimal("5")
    reply = await service.handle(USER, f"https://www.amazon.es/dp/{_asin(99)}")
    assert "Ya sigues 10 productos, el máximo" in reply
    assert len(repo.price_alerts) == MAX_ALERTS
    assert _asin(99) not in store.fetches


async def test_list_and_remove():
    repo, store, service = _setup()
    assert "Aún no sigues ningún producto" in await service.handle(USER, "/lista")
    for n, title in ((1, "Uno"), (2, "Dos")):
        store.prices[_asin(n)] = Decimal("12.5")
        store.titles[_asin(n)] = title
        await service.handle(USER, f"https://www.amazon.es/dp/{_asin(n)}")
    listing = await service.handle(USER, "/lista")
    assert "Tus productos</b> (2/10)" in listing
    assert "<b>1.</b> Uno" in listing and "<b>2.</b> Dos" in listing and "12,50 €" in listing
    assert "No tienes ningún producto con el número 5" in await service.handle(USER, "/borrar 5")
    assert "Quitado: Uno" in await service.handle(USER, "/borrar 1")
    assert "<b>1.</b> Dos" in await service.handle(USER, "/lista")
    assert "Quitado: Dos" in await service.handle(USER, "borrar 1")
    assert repo.price_alerts == {}


async def test_titles_are_escaped():
    _repo, store, service = _setup()
    store.prices[_asin(1)] = Decimal("3")
    store.titles[_asin(1)] = "Cable <USB> & más"
    assert "Cable &lt;USB&gt; &amp; más" in await service.handle(USER, f"https://www.amazon.es/dp/{_asin(1)}")


# --- checker ---


def _source(**config) -> ApiSource:
    return ApiSource(1, "price_alerts", "patobaratobot", "ES", config, 60, [], None)


async def _tracked(price="50"):
    repo, store, service = _setup()
    store.prices[_asin(1)] = Decimal(price)
    store.titles[_asin(1)] = "Freidora"
    await service.handle(USER, f"https://www.amazon.es/dp/{_asin(1)}")
    other = AlertUser(telegram_id=8, chat_id=8)
    await service.handle(other, f"https://www.amazon.es/dp/{_asin(1)}")
    return repo, store


async def _no_sleep(_):
    return None


async def test_checker_notifies_every_follower_once_per_drop():
    repo, store = await _tracked("50")
    sent: list[tuple[int, str]] = []

    async def send(chat_id, text):
        sent.append((chat_id, text))

    later = NOW + timedelta(hours=13)
    checker = PriceAlertChecker(repo, StoreRegistry([store]), send, SITE, lambda: later, _no_sleep)
    store.prices[_asin(1)] = Decimal("39.99")
    await checker.run(_source())
    assert [c for c, _ in sent] == [7, 8]
    text = sent[0][1]
    assert "Ha bajado de precio" in text and "<s>50,00 €</s>" in text and "<b>39,99 €</b> (-20 %)" in text
    assert "/oferta/amazon/" in text
    product_id = next(iter(repo.price_alerts.values()))["product_id"]
    assert repo.prices[product_id]["price"] == Decimal("39.99")
    assert repo.prices[product_id]["affiliate_url"].endswith("?tag=patobarato-21")
    # Same price at the next check: nothing new. A rise neither.
    sent.clear()
    checker2 = PriceAlertChecker(repo, StoreRegistry([store]), send, SITE, lambda: later + timedelta(hours=13), _no_sleep)
    await checker2.run(_source())
    store.prices[_asin(1)] = Decimal("45")
    checker3 = PriceAlertChecker(repo, StoreRegistry([store]), send, SITE, lambda: later + timedelta(hours=26), _no_sleep)
    await checker3.run(_source())
    assert sent == []


async def test_checker_only_checks_products_due_and_keeps_old_price_on_failure():
    repo, store = await _tracked("50")
    sent = []

    async def send(chat_id, text):
        sent.append(chat_id)

    store.fetches.clear()
    soon = PriceAlertChecker(repo, StoreRegistry([store]), send, SITE, lambda: NOW + timedelta(hours=2), _no_sleep)
    await soon.run(_source())
    assert store.fetches == []  # checked when added, 2 h ago
    store.prices[_asin(1)] = None
    later = PriceAlertChecker(repo, StoreRegistry([store]), send, SITE, lambda: NOW + timedelta(hours=13), _no_sleep)
    await later.run(_source())
    product_id = next(iter(repo.price_alerts.values()))["product_id"]
    assert repo.prices[product_id]["price"] == Decimal("50")
    assert repo.prices[product_id]["error"].startswith("PriceAlerts:")
    assert sent == []


async def test_checker_marks_users_who_blocked_the_bot_and_stops_notifying_them():
    repo, store = await _tracked("50")

    async def send(chat_id, text):
        if chat_id == 7:
            raise UserBlocked("blocked")

    later = NOW + timedelta(hours=13)
    store.prices[_asin(1)] = Decimal("40")
    await PriceAlertChecker(repo, StoreRegistry([store]), send, SITE, lambda: later, _no_sleep).run(_source())
    assert repo.alert_users[7]["blocked_at"] == later
    product_id = next(iter(repo.price_alerts.values()))["product_id"]
    assert [a.telegram_id for a in await repo.alerts_for_product(product_id)] == [8]
