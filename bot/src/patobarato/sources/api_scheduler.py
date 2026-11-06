"""Timer that runs the API-based deal sources (non-Telegram) when they are due."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Protocol

from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.api_scheduler")


class ApiSourceRunner(Protocol):
    type: str

    async def run(self, source: ApiSource) -> None: ...


class ApiScheduler:
    def __init__(
        self,
        repo: Repository,
        runners: list[ApiSourceRunner],
        clock: Callable[[], datetime] = utcnow,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        tick_seconds: float = 60,
    ) -> None:
        self._repo = repo
        self._runners = {runner.type: runner for runner in runners}
        self._clock = clock
        self._sleep = sleep
        self._tick_seconds = tick_seconds

    async def run(self) -> None:
        while True:
            try:
                await self.tick()
            except Exception as e:  # tick already guards; this keeps the loop alive no matter what
                logger.error("API scheduler tick failed: %s: %s", type(e).__name__, e)
            await self._sleep(self._tick_seconds)

    async def tick(self) -> None:
        """One pass: runs the due sources; never raises (errors are logged and recorded)."""
        try:
            sources = await self._repo.list_api_sources()
        except Exception as e:
            logger.error("Could not list API sources: %s: %s", type(e).__name__, e)
            return
        for source in sources:
            runner = self._runners.get(source.type)
            if runner is None or not self._is_due(source):
                continue
            error: str | None = None
            try:
                await runner.run(source)
            except Exception as e:
                # No traceback: HTTP errors may carry a signed request URL.
                error = f"{type(e).__name__}: {e}"
                logger.error("API source %s failed: %s", source.id, error)
            try:
                await self._repo.mark_source_run(source.id, self._clock(), error)
            except Exception as e:
                logger.error(
                    "Could not record the run of API source %s: %s: %s",
                    source.id,
                    type(e).__name__,
                    e,
                )

    def _is_due(self, source: ApiSource) -> bool:
        if source.last_run_at is None:
            return True
        return self._clock() - source.last_run_at >= timedelta(minutes=source.every_minutes)
