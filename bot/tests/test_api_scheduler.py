import logging
from datetime import UTC, datetime, timedelta

from patobarato.models import ApiSource
from patobarato.sources.api_scheduler import ApiScheduler
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=UTC)


class _Runner:
    type = "fake"

    def __init__(self, fail_ids=()):
        self.ran: list[int] = []
        self.fail_ids = set(fail_ids)

    async def run(self, source: ApiSource) -> None:
        self.ran.append(source.id)
        if source.id in self.fail_ids:
            raise ValueError("boom")


def _scheduler(repo, runners, sleep=None):
    async def no_sleep(_):
        pass

    return ApiScheduler(repo, runners, clock=lambda: NOW, sleep=sleep or no_sleep)


async def test_tick_runs_never_run_and_due_sources_only():
    repo = InMemoryRepository()
    never = repo.add_api_source("fake", "a", every_minutes=60)
    due = repo.add_api_source("fake", "b", every_minutes=60)
    fresh = repo.add_api_source("fake", "c", every_minutes=60)
    await repo.mark_source_run(due.id, NOW - timedelta(minutes=61), None)
    await repo.mark_source_run(fresh.id, NOW - timedelta(minutes=10), None)
    runner = _Runner()

    await _scheduler(repo, [runner]).tick()

    assert runner.ran == [never.id, due.id]
    assert repo.source_runs[never.id] == (NOW, None)
    assert repo.source_runs[due.id] == (NOW, None)
    assert repo.source_runs[fresh.id][0] == NOW - timedelta(minutes=10)


async def test_failure_is_recorded_and_next_source_still_runs(caplog):
    repo = InMemoryRepository()
    bad = repo.add_api_source("fake", "a")
    good = repo.add_api_source("fake", "b")
    runner = _Runner(fail_ids={bad.id})

    with caplog.at_level(logging.ERROR):
        await _scheduler(repo, [runner]).tick()

    assert runner.ran == [bad.id, good.id]
    assert repo.source_runs[bad.id] == (NOW, "ValueError: boom")
    assert repo.source_runs[good.id] == (NOW, None)
    assert f"{bad.id}" in caplog.text and "ValueError: boom" in caplog.text
    assert all(r.exc_info is None for r in caplog.records)


async def test_source_without_runner_is_skipped():
    repo = InMemoryRepository()
    repo.add_api_source("other", "a")
    runner = _Runner()

    await _scheduler(repo, [runner]).tick()

    assert runner.ran == []
    assert repo.source_runs == {}


async def test_mark_source_run_failure_does_not_stop_tick():
    repo = InMemoryRepository()
    repo.add_api_source("fake", "a")
    second = repo.add_api_source("fake", "b")
    runner = _Runner()
    calls = []

    async def broken(source_id, ran_at, error):
        calls.append(source_id)
        raise RuntimeError("db down")

    repo.mark_source_run = broken

    await _scheduler(repo, [runner]).tick()

    assert runner.ran == [1, second.id]
    assert len(calls) == 2


async def test_list_failure_does_not_kill_run_loop():
    repo = InMemoryRepository()
    sleeps = []

    class Stop(BaseException):
        pass

    async def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 2:
            raise Stop

    async def broken():
        raise RuntimeError("db down")

    repo.list_api_sources = broken
    scheduler = ApiScheduler(repo, [], clock=lambda: NOW, sleep=sleep, tick_seconds=7)

    try:
        await scheduler.run()
    except Stop:
        pass

    assert sleeps == [7, 7]
