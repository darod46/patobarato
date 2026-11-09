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


def test_awin_merchants_default_and_new_credentials_unset(monkeypatch):
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    settings = Settings(_env_file=None)
    assert settings.awin_merchants == {
        "pccomponentes": None,
        "mediamarkt": None,
        "elcorteingles": None,
    }
    assert settings.aliexpress_app_key is None
    assert settings.aliexpress_app_secret is None
    assert settings.aliexpress_tracking_id is None
    assert settings.awin_publisher_id is None
    assert settings.awin_api_token is None


def test_awin_merchants_parsed_from_json_env(monkeypatch):
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("AWIN_MERCHANTS", '{"pccomponentes": 1234}')
    assert Settings(_env_file=None).awin_merchants == {"pccomponentes": 1234}


def test_invalid_awin_merchants_json_raises_settings_error(monkeypatch):
    from pydantic_settings import SettingsError

    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("AWIN_MERCHANTS", "{bad")
    with pytest.raises(SettingsError, match="awin_merchants"):
        Settings(_env_file=None)


def test_settings_admin_defaults(monkeypatch):
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    for key in ("ADMIN_URL", "WEB_REVALIDATE_URL", "REVALIDATE_SECRET", "ADMIN_JOBS_POLL_SECONDS"):
        monkeypatch.delenv(key, raising=False)
    settings = Settings(_env_file=None)
    assert settings.admin_url is None
    assert settings.web_revalidate_url is None
    assert settings.revalidate_secret is None
    assert settings.admin_jobs_poll_seconds == 3.0
