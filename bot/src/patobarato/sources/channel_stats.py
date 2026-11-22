"""Stores the Telegram channel's member count so the web can show it."""

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Any

from telethon.tl import functions

from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.channel_stats")


class ChannelStatsSource:
    type = "channel_stats"

    def __init__(
        self,
        client: Any,
        repo: Repository,
        target: str,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._client = client
        self._repo = repo
        self._target = target
        self._clock = clock

    async def run(self, source: ApiSource) -> None:
        try:
            full = await self._client(
                functions.channels.GetFullChannelRequest(channel=self._target)
            )
            members = full.full_chat.participants_count
            await self._repo.upsert_channel_stats(members, self._clock())
            logger.info("ChannelStats: %d members", members)
        except Exception as e:
            logger.warning("ChannelStats: failed: %s: %s", type(e).__name__, e)
