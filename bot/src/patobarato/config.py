from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    telegram_api_id: int
    telegram_api_hash: str = Field(min_length=1)
    telegram_bot_token: str = Field(min_length=1)
    target_channel: str = Field(default="@patobarato", min_length=1)
    supabase_url: str = Field(min_length=1)
    supabase_service_key: str = Field(min_length=1)
    affiliate_tag: str = Field(default="patobarato-21", min_length=1)
    default_country: str = "ES"
    republish_after_days: int = 7
    stale_after_minutes: int = 30
    http_timeout_seconds: float = 10.0
    guide_price_delay_seconds: float = 1.5
    aliexpress_app_key: str | None = None
    aliexpress_app_secret: str | None = None
    aliexpress_tracking_id: str | None = None
    awin_publisher_id: str | None = None
    awin_api_token: str | None = None
    admin_url: str | None = None
    web_revalidate_url: str | None = None
    revalidate_secret: str | None = None
    admin_jobs_poll_seconds: float = 3.0
    # JSON in env: {"pccomponentes": 1234}. A null/missing mid still publishes plain links.
    awin_merchants: dict[str, int | None] = Field(
        default_factory=lambda: {"pccomponentes": None, "mediamarkt": None, "elcorteingles": None}
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
