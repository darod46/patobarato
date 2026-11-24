"""Edits the Telegram posts of ended deals (run by the server bot, which has Telegram)."""

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol

from telethon.errors import MessageIdInvalidError

from patobarato.admin.posts import PostError
from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.ended_posts")

DEFAULT_LIMIT = 100
DEFAULT_DELAY_SECONDS = 1.5
# PostError raised by sync_post when the post's channel no longer resolves.
_CHANNEL_GONE = "No se encuentra el canal"
_URL = re.compile(r"https?://\S+")


class PostSyncer(Protocol):
    async def sync_post(self, publication_id: int) -> dict: ...


def is_permanent_edit_failure(error: Exception) -> bool:
    """An edit failure that retrying never fixes (old channel, deleted message)."""
    if isinstance(error, MessageIdInvalidError):
        return True
    return isinstance(error, PostError) and str(error).startswith(_CHANNEL_GONE)


def _describe(error: Exception) -> str:
    # No traceback: errors may carry a request URL.
    return f"{type(error).__name__}: {_URL.sub('<url>', str(error))}"


class EndedPostsSource:
    type = "ended_posts"

    def __init__(
        self,
        repo: Repository,
        posts: PostSyncer,
        clock: Callable[[], datetime] = utcnow,
        limit: int = DEFAULT_LIMIT,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        delay_seconds: float = DEFAULT_DELAY_SECONDS,
    ) -> None:
        self._repo = repo
        self._posts = posts
        self._clock = clock
        self._limit = limit
        self._sleep = sleep
        self._delay = delay_seconds

    async def run(self, source: ApiSource) -> None:
        try:
            await self._run()
        except Exception as e:
            logger.warning("EndedPosts: failed: %s", _describe(e))

    async def _run(self) -> None:
        edited = failed = 0
        for index, publication_id in enumerate(
            await self._repo.list_ended_posts_to_edit(self._limit)
        ):
            if index:
                await self._sleep(self._delay)
            if await self._sync(publication_id):
                edited += 1
            else:
                failed += 1
        pending = await self._repo.count_ended_posts_to_edit()
        logger.info("EndedPosts: %d edited, %d failed, %d pending", edited, failed, pending)

    async def _sync(self, publication_id: int) -> bool:
        """Edits one post; a failure is logged, never raised."""
        try:
            await self._posts.sync_post(publication_id)
        except Exception as e:
            permanent = is_permanent_edit_failure(e)
            logger.warning(
                "EndedPosts: post of publication %d not edited%s: %s",
                publication_id,
                " (will not be retried)" if permanent else "",
                _describe(e),
            )
            if permanent:
                # Leaves the edit queue: the post's channel or message is gone.
                await self._repo.mark_post_synced(publication_id, self._clock())
            return False
        return True
