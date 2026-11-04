"""Reads new messages from the source channels with the reader (user) account."""

import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from datetime import datetime

from telethon import errors, events, functions, types, utils

from patobarato.core.pipeline import Pipeline, PhotoProvider, utcnow
from patobarato.models import Source, SourceMessage
from patobarato.parsing.links import UrlResolver, asin_from_url
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.listener")

JOIN_INTERVAL_SECONDS = 30.0
_NUMERIC_ID = re.compile(r"-?\d+")

PreviewPhoto = Callable[[], Awaitable[bytes | None]]


def _webpage(media) -> types.WebPage | None:
    if isinstance(media, types.MessageMediaWebPage) and isinstance(
        media.webpage, types.WebPage
    ):
        return media.webpage
    return None


def _webpage_photo(media) -> types.Photo | None:
    webpage = _webpage(media)
    if webpage is not None and isinstance(webpage.photo, types.Photo):
        return webpage.photo
    return None


def to_source_message(
    message: types.Message,
    source_id: int,
    now: datetime,
    preview_photo: PreviewPhoto | None,
) -> SourceMessage:
    text = message.message or ""
    entities = message.entities or []
    urls: list[str] = []
    hashtags: list[str] = []

    # get_inner_text slices with Telegram's UTF-16 offsets.
    for entity, inner in zip(entities, utils.get_inner_text(text, entities)):
        if isinstance(entity, types.MessageEntityUrl):
            urls.append(inner)
        elif isinstance(entity, types.MessageEntityTextUrl):
            urls.append(entity.url)
        elif isinstance(entity, types.MessageEntityHashtag):
            hashtags.append(inner.lstrip("#").lower())

    # Telethon 1.45 layer: a URL button is KeyboardInlineButton(type=InlineButtonTypeUrl).
    markup = message.reply_markup
    for row in getattr(markup, "rows", None) or []:
        for button in row.buttons:
            button_type = getattr(button, "type", None)
            if isinstance(button_type, types.InlineButtonTypeUrl) and button_type.url:
                urls.append(button_type.url)

    webpage = _webpage(message.media)
    preview_url = webpage.url if webpage is not None and webpage.url else None
    if preview_url:
        urls.append(preview_url)

    return SourceMessage(
        source_id=source_id,
        message_id=message.id,
        text=text,
        urls=list(dict.fromkeys(urls)),
        hashtags=list(dict.fromkeys(hashtags)),
        received_at=now,
        preview_photo=preview_photo,
        preview_url=preview_url,
    )


def _preview_photo_loader(client, message: types.Message) -> PreviewPhoto | None:
    photo = _webpage_photo(message.media)
    if photo is None:
        return None

    async def load() -> bytes | None:
        return await client.download_media(photo, bytes)

    return load


def make_photo_provider(reader_client, resolver: UrlResolver) -> PhotoProvider:
    """Builds the photo lookup: source preview if same ASIN, else Telegram's own preview.

    Amazon pages are never fetched directly; Telegram builds the preview.
    """

    async def provide(msg: SourceMessage, canonical_url: str) -> bytes | None:
        if msg.preview_photo is not None and msg.preview_url:
            resolved = await resolver.resolve(msg.preview_url)
            wanted = asin_from_url(canonical_url)
            if resolved is not None and wanted and asin_from_url(resolved) == wanted:
                return await msg.preview_photo()

        result = await reader_client(
            functions.messages.GetWebPagePreviewRequest(message=canonical_url)
        )
        # Telethon 1.45 returns messages.WebPagePreview(media=...); older layers
        # returned the MessageMedia itself.
        media = getattr(result, "media", result)
        photo = _webpage_photo(media)
        if photo is None:
            return None
        return await reader_client.download_media(photo, bytes)

    return provide


class TelegramListener:
    def __init__(
        self,
        client,
        repo: Repository,
        pipeline: Pipeline,
        refresh_seconds: float,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._client = client
        self._repo = repo
        self._pipeline = pipeline
        self._refresh_seconds = refresh_seconds
        self._clock = clock
        self._sources: dict[int, Source] = {}
        self._last_join: float | None = None

    async def start(self) -> None:
        self._client.add_event_handler(self._on_new_message, events.NewMessage())

    async def _on_new_message(self, event) -> None:
        try:
            source = self._sources.get(event.chat_id)
            if source is None:
                return
            message = event.message
            msg = to_source_message(
                message,
                source.id,
                self._clock(),
                _preview_photo_loader(self._client, message),
            )
            await self._pipeline.submit(msg)
        except Exception:
            logger.exception("Failed to handle message from chat %s", event.chat_id)

    async def run_refresh_loop(self) -> None:
        while True:
            try:
                await self.refresh_sources()
            except Exception:
                logger.exception("Failed to refresh sources")
            await asyncio.sleep(self._refresh_seconds)

    async def refresh_sources(self) -> None:
        sources = await self._repo.get_active_sources()
        mapping: dict[int, Source] = {}
        for source in sources:
            try:
                entity = await self._resolve(source)
            except Exception:
                logger.exception(
                    "Could not resolve source %s (%s); skipping",
                    source.id,
                    source.identifier,
                )
                continue
            mapping[utils.get_peer_id(entity)] = source
        self._sources = mapping
        logger.info("Listening to %d of %d sources", len(mapping), len(sources))

    async def _resolve(self, source: Source):
        identifier = source.identifier.strip()
        target = int(identifier) if _NUMERIC_ID.fullmatch(identifier) else identifier
        try:
            entity = await self._client.get_entity(target)
        except (ValueError, errors.RPCError):
            if not source.invite_link:
                raise
            return await self._join_by_invite(source.invite_link)
        if getattr(entity, "left", False):
            if source.invite_link:
                return await self._join_by_invite(source.invite_link)
            await self._join(functions.channels.JoinChannelRequest(entity))
        return entity

    async def _join_by_invite(self, invite_link: str):
        invite_hash, is_invite = utils.parse_username(invite_link)
        if not is_invite or not invite_hash:
            raise ValueError(f"Not an invite link: {invite_link!r}")
        try:
            updates = await self._join(
                functions.messages.ImportChatInviteRequest(invite_hash)
            )
            return updates.chats[0]
        except errors.UserAlreadyParticipantError:
            invite = await self._client(
                functions.messages.CheckChatInviteRequest(invite_hash)
            )
            return invite.chat

    async def _join(self, request):
        """Sends a join request, spacing joins and honouring flood waits."""
        while True:
            if self._last_join is not None:
                wait = JOIN_INTERVAL_SECONDS - (time.monotonic() - self._last_join)
                if wait > 0:
                    await asyncio.sleep(wait)
            try:
                return await self._client(request)
            except errors.FloodWaitError as e:
                logger.warning("Flood wait of %ss while joining", e.seconds)
                await asyncio.sleep(e.seconds)
            finally:
                self._last_join = time.monotonic()
