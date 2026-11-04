import asyncio
import logging
from types import SimpleNamespace

import pytest
from telethon.errors import PhoneCodeInvalidError

import patobarato.main as main_module

from patobarato.config import get_settings
from patobarato.main import EXIT_CONFIG_ERROR, _supervise, login, main

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
