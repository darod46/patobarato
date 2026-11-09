import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import httpx
from telethon.tl import functions, types

from patobarato.models import SourceMessage
from patobarato.parsing.links import UrlResolver
from patobarato.parsing.text import parse_prices
from patobarato.sources.telegram_listener import (
    _attached_photo_loader,
    make_photo_provider,
    to_source_message,
)

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)
CANONICAL = "https://www.amazon.es/dp/B09XS7JWHH"


def _message(text: str = "", entities=None, reply_markup=None, media=None) -> types.Message:
    return types.Message(
        id=42,
        peer_id=types.PeerChannel(channel_id=777),
        date=NOW,
        message=text,
        entities=entities,
        reply_markup=reply_markup,
        media=media,
    )


def _photo(photo_id: int = 1) -> types.Photo:
    return types.Photo(
        id=photo_id,
        access_hash=0,
        file_reference=b"",
        date=NOW,
        sizes=[],
        dc_id=1,
    )


def _webpage_media(url: str, photo=None) -> types.MessageMediaWebPage:
    return types.MessageMediaWebPage(
        webpage=types.WebPage(id=1, url=url, display_url=url, hash=0, photo=photo)
    )


def test_urls_from_text_entities_buttons_and_webpage():
    text = "Oferta https://amzn.to/aaa y ver aquí #Chollo"
    plain = "https://amzn.to/aaa"
    entities = [
        types.MessageEntityUrl(offset=text.index(plain), length=len(plain)),
        types.MessageEntityTextUrl(
            offset=text.index("aquí"), length=4, url="https://amzn.to/bbb"
        ),
    ]
    markup = types.ReplyInlineMarkup(
        rows=[
            # Telethon 1.45 layer: URL buttons are KeyboardInlineButton with a
            # InlineButtonTypeUrl type (KeyboardButtonUrl no longer exists).
            types.KeyboardInlineButtonRow(
                buttons=[
                    types.KeyboardInlineButton(
                        text="Comprar", type=types.InlineButtonTypeUrl("https://amzn.to/ccc")
                    ),
                    types.KeyboardInlineButton(
                        text="Me gusta", type=types.InlineButtonTypeCallback(b"x")
                    ),
                    types.KeyboardInlineButton(
                        text="Otra vez", type=types.InlineButtonTypeUrl("https://amzn.to/aaa")
                    ),
                ]
            )
        ]
    )
    media = _webpage_media("https://www.amazon.es/dp/B000000001")

    msg = to_source_message(
        _message(text, entities, markup, media), source_id=3, now=NOW, preview_photo=None
    )

    assert msg.urls == [
        "https://amzn.to/aaa",
        "https://amzn.to/bbb",
        "https://amzn.to/ccc",
        "https://www.amazon.es/dp/B000000001",
    ]
    assert msg.source_id == 3
    assert msg.message_id == 42
    assert msg.text == text
    assert msg.received_at == NOW
    assert msg.preview_url == "https://www.amazon.es/dp/B000000001"


def test_url_entity_offsets_use_utf16_units():
    text = "🔥 https://amzn.to/zzz"
    entities = [types.MessageEntityUrl(offset=3, length=19)]  # 🔥 is 2 UTF-16 units

    msg = to_source_message(_message(text, entities), 1, NOW, None)

    assert msg.urls == ["https://amzn.to/zzz"]


def test_hashtags_from_entities():
    text = "Super #Chollo en #Auriculares y #chollo"
    entities = [
        types.MessageEntityHashtag(offset=text.index("#Chollo"), length=7),
        types.MessageEntityHashtag(offset=text.index("#Auriculares"), length=12),
        types.MessageEntityHashtag(offset=text.index("#chollo"), length=7),
    ]

    msg = to_source_message(_message(text, entities), 1, NOW, None)

    assert msg.hashtags == ["chollo", "auriculares"]


def test_message_without_text():
    raw = _message()
    raw.message = None

    msg = to_source_message(raw, 1, NOW, None)

    assert msg.text == ""
    assert msg.urls == []
    assert msg.hashtags == []
    assert msg.preview_url is None
    assert msg.preview_photo is None


