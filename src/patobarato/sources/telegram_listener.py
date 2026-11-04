"""Reads new messages from the source channels with the reader (user) account."""

import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from telethon import errors, events, functions, helpers, types, utils

from patobarato.core.pipeline import Pipeline, PhotoProvider, utcnow
from patobarato.models import Source, SourceMessage
from patobarato.parsing.links import UrlResolver, asin_from_url
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.listener")

JOIN_INTERVAL_SECONDS = 30.0
# Longer flood waits are not slept inside a refresh; the source is retried later.
MAX_FLOOD_SLEEP_SECONDS = 60
# A join request awaiting admin approval is not resent before this.
INVITE_PENDING_BACKOFF_SECONDS = 6 * 3600
STRIKE_MARK = "~~"
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


def _mark_strikethrough(text: str, entities: list) -> str:
    """Wraps strikethrough ranges in ``~~`` so the parser sees old prices.

    Entity offsets are UTF-16 code units, so the text is worked on with
    surrogate pairs (one str index per UTF-16 unit) and converted back.
    """
    strikes = [e for e in entities if isinstance(e, types.MessageEntityStrike)]
    if not strikes:
        return text
    surrogated = helpers.add_surrogate(text)
    inserts: list[int] = []
    for entity in strikes:
        inserts.extend((entity.offset, entity.offset + entity.length))
    # Insert from the end so earlier offsets stay valid.
    for position in sorted(inserts, reverse=True):
        surrogated = surrogated[:position] + STRIKE_MARK + surrogated[position:]
    return helpers.del_surrogate(surrogated)


def _received_at(message: types.Message, now: datetime) -> datetime:
    """The message's own date (UTC), never later than ``now``."""
    date = message.date
    if date is None:
        return now
    if date.tzinfo is None:
        date = date.replace(tzinfo=UTC)
    return min(date, now)


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
        text=_mark_strikethrough(text, entities),
        urls=list(dict.fromkeys(urls)),
        hashtags=list(dict.fromkeys(hashtags)),
        received_at=_received_at(message, now),
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


SourceKey = tuple[str, str | None]


def _source_key(source: Source) -> SourceKey:
    """What a resolved peer depends on: re-resolve only if this changes."""
    return (source.identifier.strip(), source.invite_link)


@dataclass(frozen=True)
class _Resolved:
    key: SourceKey
    peer_id: int


@dataclass(frozen=True)
class _Deferred:
    key: SourceKey
    retry_at: float  # monotonic time


class _Defer(Exception):
    """The source must not be retried for ``seconds`` (flood wait, pending invite)."""

    def __init__(self, seconds: float, reason: str) -> None:
        super().__init__(reason)
        self.seconds = seconds
        self.reason = reason


