from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    telegram_api_id: int
    telegram_api_hash: str
    telegram_session_path: str = "data/reader.session"
    telegram_bot_token: str
    target_channel: str = "@patobarato"
    supabase_url: str
    supabase_service_key: str
    affiliate_tag: str = "patobarato-21"
    default_country: str = "ES"
    republish_after_days: int = 7
    stale_after_minutes: int = 30
    sources_refresh_seconds: int = 300
    http_timeout_seconds: float = 10.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
