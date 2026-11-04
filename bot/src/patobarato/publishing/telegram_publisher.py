"""Publishes offers to a Telegram channel through a bot-authenticated Telethon client."""

import asyncio
import io
import logging

from telethon import Button, TelegramClient, utils
from telethon.errors import FloodWaitError, RPCError, ServerError

from patobarato.publishing.format import BUTTON_TEXT

logger = logging.getLogger("patobarato.telegram_publisher")

_PHOTO_NAME = "photo.jpg"


def _is_transient(exc: BaseException) -> bool:
    """Connection-level or server-side (5xx) errors worth retrying.

    Bad-request style RPC errors (e.g. ChatWriteForbiddenError) are not.
    """
    if isinstance(exc, ConnectionError | OSError | asyncio.TimeoutError | ServerError):
        return True
    return isinstance(exc, RPCError) and exc.code == 500


class TelegramPublisher:
    def __init__(
        self,
        client: TelegramClient,
        target: str,
        max_retries: int = 3,
        base_delay: float = 2.0,
    ) -> None:
        self._client = client
        self._target = target
        self._max_retries = max_retries
        self._base_delay = base_delay

    async def publish(
        self, caption: str, button_url: str, photo: bytes | None
    ) -> tuple[int, int]:
        attempt = 0
        while True:
            try:
                msg = await self._send(caption, button_url, photo)
                return utils.get_peer_id(msg.peer_id), msg.id
            except FloodWaitError as e:
                if attempt >= self._max_retries:
                    raise
                logger.warning("Flood wait of %ss (attempt %d)", e.seconds, attempt + 1)
                await asyncio.sleep(e.seconds)
            except Exception as e:
                if not _is_transient(e) or attempt >= self._max_retries:
                    raise
                delay = self._base_delay * 2**attempt
                logger.warning("Transient error %r, retrying in %ss", e, delay)
                await asyncio.sleep(delay)
            attempt += 1

    async def _send(self, caption: str, button_url: str, photo: bytes | None):
        buttons = [Button.url(BUTTON_TEXT, button_url)]
        if photo is None:
            return await self._client.send_message(
                self._target,
                caption,
                parse_mode="html",
                buttons=buttons,
                link_preview=False,
            )
        # Fresh buffer per attempt; the name makes Telethon treat it as a photo.
        buffer = io.BytesIO(photo)
        buffer.name = _PHOTO_NAME
        return await self._client.send_file(
            self._target, buffer, caption=caption, parse_mode="html", buttons=buttons
        )
