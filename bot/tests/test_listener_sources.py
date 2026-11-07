"""TelegramListener: sources are the broadcast channels the reader account follows."""

import logging
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from telethon import utils
from telethon.tl import types

from patobarato.models import SourceMessage
from patobarato.sources.telegram_listener import TelegramListener
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def _channel(
    channel_id: int, username: str | None = None, broadcast: bool = True
) -> types.Channel:
    return types.Channel(
        id=channel_id,
        title=f"Canal {channel_id}",
        photo=types.ChatPhotoEmpty(),
        date=NOW,
        broadcast=broadcast,
        megagroup=not broadcast,
        username=username,
        access_hash=1,
    )


def _user(user_id: int) -> types.User:
    return types.User(id=user_id, first_name="Ana")


def _peer(channel_id: int) -> int:
    return utils.get_peer_id(types.PeerChannel(channel_id))


class FakeTelegram:
    """Fake reader client whose dialogs are ``entities`` (or an exception)."""

    def __init__(self, entities) -> None:
        self.entities = entities

    async def iter_dialogs(self):
        if isinstance(self.entities, Exception):
            raise self.entities
        for entity in self.entities:
            yield SimpleNamespace(entity=entity)


class FakePipeline:
    def __init__(self) -> None:
        self.submitted: list[SourceMessage] = []

    async def submit(self, msg: SourceMessage) -> None:
        self.submitted.append(msg)


def _listener(client, pipeline=None, repo=None, target="@patobarato"):
    repo = repo or InMemoryRepository()
    listener = TelegramListener(
        client, repo, pipeline, target=target, refresh_seconds=300, clock=lambda: NOW
    )
    return listener, repo


async def test_listens_to_followed_broadcast_channels_and_registers_them():
    listener, repo = _listener(FakeTelegram([_channel(11), _channel(12)]))

    await listener.refresh_sources()

    sources = listener.sources
    assert set(sources) == {_peer(11), _peer(12)}
    assert sources[_peer(11)].identifier == str(_peer(11))
    assert sources[_peer(11)].country == "ES"
    assert repo.source_names() == {str(_peer(11)): "Canal 11", str(_peer(12)): "Canal 12"}


async def test_ignores_groups_users_and_the_target_channel():
    client = FakeTelegram(
        [
            _channel(11),
            _channel(12, broadcast=False),
            _user(13),
            _channel(14, username="PatoBarato"),
        ]
    )
    listener, _ = _listener(client)

    await listener.refresh_sources()

    assert set(listener.sources) == {_peer(11)}


async def test_numeric_target_is_excluded():
    listener, _ = _listener(
        FakeTelegram([_channel(11), _channel(14)]), target=str(_peer(14))
    )

    await listener.refresh_sources()

    assert set(listener.sources) == {_peer(11)}


async def test_refresh_keeps_source_ids_stable():
    client = FakeTelegram([_channel(11)])
    listener, _ = _listener(client)

    await listener.refresh_sources()
    first = listener.sources[_peer(11)].id
    await listener.refresh_sources()

    assert listener.sources[_peer(11)].id == first


async def test_unsubscribed_channel_is_dropped():
    client = FakeTelegram([_channel(11), _channel(12)])
    listener, _ = _listener(client)
    await listener.refresh_sources()

    client.entities = [_channel(11)]
    await listener.refresh_sources()

    assert set(listener.sources) == {_peer(11)}


async def test_channel_deactivated_in_database_is_not_listened():
    repo = InMemoryRepository()
    repo.add_source(str(_peer(12)), active=False)
    listener, _ = _listener(FakeTelegram([_channel(11), _channel(12)]), repo=repo)

    await listener.refresh_sources()

    assert set(listener.sources) == {_peer(11)}


async def test_refresh_failure_keeps_previous_mapping(caplog):
    client = FakeTelegram([_channel(11)])
    listener, _ = _listener(client)
    await listener.refresh_sources()

    client.entities = ConnectionError("boom")
    with pytest.raises(ConnectionError):
        await listener.refresh_sources()

    assert set(listener.sources) == {_peer(11)}


# --- message handler -------------------------------------------------------------


def _raw_message(text: str) -> types.Message:
    return types.Message(
        id=42, peer_id=types.PeerChannel(channel_id=11), date=NOW, message=text
    )


async def _mapped_listener():
    pipeline = FakePipeline()
    listener, _ = _listener(FakeTelegram([_channel(11)]), pipeline=pipeline)
    await listener.refresh_sources()
    return listener, pipeline


async def test_on_new_message_submits_message_from_mapped_chat():
    listener, pipeline = await _mapped_listener()

    await listener._on_new_message(
        SimpleNamespace(chat_id=_peer(11), message=_raw_message("Oferta 9,99€"))
    )

    [msg] = pipeline.submitted
    source_id = listener.sources[_peer(11)].id
    assert (msg.source_id, msg.message_id, msg.text) == (source_id, 42, "Oferta 9,99€")
    assert msg.received_at == NOW


async def test_on_new_message_ignores_unmapped_chat():
    listener, pipeline = await _mapped_listener()

    await listener._on_new_message(
        SimpleNamespace(chat_id=_peer(99), message=_raw_message("Oferta 9,99€"))
    )

    assert pipeline.submitted == []


async def test_on_new_message_logs_conversion_errors(caplog):
    listener, pipeline = await _mapped_listener()

    with caplog.at_level(logging.ERROR, logger="patobarato.listener"):
        await listener._on_new_message(
            SimpleNamespace(chat_id=_peer(11), message=object())
        )

    assert pipeline.submitted == []
    assert any(
        r.exc_info for r in caplog.records if r.name == "patobarato.listener"
    )


async def test_on_new_message_passes_attached_photo_loader():
    listener, pipeline = await _mapped_listener()
    raw = _raw_message("Oferta")
    raw.media = types.MessageMediaPhoto(
        photo=types.Photo(id=1, access_hash=0, file_reference=b"", date=NOW, sizes=[], dc_id=1)
    )

    await listener._on_new_message(SimpleNamespace(chat_id=_peer(11), message=raw))
    await listener._on_new_message(SimpleNamespace(chat_id=_peer(11), message=_raw_message("Otra")))

    with_photo, without_photo = pipeline.submitted
    assert with_photo.attached_photo is not None
    assert without_photo.attached_photo is None
