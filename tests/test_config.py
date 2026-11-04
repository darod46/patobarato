import pytest
from pydantic import ValidationError

from patobarato.config import Settings

REQUIRED_ENV = {
    "TELEGRAM_API_ID": "12345",
    "TELEGRAM_API_HASH": "hash",
    "TELEGRAM_BOT_TOKEN": "token",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_SERVICE_KEY": "key",
}


def test_settings_defaults_and_env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_API_ID", "12345")
    monkeypatch.setenv("TELEGRAM_API_HASH", "hash")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "key")

    settings = Settings(_env_file=None)

    assert settings.affiliate_tag == "patobarato-21"
    assert settings.default_country == "ES"
    assert settings.republish_after_days == 7
    assert settings.stale_after_minutes == 30
    assert isinstance(settings.telegram_api_id, int)
    assert settings.telegram_api_id == 12345


@pytest.mark.parametrize(
    "name",
    [
        "AFFILIATE_TAG",
        "TARGET_CHANNEL",
        "TELEGRAM_API_HASH",
        "TELEGRAM_BOT_TOKEN",
        "SUPABASE_URL",
        "SUPABASE_SERVICE_KEY",
    ],
)
def test_empty_values_rejected(monkeypatch, name):
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv(name, "")

    with pytest.raises(ValidationError) as info:
        Settings(_env_file=None)

    assert [err["loc"] for err in info.value.errors()] == [(name.lower(),)]
