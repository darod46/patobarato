"""Publishes offers to a Telegram channel through a bot-authenticated Telethon client."""

import asyncio
import io
import logging
from collections.abc import Awaitable, Callable

from telethon import TelegramClient, utils
from telethon.errors import (
    FloodWaitError,
    MessageNotModifiedError,
    RPCError,
    ServerError,
)


logger = logging.getLogger("patobarato.telegram_publisher")

_PHOTO_NAME = "photo.jpg"


def _is_transient(exc: BaseException) -> bool:
    """Connection-level or server-side (5xx) errors worth retrying.

    Bad-request style RPC errors (e.g. ChatWriteForbiddenError) are not.
    """
    if isinstance(exc, ConnectionError | OSError | asyncio.TimeoutError | ServerError):
        return True
    return isinstance(exc, RPCError) and exc.code == 500


def can_retry_without_photo(exc: BaseException) -> bool:
    """A publish error that a post without photo may avoid (e.g. a photo Telegram rejects).

    Transient and flood-wait errors would hit the text-only post just the same.
    """
    return not isinstance(exc, FloodWaitError) and not _is_transient(exc)


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

    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]:
        async def attempt() -> tuple[int, int]:
            msg = await self._send(caption, photo)
            return utils.get_peer_id(msg.peer_id), msg.id

        return await self._with_retries(attempt)

    async def edit(self, chat_id: int, message_id: int, caption: str) -> None:
        """Edit a published message (the caption, for a photo post)."""

        async def attempt() -> None:
            async def edit_in(entity: int | str) -> None:
                await self._client.edit_message(
                    entity,
                    message_id,
                    caption,
                    parse_mode="html",
                    link_preview=False,
                )

            try:
                try:
                    await edit_in(chat_id)
                except ValueError:
                    # A restarted session may not have the channel cached: use the target.
                    logger.info("Chat %s not resolvable, editing via target", chat_id)
                    await edit_in(self._target)
            except MessageNotModifiedError:
                logger.info("Message %s unchanged, nothing to edit", message_id)

        await self._with_retries(attempt)

    async def _with_retries[T](self, fn: Callable[[], Awaitable[T]]) -> T:
        attempt = 0
        while True:
            try:
                return await fn()
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

    async def _send(self, caption: str, photo: bytes | None):
        if photo is None:
            return await self._client.send_message(
                self._target,
                caption,
                parse_mode="html",
                link_preview=False,
            )
        # Fresh buffer per attempt; the name makes Telethon treat it as a photo.
        buffer = io.BytesIO(photo)
        buffer.name = _PHOTO_NAME
        return await self._client.send_file(
            self._target, buffer, caption=caption, parse_mode="html"
        )
