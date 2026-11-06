import asyncio
import logging
from types import SimpleNamespace

import pytest
from telethon.errors import AccessTokenInvalidError, PhoneCodeInvalidError

import patobarato.main as main_module

from patobarato.config import Settings, get_settings
from patobarato.main import EXIT_CONFIG_ERROR, _supervise, login, main, run

REQUIRED = [
    "TELEGRAM_API_ID",
    "TELEGRAM_API_HASH",
    "TELEGRAM_BOT_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY",
]


@pytest.fixture(autouse=True)
def _no_config(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)  # no .env here
    for name in REQUIRED:
        monkeypatch.delenv(name, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_run_without_config_exits_with_clear_error(capsys):
    assert main(["run"]) == EXIT_CONFIG_ERROR

    err = capsys.readouterr().err
    assert "Error de configuración" in err
    for name in REQUIRED:
        assert name in err
    assert "Traceback" not in err


def test_partial_config_names_only_missing_fields(monkeypatch, capsys):
    monkeypatch.setenv("TELEGRAM_API_ID", "1")
    monkeypatch.setenv("TELEGRAM_API_HASH", "hash")

    assert main(["run"]) == EXIT_CONFIG_ERROR

    err = capsys.readouterr().err
    assert "TELEGRAM_BOT_TOKEN" in err
    assert "TELEGRAM_API_ID" not in err


async def _forever(cancelled: list[str], name: str) -> None:
    try:
        await asyncio.Event().wait()
    except asyncio.CancelledError:
        cancelled.append(name)
        raise


async def test_supervise_returns_1_when_a_task_raises(caplog):
    cancelled: list[str] = []

    async def boom() -> None:
        raise RuntimeError("pipeline exploded")

    with caplog.at_level(logging.ERROR, logger="patobarato.main"):
        code = await _supervise(
            pipeline=boom(),
            refresh=_forever(cancelled, "refresh"),
            reader=_forever(cancelled, "reader"),
        )

    assert code == 1
    assert sorted(cancelled) == ["reader", "refresh"]
    [record] = [r for r in caplog.records if r.name == "patobarato.main"]
    assert "pipeline" in record.getMessage()
    assert record.exc_info is not None
    assert "pipeline exploded" in str(record.exc_info[1])


async def test_supervise_returns_1_when_a_task_ends(caplog):
    cancelled: list[str] = []

    async def disconnected() -> None:
        return None

    with caplog.at_level(logging.ERROR, logger="patobarato.main"):
        code = await _supervise(
            pipeline=_forever(cancelled, "pipeline"),
            refresh=_forever(cancelled, "refresh"),
            reader=disconnected(),
        )

    assert code == 1
    assert sorted(cancelled) == ["pipeline", "refresh"]
    messages = [r.getMessage() for r in caplog.records if r.name == "patobarato.main"]
    assert any("reader" in m for m in messages)


class _FailingLoginClient:
    def __init__(self) -> None:
        self.disconnected = False

    async def start(self):
        raise PhoneCodeInvalidError(request=None)

    async def disconnect(self) -> None:
        self.disconnected = True


async def test_login_failure_prints_spanish_message_and_returns_1(monkeypatch, capsys):
    client = _FailingLoginClient()
    monkeypatch.setattr(main_module, "_client", lambda path, settings: client)

    code = await login(SimpleNamespace(telegram_session_path="data/reader.session"))

    assert code == 1
    err = capsys.readouterr().err
    assert "No se pudo iniciar sesión" in err
    assert "Traceback" not in err
    assert client.disconnected


# --- I7: bot connection supervised, bot login failure handled ----------------


class _FakeClient:
    def __init__(self, start_error: Exception | None = None) -> None:
        self.start_error = start_error
        self.disconnected = False
        self.handlers: list = []

    async def connect(self) -> None:
        pass

    async def is_user_authorized(self) -> bool:
        return True

    async def start(self, bot_token=None):
        if self.start_error is not None:
            raise self.start_error
        return self

    async def run_until_disconnected(self) -> None:
        await asyncio.Event().wait()

    def add_event_handler(self, handler, event) -> None:
        self.handlers.append(handler)

    async def disconnect(self) -> None:
        self.disconnected = True


def _run_settings() -> Settings:
    return Settings(
        _env_file=None,
        telegram_api_id=1,
        telegram_api_hash="hash",
        telegram_bot_token="token",
        supabase_url="https://example.supabase.co",
        supabase_service_key="key",
    )


@pytest.fixture
def fake_clients(monkeypatch):
    clients = {"reader": _FakeClient(), "bot": _FakeClient()}

    def make(path, settings):
        return clients["bot"] if path == main_module.BOT_SESSION_PATH else clients["reader"]

    monkeypatch.setattr(main_module, "_client", make)
    monkeypatch.setattr(main_module, "create_client", lambda url, key: object())
    monkeypatch.setattr(main_module, "SupabaseRepository", lambda client: object())
    return clients


async def test_run_supervises_bot_connection(fake_clients, monkeypatch):
    supervised: list[str] = []

    async def fake_supervise(**coros):
        supervised.extend(coros)
        for coro in coros.values():
            coro.close()
        return 1

    monkeypatch.setattr(main_module, "_supervise", fake_supervise)

    assert await run(_run_settings()) == 1

    assert sorted(supervised) == ["bot", "pipeline", "reader", "refresh", "scheduler"]
    assert fake_clients["reader"].disconnected
    assert fake_clients["bot"].disconnected


async def test_run_bot_login_failure_is_reported_in_spanish(fake_clients, capsys):
    fake_clients["bot"].start_error = AccessTokenInvalidError(request=None)

    code = await run(_run_settings())

    assert code == 1
    err = capsys.readouterr().err
    assert "No se pudo iniciar el bot" in err
    assert "TELEGRAM_BOT_TOKEN" in err
    assert "Traceback" not in err
    assert fake_clients["reader"].disconnected
    assert fake_clients["bot"].disconnected


@pytest.mark.parametrize("value", ["", "{bad"])
def test_invalid_awin_merchants_gives_friendly_error(monkeypatch, capsys, value):
    for name in REQUIRED:
        monkeypatch.setenv(name, "1")
    monkeypatch.setenv("AWIN_MERCHANTS", value)

    assert main(["run"]) == EXIT_CONFIG_ERROR

    err = capsys.readouterr().err
    assert "Error de configuración" in err
    assert "awin_merchants" in err.lower()
    assert "Traceback" not in err


async def test_backfill_finder_routes_by_store_and_skips_unknown(caplog):
    class FakeStore:
        id = "awin"

        def canonical_url(self, product_id, country):
            return f"https://shop/{product_id}"

        async def find_image(self, product_id, canonical_url):
            return f"img:{canonical_url}"

    class FakeRegistry:
        def get(self, store_id):
            return FakeStore() if store_id == "awin" else None

    finder = main_module._RegistryBackfillFinder(FakeRegistry())
    assert await finder.find("p1", "ES", "awin") == "img:https://shop/p1"
    with caplog.at_level(logging.WARNING):
        assert await finder.find("p1", "ES", "nope") is None
    assert "nope" in caplog.text


def _ali_settings(**kw) -> Settings:
    return Settings(
        _env_file=None,
        telegram_api_id=1,
        telegram_api_hash="hash",
        telegram_bot_token="token",
        supabase_url="https://example.supabase.co",
        supabase_service_key="key",
        **kw,
    )


def test_build_runners_includes_aliexpress_with_credentials():
    import httpx

    from patobarato.storage.repository import InMemoryRepository
    from patobarato.stores.registry import build_registry

    settings = _ali_settings(
        aliexpress_app_key="k", aliexpress_app_secret="s", aliexpress_tracking_id="t"
    )
    http = httpx.AsyncClient()
    registry = build_registry(settings, http, http)

    runners = main_module.build_runners(registry, InMemoryRepository(), settings, lambda: None)

    assert [r.type for r in runners] == ["aliexpress_api"]


def test_build_runners_is_empty_without_credentials():
    import httpx

    from patobarato.storage.repository import InMemoryRepository
    from patobarato.stores.registry import build_registry

    settings = _ali_settings()
    http = httpx.AsyncClient()
    registry = build_registry(settings, http, http)

    assert main_module.build_runners(registry, InMemoryRepository(), settings, lambda: None) == []
