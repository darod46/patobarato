import io
from unittest.mock import AsyncMock

import pytest
from telethon import utils
from telethon.errors import (
    ChatWriteForbiddenError,
    FloodWaitError,
    MessageNotModifiedError,
    RPCError,
    ServerError,
)
from telethon.tl.types import PeerChannel

from patobarato.publishing.telegram_publisher import TelegramPublisher

URL = "https://www.amazon.es/dp/B0ABC12345?tag=patobarato-21"


class FakeMessage:
    def __init__(self, channel_id: int = 123, msg_id: int = 77) -> None:
        self.peer_id = PeerChannel(channel_id)
        self.id = msg_id


class FakeClient:
    def __init__(self, side_effects: list | None = None) -> None:
        self.side_effects = list(side_effects or [])
        self.calls: list[tuple[str, tuple, dict]] = []

    async def _respond(self, kind: str, args: tuple, kwargs: dict) -> FakeMessage:
        self.calls.append((kind, args, kwargs))
        if self.side_effects:
            effect = self.side_effects.pop(0)
            if isinstance(effect, BaseException):
                raise effect
        return FakeMessage()

    async def send_file(self, *args, **kwargs):
        return await self._respond("send_file", args, kwargs)

    async def send_message(self, *args, **kwargs):
        return await self._respond("send_message", args, kwargs)

    async def edit_message(self, *args, **kwargs):
        return await self._respond("edit_message", args, kwargs)


@pytest.fixture
def sleep(monkeypatch) -> AsyncMock:
    mock = AsyncMock()
    monkeypatch.setattr("asyncio.sleep", mock)
    return mock


async def test_publish_with_photo_uses_send_file_and_button(sleep):
    client = FakeClient()
    publisher = TelegramPublisher(client, "@patobarato")

    result = await publisher.publish("cap", b"jpegbytes")

    assert result == (utils.get_peer_id(PeerChannel(123)), 77)
    [(kind, args, kwargs)] = client.calls
    assert kind == "send_file"
    assert args[0] == "@patobarato"
    photo = args[1]
    assert isinstance(photo, io.BytesIO)
    assert photo.getvalue() == b"jpegbytes"
    assert photo.name == "photo.jpg"
    assert kwargs["caption"] == "cap"
    assert kwargs["parse_mode"] == "html"
    assert "buttons" not in kwargs
    sleep.assert_not_called()


async def test_publish_without_photo_uses_send_message(sleep):
    client = FakeClient()
    publisher = TelegramPublisher(client, "@patobarato")

    result = await publisher.publish("cap", None)

    assert result == (utils.get_peer_id(PeerChannel(123)), 77)
    [(kind, args, kwargs)] = client.calls
    assert kind == "send_message"
    assert args == ("@patobarato", "cap")
    assert kwargs["parse_mode"] == "html"
    assert kwargs["link_preview"] is False
    assert "buttons" not in kwargs


async def test_flood_wait_retries_then_succeeds(sleep):
    client = FakeClient([FloodWaitError(None, capture=7)])
    publisher = TelegramPublisher(client, "@patobarato")

    result = await publisher.publish("cap", None)

    assert result[1] == 77
    assert len(client.calls) == 2
    sleep.assert_awaited_once_with(7)


async def test_network_error_backs_off_exponentially(sleep):
    client = FakeClient([ConnectionError("x"), ServerError(None, "boom")])
    publisher = TelegramPublisher(client, "@patobarato", base_delay=2.0)

    await publisher.publish("cap", None)

    assert [c.args[0] for c in sleep.await_args_list] == [2.0, 4.0]
    assert len(client.calls) == 3


async def test_gives_up_after_max_retries(sleep):
    errors = [ConnectionError(f"e{i}") for i in range(4)]
    client = FakeClient(errors)
    publisher = TelegramPublisher(client, "@patobarato", max_retries=3, base_delay=2.0)

    with pytest.raises(ConnectionError, match="e3"):
        await publisher.publish("cap", None)

    assert len(client.calls) == 4
    assert [c.args[0] for c in sleep.await_args_list] == [2.0, 4.0, 8.0]


async def test_flood_wait_also_gives_up_after_max_retries(sleep):
    client = FakeClient([FloodWaitError(None, capture=1) for _ in range(3)])
    publisher = TelegramPublisher(client, "@patobarato", max_retries=2)

    with pytest.raises(FloodWaitError):
        await publisher.publish("cap", None)

    assert len(client.calls) == 3
    assert sleep.await_count == 2


async def test_bad_request_errors_are_not_retried(sleep):
    client = FakeClient([ChatWriteForbiddenError(None)])
    publisher = TelegramPublisher(client, "@patobarato")

    with pytest.raises(RPCError):
        await publisher.publish("cap", None)

    assert len(client.calls) == 1
    sleep.assert_not_called()


async def test_edit_calls_edit_message_with_html_and_no_preview(sleep):
    client = FakeClient()
    publisher = TelegramPublisher(client, "@patobarato")

    result = await publisher.edit(-100123, 77, "new caption")

    assert result is None
    assert client.calls == [
        (
            "edit_message",
            (-100123, 77, "new caption"),
            {"parse_mode": "html", "link_preview": False},
        )
    ]


async def test_edit_ignores_message_not_modified(sleep):
    client = FakeClient([MessageNotModifiedError(None)])
    publisher = TelegramPublisher(client, "@patobarato")

    await publisher.edit(-100123, 77, "same")

    assert len(client.calls) == 1
    sleep.assert_not_called()


async def test_edit_retries_flood_wait(sleep):
    client = FakeClient([FloodWaitError(None, capture=7)])
    publisher = TelegramPublisher(client, "@patobarato")

    await publisher.edit(-100123, 77, "cap")

    assert len(client.calls) == 2
    sleep.assert_awaited_once_with(7)


async def test_edit_raises_bad_request(sleep):
    client = FakeClient([ChatWriteForbiddenError(None)])
    publisher = TelegramPublisher(client, "@patobarato")

    with pytest.raises(ChatWriteForbiddenError):
        await publisher.edit(-100123, 77, "cap")

    assert len(client.calls) == 1
    sleep.assert_not_called()
