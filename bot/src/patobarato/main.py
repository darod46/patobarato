"""Command-line entrypoint: ``python -m patobarato login|run|backfill-images``."""

import argparse
import asyncio
import logging
import sys
from collections.abc import Callable, Coroutine
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError
from pydantic_settings import SettingsError
from supabase import create_client
from telethon import TelegramClient

from patobarato.config import Settings, get_settings
from patobarato.core.backfill import backfill_images
from patobarato.core.pipeline import Pipeline, utcnow
from patobarato.parsing.links import UrlResolver
from patobarato.publishing.photo_download import download_photo
from patobarato.publishing.telegram_publisher import TelegramPublisher
from patobarato.sources.aliexpress_source import AliExpressSource
from patobarato.sources.api_scheduler import ApiScheduler, ApiSourceRunner
from patobarato.sources.awin_feeds import AwinFeedsSource
from patobarato.sources.awin_source import AwinClient, AwinPromotionsSource
from patobarato.sources.event_promos import EventPromosSource
from patobarato.sources.guide_prices import GuidePriceRefresher
from patobarato.sources.telegram_listener import TelegramListener, make_photo_provider
from patobarato.storage.repository import Repository
from patobarato.storage.supabase_repo import SupabaseRepository
from patobarato.stores.aliexpress import AliExpressStore
from patobarato.stores.registry import StoreRegistry, build_registry

logger = logging.getLogger("patobarato.main")

BOT_SESSION_PATH = "data/bot.session"
LOGIN_FIRST_MESSAGE = "Ejecuta primero: docker compose run --rm bot login"
BOT_START_FAILED_MESSAGE = "No se pudo iniciar el bot (revisa TELEGRAM_BOT_TOKEN)"
EXIT_CONFIG_ERROR = 2


def _client(session_path: str, settings: Settings) -> TelegramClient:
    Path(session_path).parent.mkdir(parents=True, exist_ok=True)
    return TelegramClient(
        session_path, settings.telegram_api_id, settings.telegram_api_hash
    )


async def login(settings: Settings) -> int:
    client = _client(settings.telegram_session_path, settings)
    try:
        await client.start()
        me = await client.get_me()
        print(f"Sesión iniciada como {me.first_name} (id {me.id}).")
        return 0
    except Exception as e:
        logger.debug("Login failed", exc_info=True)
        print(f"No se pudo iniciar sesión: {e}", file=sys.stderr)
        return 1
    finally:
        await client.disconnect()


async def _supervise(**named_coros: Coroutine[Any, Any, Any]) -> int:
    """Runs the coroutines until the first one ends or raises, then stops the rest.

    None of them should ever finish, so any finish is reported as a failure (1).
    """
    tasks = {
        asyncio.create_task(coro, name=name): name for name, coro in named_coros.items()
    }
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    await asyncio.gather(*pending, return_exceptions=True)
    for task in done:
        name = tasks[task]
        if task.cancelled():
            logger.error("Task %s was cancelled; stopping", name)
        elif (exc := task.exception()) is not None:
            logger.error("Task %s failed; stopping", name, exc_info=exc)
        else:
            logger.error("Task %s ended unexpectedly; stopping", name)
    return 1


class _RegistryBackfillFinder:
    """Routes each backfill row to the store it belongs to; unregistered stores are skipped."""

    def __init__(self, registry: StoreRegistry) -> None:
        self._registry = registry

    async def find(
        self, store_product_id: str, country: str, store: str, url: str = ""
    ) -> str | None:
        adapter = self._registry.get(store)
        if adapter is None:
            logger.warning("Backfill skipped %s: store %s is not registered", store_product_id, store)
            return None
        # The stored URL is the real product page; the rebuilt one is only a fallback.
        page_url = url or adapter.canonical_url(store_product_id, country)
        return await adapter.find_image(store_product_id, page_url)


