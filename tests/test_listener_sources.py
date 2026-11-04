"""TelegramListener: source refresh (resolve caching, joins, backoff) and message handler."""

import logging
from datetime import UTC, datetime
from types import SimpleNamespace

from telethon import errors, utils
from telethon.tl import functions, types

from patobarato.models import Source, SourceMessage
from patobarato.sources.telegram_listener import (
    INVITE_PENDING_BACKOFF_SECONDS,
    JOIN_INTERVAL_SECONDS,
    TelegramListener,
)

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def _channel(channel_id: int, left: bool = False) -> types.Channel:
    return types.Channel(
        id=channel_id,
        title=f"c{channel_id}",
        photo=types.ChatPhotoEmpty(),
        date=NOW,
        left=left,
        access_hash=1,
    )


def _updates() -> types.Updates:
    return types.Updates(updates=[], users=[], chats=[], date=NOW, seq=0)


def _peer(channel_id: int) -> int:
    return utils.get_peer_id(types.PeerChannel(channel_id))


class FakeTime:
    """Monotonic clock plus a sleep that advances it instantly."""

    def __init__(self) -> None:
        self.now = 1000.0
        self.sleeps: list[float] = []

    def monotonic(self) -> float:
        return self.now

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


class FakeSourceRepo:
    def __init__(self, sources: list[Source]) -> None:
        self.sources = sources

    async def get_active_sources(self) -> list[Source]:
        return list(self.sources)


class FakeTelegram:
    """Fake reader client.

    ``entities`` maps a get_entity target to an entity or an exception.
    ``results`` maps ("join", channel_id) / ("invite", hash) to a result, an
    exception, or a list of those consumed in order.
    """

    def __init__(self, entities=None, results=None) -> None:
        self.entities = dict(entities or {})
        self.results = dict(results or {})
        self.get_entity_calls: list = []
        self.requests: list = []
        self.before_request = None

    async def get_entity(self, target):
        self.get_entity_calls.append(target)
        result = self.entities.get(target, ValueError(f"unknown {target!r}"))
        if isinstance(result, Exception):
            raise result
        return result

    async def __call__(self, request):
        if self.before_request is not None:
            self.before_request(request)
        self.requests.append(request)
        if isinstance(request, functions.channels.JoinChannelRequest):
            key = ("join", request.channel.id)
        elif isinstance(request, functions.messages.ImportChatInviteRequest):
            key = ("invite", request.hash)
        else:
            raise AssertionError(f"unexpected request {request!r}")
        result = self.results[key]
        if isinstance(result, list):
            result = result.pop(0)
        if isinstance(result, Exception):
            raise result
        return result

    def joins(self, cls=functions.channels.JoinChannelRequest) -> list:
        return [r for r in self.requests if isinstance(r, cls)]


def _listener(client, sources, pipeline=None):
    time_ = FakeTime()
    repo = FakeSourceRepo(sources)
    listener = TelegramListener(
        client,
        repo,
        pipeline,
        refresh_seconds=300,
        clock=lambda: NOW,
        sleep=time_.sleep,
        monotonic=time_.monotonic,
    )
    return listener, repo, time_


# --- C1: no repeated resolves --------------------------------------------------


async def test_refresh_with_unchanged_sources_makes_no_resolve_calls():
    a, b = Source(1, "@a", "ES"), Source(2, "@b", "ES")
    client = FakeTelegram({"@a": _channel(11), "@b": _channel(12)})
    listener, _, _ = _listener(client, [a, b])

    await listener.refresh_sources()
    assert client.get_entity_calls == ["@a", "@b"]

    await listener.refresh_sources()

    assert client.get_entity_calls == ["@a", "@b"]
    assert client.requests == []
    assert listener.sources == {_peer(11): a, _peer(12): b}


async def test_refresh_resolves_only_changed_or_new_sources():
    client = FakeTelegram(
        {"@a": _channel(11), "@a2": _channel(21), "@new": _channel(31)}
    )
    listener, repo, _ = _listener(client, [Source(1, "@a", "ES")])
    await listener.refresh_sources()

    changed, new = Source(1, "@a2", "ES"), Source(3, "@new", "ES")
    repo.sources = [changed, new]
    await listener.refresh_sources()

    assert client.get_entity_calls == ["@a", "@a2", "@new"]
    assert listener.sources == {_peer(21): changed, _peer(31): new}


async def test_resolve_failure_keeps_previous_mapping(caplog):
    a = Source(1, "@a", "ES")
    client = FakeTelegram({"@a": _channel(11)})
    listener, repo, _ = _listener(client, [a])
    await listener.refresh_sources()

    repo.sources = [Source(1, "@renamed", "ES")]  # this lookup fails
    with caplog.at_level(logging.ERROR, logger="patobarato.listener"):
        await listener.refresh_sources()

    assert listener.sources == {_peer(11): a}
    assert any("@renamed" in r.getMessage() for r in caplog.records)


async def test_deactivated_source_is_dropped():
    a, b = Source(1, "@a", "ES"), Source(2, "@b", "ES")
    client = FakeTelegram({"@a": _channel(11), "@b": _channel(12)})
    listener, repo, _ = _listener(client, [a, b])
    await listener.refresh_sources()

    repo.sources = [b]
    await listener.refresh_sources()

    assert listener.sources == {_peer(12): b}


