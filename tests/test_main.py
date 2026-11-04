import pytest

from patobarato.config import get_settings
from patobarato.main import EXIT_CONFIG_ERROR, main

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
