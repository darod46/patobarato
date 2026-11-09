"""Reads new messages from the source channels with the reader (user) account."""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from telethon import events, functions, helpers, types, utils

from patobarato.core.pipeline import Pipeline, PhotoProvider, utcnow
from patobarato.models import Source, SourceMessage
from patobarato.parsing.links import UrlResolver, asin_from_url
from patobarato.parsing.text import STRIKE_MARK
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.listener")

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
    attached_photo: PreviewPhoto | None = None,
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
        attached_photo=attached_photo,
    )


def _photo_loader(client, photo: types.Photo | None) -> PreviewPhoto | None:
    if photo is None:
        return None

    async def load() -> bytes | None:
        return await client.download_media(photo, bytes)

    return load


def _preview_photo_loader(client, message: types.Message) -> PreviewPhoto | None:
    return _photo_loader(client, _webpage_photo(message.media))


def _attached_photo_loader(client, message: types.Message) -> PreviewPhoto | None:
    """Loader for the photo posted with the message (MessageMediaPhoto), if any."""
    media = message.media
    if isinstance(media, types.MessageMediaPhoto) and isinstance(media.photo, types.Photo):
        return _photo_loader(client, media.photo)
    return None


def make_photo_provider(reader_client, resolver: UrlResolver) -> PhotoProvider:
    """Builds the Telegram side of the post photo lookup, first hit wins:

    1. the source message's link preview photo, when it is for the same product;
    2. the photo attached to the source message (the pipeline only leaves it
       on messages that produced a single offer);
    3. Telegram's own preview of the canonical URL.

    A failing step is logged and the next one is tried. Amazon pages are never
    fetched here; Telegram builds the preview.
    """

    async def same_product_preview(msg: SourceMessage, canonical_url: str) -> bytes | None:
        if msg.preview_photo is None or not msg.preview_url:
            return None
        resolved = await resolver.resolve(msg.preview_url)
        wanted = asin_from_url(canonical_url)
        if resolved is not None and wanted and asin_from_url(resolved) == wanted:
            return await msg.preview_photo()
        return None

    async def attached(msg: SourceMessage, canonical_url: str) -> bytes | None:
        return await msg.attached_photo() if msg.attached_photo is not None else None

    async def telegram_preview(msg: SourceMessage, canonical_url: str) -> bytes | None:
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

    steps = (
        ("source preview", same_product_preview),
        ("attached photo", attached),
        ("Telegram preview", telegram_preview),
    )

    async def provide(msg: SourceMessage, canonical_url: str) -> bytes | None:
        for name, step in steps:
            try:
                photo = await step(msg, canonical_url)
            except Exception as exc:
                logger.warning(
                    "Photo step '%s' failed for %s: %s: %s", name, canonical_url, type(exc).__name__, exc
                )
                continue
            if photo:
                return photo
        return None

    return provide


def _is_target(entity: types.Channel, target: str) -> bool:
    """Whether the channel is the one we publish to (by @username or peer id)."""
    wanted = target.strip()
    if _NUMERIC_ID.fullmatch(wanted):
        return utils.get_peer_id(entity) == int(wanted)
    wanted = wanted.lstrip("@").lower()
    usernames = [entity.username] + [u.username for u in entity.usernames or []]
    return any(name and name.lower() == wanted for name in usernames)


class TelegramListener:
    """Listens to every broadcast channel the reader account follows.

    Each refresh lists the account's dialogs, registers new channels as
    sources and drops the ones it left. Channels set ``active = false`` in
    the database are not listened to. The target channel is always skipped.
    """

    def __init__(
        self,
        client,
        repo: Repository,
        pipeline: Pipeline,
        target: str,
        refresh_seconds: float,
        country: str = "ES",
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._client = client
        self._repo = repo
        self._pipeline = pipeline
        self._target = target
        self._refresh_seconds = refresh_seconds
        self._country = country
        self._clock = clock
        self._sleep = sleep
        self._sources: dict[int, Source] = {}  # peer id -> source

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
                _attached_photo_loader(self._client, message),
            )
            await self._pipeline.submit(msg)
        except Exception:
            logger.exception("Failed to handle message from chat %s", event.chat_id)

    async def run_refresh_loop(self) -> None:
        while True:
            try:
                await self.refresh_sources()
            except Exception:
                logger.exception("Failed to refresh sources; keeping the previous ones")
            await self._sleep(self._refresh_seconds)

    async def refresh_sources(self) -> None:
        """Rebuilds the mapping; on any error the previous mapping is kept."""
        channels: dict[str, str] = {}
        async for dialog in self._client.iter_dialogs():
            entity = dialog.entity
            if (
                isinstance(entity, types.Channel)
                and entity.broadcast
                and not entity.left
                and not _is_target(entity, self._target)
            ):
                channels[str(utils.get_peer_id(entity))] = entity.title

        sources = await self._repo.sync_sources(channels, self._country)
        self._sources = {int(source.identifier): source for source in sources}
        logger.info(
            "Listening to %d of %d followed channels", len(self._sources), len(channels)
        )