class TelegramListener:
    """Listens to the active sources.

    Each source is resolved once, and again only if its identifier or invite
    link changes, so periodic refreshes do not call ResolveUsername. A source
    becomes listenable as soon as it is resolved or joined.
    """

    def __init__(
        self,
        client,
        repo: Repository,
        pipeline: Pipeline,
        refresh_seconds: float,
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._repo = repo
        self._pipeline = pipeline
        self._refresh_seconds = refresh_seconds
        self._clock = clock
        self._sleep = sleep
        self._monotonic = monotonic
        self._sources: dict[int, Source] = {}  # peer id -> source
        self._resolved: dict[int, _Resolved] = {}  # source id -> resolved peer
        self._deferred: dict[int, _Deferred] = {}  # source id -> retry time
        self._last_join: float | None = None

    @property
    def sources(self) -> dict[int, Source]:
        """A copy of the current chat (peer) id -> source mapping."""
        return dict(self._sources)

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
            await self._sleep(self._refresh_seconds)

    async def refresh_sources(self) -> None:
        sources = await self._repo.get_active_sources()
        self._forget_inactive({source.id for source in sources})

        # Pass 1: lookups. Sources we already belong to are listenable at once.
        to_join: list[tuple[Source, object | None]] = []
        for source in sources:
            cached = self._resolved.get(source.id)
            if cached is not None and cached.key == _source_key(source):
                self._sources[cached.peer_id] = source
                continue
            if self._is_deferred(source):
                continue
            try:
                entity = await self._lookup(source)
            except Exception as e:
                self._on_failure(source, e)
                continue
            if entity is not None and not getattr(entity, "left", False):
                self._register(source, entity)
            else:
                to_join.append((source, entity))

        # Pass 2: joins, spaced JOIN_INTERVAL_SECONDS apart.
        for source, entity in to_join:
            try:
                joined = await self._join_source(source, entity)
            except Exception as e:
                self._on_failure(source, e)
                continue
            self._register(source, joined)

        logger.info("Listening to %d of %d sources", len(self._sources), len(sources))

    def _forget_inactive(self, active_ids: set[int]) -> None:
        for source_id in list(self._resolved):
            if source_id not in active_ids:
                self._sources.pop(self._resolved.pop(source_id).peer_id, None)
        for source_id in list(self._deferred):
            if source_id not in active_ids:
                del self._deferred[source_id]

    def _is_deferred(self, source: Source) -> bool:
        deferred = self._deferred.get(source.id)
        if deferred is None:
            return False
        if deferred.key == _source_key(source) and self._monotonic() < deferred.retry_at:
            return True
        del self._deferred[source.id]
        return False

    def _register(self, source: Source, entity) -> None:
        peer_id = utils.get_peer_id(entity)
        previous = self._resolved.get(source.id)
        if previous is not None and previous.peer_id != peer_id:
            self._sources.pop(previous.peer_id, None)
        self._resolved[source.id] = _Resolved(_source_key(source), peer_id)
        self._sources[peer_id] = source
        self._deferred.pop(source.id, None)

    def _on_failure(self, source: Source, error: Exception) -> None:
        """Logs a failed resolve or join; any previous mapping of the source is kept."""
        if isinstance(error, _Defer):
            self._deferred[source.id] = _Deferred(
                _source_key(source), self._monotonic() + error.seconds
            )
            logger.warning(
                "Source %s (%s): %s; retrying in %ds",
                source.id,
                source.identifier,
                error.reason,
                error.seconds,
            )
            return
        logger.error(
            "Could not resolve source %s (%s); skipping",
            source.id,
            source.identifier,
            exc_info=error,
        )

    async def _lookup(self, source: Source):
        """Returns the entity, or None if it is unknown but has an invite link."""
        identifier = source.identifier.strip()
        target = int(identifier) if _NUMERIC_ID.fullmatch(identifier) else identifier
        try:
            return await self._client.get_entity(target)
        except errors.FloodWaitError as e:
            raise _Defer(e.seconds, f"flood wait of {e.seconds}s") from e
        except (ValueError, errors.RPCError):
            if not source.invite_link:
                raise
            return None

    async def _join_source(self, source: Source, entity):
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
        except errors.InviteRequestSentError as e:
            raise _Defer(
                INVITE_PENDING_BACKOFF_SECONDS, "join request pending approval"
            ) from e

    async def _join(self, request):
        """Sends a join request spaced from the previous one.

        Flood waits up to MAX_FLOOD_SLEEP_SECONDS are slept and retried; longer
        ones defer the source to a later refresh.
        """
        while True:
            if self._last_join is not None:
                wait = JOIN_INTERVAL_SECONDS - (self._monotonic() - self._last_join)
                if wait > 0:
                    await self._sleep(wait)
            try:
                return await self._client(request)
            except errors.FloodWaitError as e:
                if e.seconds > MAX_FLOOD_SLEEP_SECONDS:
                    raise _Defer(e.seconds, f"flood wait of {e.seconds}s") from e
                logger.warning("Flood wait of %ss while joining", e.seconds)
                await self._sleep(e.seconds)
            finally:
                self._last_join = self._monotonic()