def build_runners(
    registry: StoreRegistry,
    repo: Repository,
    settings: Settings,
    clock: Callable[[], datetime],
    http: httpx.AsyncClient | None = None,
) -> list[ApiSourceRunner]:
    """API source runners available with the configured credentials."""
    runners: list[ApiSourceRunner] = []
    ali_store = registry.get("aliexpress")
    if isinstance(ali_store, AliExpressStore):
        runners.append(AliExpressSource(ali_store.client, repo, settings, clock))
        runners.append(EventPromosSource(ali_store.client, repo, clock))
    # Merchant ids may come from settings or from each source row's config.merchants;
    # the source itself warns and does nothing when it ends up with none.
    if settings.awin_publisher_id and settings.awin_api_token:
        client = AwinClient(
            http or httpx.AsyncClient(timeout=settings.http_timeout_seconds),
            settings.awin_publisher_id,
            settings.awin_api_token,
        )
        runners.append(AwinPromotionsSource(client, repo, settings))
        runners.append(AwinFeedsSource(client, repo, settings, clock))
    runners.append(
        GuidePriceRefresher(registry, repo, clock, delay_seconds=settings.guide_price_delay_seconds)
    )
    return runners


async def run(settings: Settings) -> int:
    reader = _client(settings.telegram_session_path, settings)
    await reader.connect()
    if not await reader.is_user_authorized():
        await reader.disconnect()
        print(LOGIN_FIRST_MESSAGE, file=sys.stderr)
        return 1

    bot = _client(BOT_SESSION_PATH, settings)
    try:
        await bot.start(bot_token=settings.telegram_bot_token)
    except Exception as e:
        logger.debug("Bot login failed", exc_info=True)
        print(f"{BOT_START_FAILED_MESSAGE}: {e}", file=sys.stderr)
        await bot.disconnect()
        await reader.disconnect()
        return 1

    async with (
        httpx.AsyncClient(timeout=settings.http_timeout_seconds) as http,
        httpx.AsyncClient(timeout=settings.http_timeout_seconds) as amazon_http,
    ):
        resolver = UrlResolver(http)
        repo = SupabaseRepository(
            create_client(settings.supabase_url, settings.supabase_service_key)
        )
        publisher = TelegramPublisher(bot, settings.target_channel)
        registry = build_registry(settings, http, amazon_http)
        pipeline = Pipeline(
            repo,
            resolver,
            publisher,
            make_photo_provider(reader, resolver),
            settings,
            registry=registry,
            image_downloader=lambda url: download_photo(http, url),
        )
        scheduler = ApiScheduler(repo, build_runners(registry, repo, settings, utcnow, http))
        listener = TelegramListener(
            reader,
            repo,
            pipeline,
            target=settings.target_channel,
            refresh_seconds=settings.sources_refresh_seconds,
            country=settings.default_country,
        )
        await listener.start()
        logger.info("PatoBarato en marcha; publicando en %s", settings.target_channel)
        try:
            return await _supervise(
                pipeline=pipeline.run(),
                scheduler=scheduler.run(),
                refresh=listener.run_refresh_loop(),
                reader=reader.run_until_disconnected(),
                bot=bot.run_until_disconnected(),
            )
        finally:
            await reader.disconnect()
            await bot.disconnect()


async def backfill(settings: Settings) -> int:
    repo = SupabaseRepository(
        create_client(settings.supabase_url, settings.supabase_service_key)
    )
    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as http:
        found, missing = await backfill_images(
            repo, _RegistryBackfillFinder(build_registry(settings, http, http))
        )
    print(f"Imágenes encontradas: {found}. Sin imagen: {missing}.")
    return 0


def _config_error_message(error: ValidationError) -> str:
    missing = [
        ".".join(str(part) for part in err["loc"]).upper()
        for err in error.errors()
        if err["type"] == "missing"
    ]
    invalid = [
        ".".join(str(part) for part in err["loc"]).upper()
        for err in error.errors()
        if err["type"] != "missing"
    ]
    lines = ["Error de configuración (revisa el fichero .env o las variables de entorno)."]
    if missing:
        lines.append("Faltan: " + ", ".join(missing))
    if invalid:
        lines.append("No válidos: " + ", ".join(invalid))
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="patobarato")
    parser.add_argument("command", choices=["login", "run", "backfill-images"])
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stdout,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    try:
        settings = get_settings()
    except ValidationError as e:
        print(_config_error_message(e), file=sys.stderr)
        return EXIT_CONFIG_ERROR
    except SettingsError as e:
        print(
            "Error de configuración (revisa el fichero .env o las variables de entorno).\n"
            f"No válidos: {e}",
            file=sys.stderr,
        )
        return EXIT_CONFIG_ERROR

    if args.command == "login":
        return asyncio.run(login(settings))
    if args.command == "backfill-images":
        return asyncio.run(backfill(settings))
    try:
        return asyncio.run(run(settings))
    except KeyboardInterrupt:
        logger.info("Detenido")
        return 0