async def test_pending_invite_request_is_not_retried_before_backoff():
    private = Source(1, "-1009999", "ES", invite_link="https://t.me/+AbCdEfGh")
    client = FakeTelegram(
        results={("invite", "AbCdEfGh"): errors.InviteRequestSentError(None)}
    )
    listener, _, time_ = _listener(client, [private])
    invites = lambda: client.joins(functions.messages.ImportChatInviteRequest)  # noqa: E731

    await listener.refresh_sources()
    time_.now += 300
    await listener.refresh_sources()

    assert len(invites()) == 1
    assert listener.sources == {}

    time_.now += INVITE_PENDING_BACKOFF_SECONDS
    await listener.refresh_sources()

    assert len(invites()) == 2
    assert INVITE_PENDING_BACKOFF_SECONDS >= 6 * 3600


async def test_flood_wait_on_lookup_defers_source_until_wait_expires():
    a = Source(1, "@a", "ES")
    client = FakeTelegram({"@a": errors.FloodWaitError(None, 600)})
    listener, _, time_ = _listener(client, [a])

    await listener.refresh_sources()
    client.entities["@a"] = _channel(11)
    time_.now += 300
    await listener.refresh_sources()

    assert client.get_entity_calls == ["@a"]
    assert time_.sleeps == []

    time_.now += 301
    await listener.refresh_sources()

    assert client.get_entity_calls == ["@a", "@a"]
    assert listener.sources == {_peer(11): a}


# --- C2: incremental mapping, long flood waits deferred ------------------------


async def test_long_join_flood_wait_defers_source_and_keeps_others():
    a, b, c = Source(1, "@a", "ES"), Source(2, "@b", "ES"), Source(3, "@c", "ES")
    client = FakeTelegram(
        {
            "@a": _channel(11),
            "@b": _channel(12, left=True),
            "@c": _channel(13, left=True),
        },
        {
            ("join", 12): errors.FloodWaitError(None, 3600),
            ("join", 13): _updates(),
        },
    )
    listener, _, time_ = _listener(client, [a, b, c])

    await listener.refresh_sources()

    assert listener.sources == {_peer(11): a, _peer(13): c}
    assert sum(time_.sleeps) <= JOIN_INTERVAL_SECONDS

    time_.now += 600  # still inside the 3600 s flood wait
    await listener.refresh_sources()
    assert [r.channel.id for r in client.joins()] == [12, 13]


async def test_short_join_flood_wait_is_slept_and_retried():
    b = Source(2, "@b", "ES")
    client = FakeTelegram(
        {"@b": _channel(12, left=True)},
        {("join", 12): [errors.FloodWaitError(None, 5), _updates()]},
    )
    listener, _, time_ = _listener(client, [b])

    await listener.refresh_sources()

    assert listener.sources == {_peer(12): b}
    assert 5 in time_.sleeps
    assert len(client.joins()) == 2


async def test_joins_are_spaced_and_resolved_sources_listen_before_joins():
    a, b, c = Source(1, "@a", "ES"), Source(2, "@b", "ES"), Source(3, "@c", "ES")
    client = FakeTelegram(
        {
            "@a": _channel(11, left=True),
            "@b": _channel(12, left=True),
            "@c": _channel(13),
        },
        {("join", 11): _updates(), ("join", 12): _updates()},
    )
    listener, _, time_ = _listener(client, [a, b, c])
    mapping_at_join: list[set[int]] = []
    client.before_request = lambda request: mapping_at_join.append(
        set(listener.sources)
    )

    await listener.refresh_sources()

    # @c (already a member) is listenable before the first join is sent,
    # and @a as soon as it is joined, before the join of @b.
    assert mapping_at_join == [{_peer(13)}, {_peer(13), _peer(11)}]
    assert time_.sleeps == [JOIN_INTERVAL_SECONDS]
    assert listener.sources == {_peer(11): a, _peer(12): b, _peer(13): c}


# --- _on_new_message ------------------------------------------------------------


class FakePipeline:
    def __init__(self) -> None:
        self.submitted: list[SourceMessage] = []

    async def submit(self, msg: SourceMessage) -> None:
        self.submitted.append(msg)


def _raw_message(text: str) -> types.Message:
    return types.Message(
        id=42, peer_id=types.PeerChannel(channel_id=11), date=NOW, message=text
    )


async def _mapped_listener():
    client = FakeTelegram({"@a": _channel(11)})
    pipeline = FakePipeline()
    listener, _, _ = _listener(client, [Source(5, "@a", "ES")], pipeline=pipeline)
    await listener.refresh_sources()
    return listener, pipeline


async def test_on_new_message_submits_message_from_mapped_chat():
    listener, pipeline = await _mapped_listener()

    await listener._on_new_message(
        SimpleNamespace(chat_id=_peer(11), message=_raw_message("Oferta 9,99€"))
    )

    [msg] = pipeline.submitted
    assert (msg.source_id, msg.message_id, msg.text) == (5, 42, "Oferta 9,99€")
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
