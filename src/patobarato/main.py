"""Command-line entrypoint: ``python -m patobarato login|run``."""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

import httpx
from pydantic import ValidationError
from supabase import create_client
from telethon import TelegramClient

from patobarato.config import Settings, get_settings
from patobarato.core.pipeline import Pipeline
from patobarato.parsing.links import UrlResolver
from patobarato.publishing.telegram_publisher import TelegramPublisher
from patobarato.sources.telegram_listener import TelegramListener, make_photo_provider
from patobarato.storage.supabase_repo import SupabaseRepository

logger = logging.getLogger("patobarato.main")

BOT_SESSION_PATH = "data/bot.session"
LOGIN_FIRST_MESSAGE = "Ejecuta primero: docker compose run --rm bot login"
EXIT_CONFIG_ERROR = 2


def _client(session_path: str, settings: Settings) -> TelegramClient:
    Path(session_path).parent.mkdir(parents=True, exist_ok=True)
    return TelegramClient(
        session_path, settings.telegram_api_id, settings.telegram_api_hash
    )


async def login(settings: Settings) -> None:
    client = _client(settings.telegram_session_path, settings)
    await client.start()
    try:
        me = await client.get_me()
        print(f"Sesión iniciada como {me.first_name} (id {me.id}).")
    finally:
        await client.disconnect()


async def run(settings: Settings) -> int:
    reader = _client(settings.telegram_session_path, settings)
    await reader.connect()
    if not await reader.is_user_authorized():
        await reader.disconnect()
        print(LOGIN_FIRST_MESSAGE, file=sys.stderr)
        return 1

    bot = _client(BOT_SESSION_PATH, settings)
    await bot.start(bot_token=settings.telegram_bot_token)

    async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as http:
        resolver = UrlResolver(http)
        repo = SupabaseRepository(
            create_client(settings.supabase_url, settings.supabase_service_key)
        )
        publisher = TelegramPublisher(bot, settings.target_channel)
        pipeline = Pipeline(
            repo, resolver, publisher, make_photo_provider(reader, resolver), settings
        )
        listener = TelegramListener(
            reader, repo, pipeline, settings.sources_refresh_seconds
        )
        await listener.start()
        logger.info("PatoBarato en marcha; publicando en %s", settings.target_channel)
        try:
            await asyncio.gather(
                pipeline.run(),
                listener.run_refresh_loop(),
                reader.run_until_disconnected(),
            )
        finally:
            await reader.disconnect()
            await bot.disconnect()
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
    parser.add_argument("command", choices=["login", "run"])
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

    if args.command == "login":
        asyncio.run(login(settings))
        return 0
    try:
        return asyncio.run(run(settings))
    except KeyboardInterrupt:
        logger.info("Detenido")
        return 0
