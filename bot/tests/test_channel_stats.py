import logging
from datetime import UTC, datetime
from types import SimpleNamespace

from patobarato.models import ApiSource
from patobarato.sources.channel_stats import ChannelStatsSource
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 22, 12, 0, tzinfo=UTC)


class _FakeClient:
    def __init__(self, members: int = 1234, error: Exception | None = None) -> None:
        self._members = members
        self._error = error
        self.requests: list = []

    async def __call__(self, request):
        self.requests.append(request)
        if self._error:
            raise self._error
        return SimpleNamespace(full_chat=SimpleNamespace(participants_count=self._members))


def _source() -> ApiSource:
    return ApiSource(
        id=1,
        type="channel_stats",
        identifier="channel",
        country="ES",
        config={},
        every_minutes=60,
        hashtags=[],
        last_run_at=None,
    )


async def test_run_stores_participant_count():
    repo = InMemoryRepository()
    client = _FakeClient(1234)
    await ChannelStatsSource(client, repo, "@canal", lambda: NOW).run(_source())
    assert repo.channel_stats == {"members": 1234, "checked_at": NOW}
    assert client.requests[0].channel == "@canal"


async def test_run_logs_and_swallows_errors(caplog):
    repo = InMemoryRepository()
    client = _FakeClient(error=RuntimeError("boom"))
    with caplog.at_level(logging.INFO):
        await ChannelStatsSource(client, repo, "@canal", lambda: NOW).run(_source())
    assert repo.channel_stats is None
    assert any(
        "ChannelStats" in r.getMessage() and r.levelno == logging.WARNING
        for r in caplog.records
    )