def test_preview_photo_is_passed_through():
    async def loader() -> bytes | None:
        return b"img"

    msg = to_source_message(_message("x"), 1, NOW, loader)

    assert msg.preview_photo is loader


class FakeReader:
    """Stands in for the Telethon reader client."""

    def __init__(self, preview_result=None) -> None:
        self.preview_result = preview_result
        self.requests: list = []
        self.downloads: list = []

    async def __call__(self, request):
        self.requests.append(request)
        return self.preview_result

    async def download_media(self, media, file):
        assert file is bytes
        self.downloads.append(media)
        return f"photo-{media.id}".encode()


def _resolver() -> UrlResolver:
    def handler(request: httpx.Request) -> httpx.Response:
        targets = {
            "/same": "https://www.amazon.es/dp/B09XS7JWHH?ref=x",
            "/other": "https://www.amazon.es/dp/B000000001",
        }
        return httpx.Response(301, headers={"Location": targets[request.url.path]})

    return UrlResolver(httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def _source_msg(preview_url: str | None, has_photo: bool) -> SourceMessage:
    async def loader() -> bytes | None:
        return b"source-preview"

    return SourceMessage(
        source_id=1,
        message_id=1,
        text="",
        urls=[],
        hashtags=[],
        received_at=NOW,
        preview_photo=loader if has_photo else None,
        preview_url=preview_url,
    )


async def test_photo_provider_uses_source_preview_for_same_asin():
    reader = FakeReader()
    provider = make_photo_provider(reader, _resolver())

    photo = await provider(_source_msg("https://amzn.to/same", True), CANONICAL)

    assert photo == b"source-preview"
    assert reader.requests == []


async def test_photo_provider_falls_back_to_preview_request_for_other_asin():
    reader = FakeReader(
        types.messages.WebPagePreview(
            media=_webpage_media(CANONICAL, _photo(9)), chats=[], users=[]
        )
    )
    provider = make_photo_provider(reader, _resolver())

    photo = await provider(_source_msg("https://amzn.to/other", True), CANONICAL)

    assert photo == b"photo-9"
    [request] = reader.requests
    assert isinstance(request, functions.messages.GetWebPagePreviewRequest)
    assert request.message == CANONICAL


async def test_photo_provider_accepts_bare_media_result():
    reader = FakeReader(_webpage_media(CANONICAL, _photo(5)))
    provider = make_photo_provider(reader, _resolver())

    photo = await provider(_source_msg(None, False), CANONICAL)

    assert photo == b"photo-5"


async def test_photo_provider_returns_none_without_any_photo():
    reader = FakeReader(
        types.messages.WebPagePreview(
            media=_webpage_media(CANONICAL, None), chats=[], users=[]
        )
    )
    provider = make_photo_provider(reader, _resolver())

    photo = await provider(_source_msg("https://amzn.to/other", True), CANONICAL)

    assert photo is None
    assert reader.downloads == []


async def test_photo_provider_returns_none_for_empty_preview():
    reader = FakeReader(
        types.messages.WebPagePreview(
            media=types.MessageMediaEmpty(), chats=[], users=[]
        )
    )
    provider = make_photo_provider(reader, _resolver())

    assert await provider(_source_msg(None, False), CANONICAL) is None


def test_strikethrough_entity_is_wrapped_respecting_utf16_offsets():
    text = "🎧 Auriculares Sony\n49,99€ 29,99€"
    # The emoji is 2 UTF-16 units, so the entity offset is 1 more than the str index.
    entities = [
        types.MessageEntityStrike(offset=text.index("49,99€") + 1, length=len("49,99€"))
    ]

    msg = to_source_message(_message(text, entities), 1, NOW, None)

    assert msg.text == "🎧 Auriculares Sony\n~~49,99€~~ 29,99€"
    prices = parse_prices(msg.text)
    assert prices.price == Decimal("29.99")
    assert prices.previous_price == Decimal("49.99")


def test_received_at_is_message_date_when_earlier_than_clock():
    raw = _message("x")
    raw.date = NOW - timedelta(minutes=40)

    assert to_source_message(raw, 1, NOW, None).received_at == NOW - timedelta(minutes=40)


def test_received_at_is_never_after_clock():
    raw = _message("x")
    raw.date = NOW + timedelta(minutes=5)

    assert to_source_message(raw, 1, NOW, None).received_at == NOW


def test_received_at_without_message_date_uses_clock():
    raw = _message("x")
    raw.date = None

    assert to_source_message(raw, 1, NOW, None).received_at == NOW


def test_received_at_naive_message_date_is_utc():
    raw = _message("x")
    raw.date = (NOW - timedelta(minutes=1)).replace(tzinfo=None)

    assert to_source_message(raw, 1, NOW, None).received_at == NOW - timedelta(minutes=1)


def _photo_message(photo_id: int = 3) -> types.Message:
    return _message("x", media=types.MessageMediaPhoto(photo=_photo(photo_id)))


def test_attached_photo_is_passed_through():
    async def loader() -> bytes | None:
        return b"img"

    msg = to_source_message(_photo_message(), 1, NOW, None, attached_photo=loader)

    assert msg.attached_photo is loader
    assert to_source_message(_message("x"), 1, NOW, None).attached_photo is None


async def test_attached_photo_loader_downloads_the_message_photo():
    reader = FakeReader()

    loader = _attached_photo_loader(reader, _photo_message(3))

    assert loader is not None
    assert await loader() == b"photo-3"
    assert _attached_photo_loader(reader, _message("x")) is None
    assert _attached_photo_loader(reader, _message("x", media=_webpage_media(CANONICAL, _photo()))) is None


def _msg_with(preview_url=None, preview=None, attached=None) -> SourceMessage:
    return SourceMessage(
        1, 1, "", [], [], NOW, preview_photo=preview, preview_url=preview_url, attached_photo=attached
    )


def _loader(result: bytes | None = None, error: Exception | None = None):
    calls: list[int] = []

    async def load() -> bytes | None:
        calls.append(1)
        if error is not None:
            raise error
        return result

    load.calls = calls
    return load


def _preview_reader(photo_id: int = 9) -> FakeReader:
    return FakeReader(
        types.messages.WebPagePreview(media=_webpage_media(CANONICAL, _photo(photo_id)), chats=[], users=[])
    )


async def test_same_product_preview_comes_before_attached_photo():
    attached = _loader(b"attached")
    provider = make_photo_provider(FakeReader(), _resolver())

    photo = await provider(_msg_with("https://amzn.to/same", _loader(b"preview"), attached), CANONICAL)

    assert photo == b"preview"
    assert attached.calls == []


async def test_attached_photo_comes_before_preview_request():
    reader = _preview_reader()
    provider = make_photo_provider(reader, _resolver())

    photo = await provider(_msg_with("https://amzn.to/other", _loader(b"preview"), _loader(b"attached")), CANONICAL)

    assert photo == b"attached"
    assert reader.requests == []


async def test_failing_steps_fall_through_to_preview_request(caplog):
    reader = _preview_reader(9)
    provider = make_photo_provider(reader, _resolver())
    msg = _msg_with(
        "https://amzn.to/same", _loader(error=RuntimeError("preview gone")), _loader(error=RuntimeError("attached gone"))
    )

    with caplog.at_level(logging.WARNING, logger="patobarato.listener"):
        photo = await provider(msg, CANONICAL)

    assert photo == b"photo-9"
    messages = " ".join(r.getMessage() for r in caplog.records)
    assert "preview gone" in messages and "attached gone" in messages


async def test_empty_steps_fall_through_to_preview_request():
    reader = _preview_reader(9)
    provider = make_photo_provider(reader, _resolver())

    photo = await provider(_msg_with("https://amzn.to/same", _loader(None), _loader(None)), CANONICAL)

    assert photo == b"photo-9"


async def test_failing_preview_request_gives_none(caplog):
    class BrokenReader(FakeReader):
        async def __call__(self, request):
            raise RuntimeError("flood wait")

    provider = make_photo_provider(BrokenReader(), _resolver())

    with caplog.at_level(logging.WARNING, logger="patobarato.listener"):
        assert await provider(_msg_with(), CANONICAL) is None
    assert any("flood wait" in r.getMessage() for r in caplog.records)
