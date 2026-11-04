from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    telegram_api_id: int
    telegram_api_hash: str = Field(min_length=1)
    telegram_session_path: str = "data/reader.session"
    telegram_bot_token: str = Field(min_length=1)
    target_channel: str = Field(default="@patobarato", min_length=1)
    supabase_url: str = Field(min_length=1)
    supabase_service_key: str = Field(min_length=1)
    affiliate_tag: str = Field(default="patobarato-21", min_length=1)
    default_country: str = "ES"
    republish_after_days: int = 7
    stale_after_minutes: int = 30
    sources_refresh_seconds: int = 300
    http_timeout_seconds: float = 10.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
