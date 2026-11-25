"""Announces each newly published guide in the Telegram channel and pins it."""

import html
import logging
import re
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Protocol

from patobarato.core.pipeline import utcnow
from patobarato.models import ApiSource, GuideToAnnounce
from patobarato.publishing.telegram_publisher import can_retry_without_photo
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.guide_announce")

_URL = re.compile(r"https?://\S+")

PhotoDownloader = Callable[[str], Awaitable[bytes | None]]


class GuidePublisher(Protocol):
    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]: ...

    async def pin(self, message_id: int) -> None: ...

    async def unpin(self, message_id: int) -> None: ...


def _describe(error: Exception) -> str:
    # No traceback: errors may carry a request URL.
    return f"{type(error).__name__}: {_URL.sub('<url>', str(error))}"


def guide_caption(guide: GuideToAnnounce, site_url: str) -> str:
    lines = [f"📘 <b>Nueva guía: {html.escape(guide.title, quote=False)}</b>"]
    if guide.subtitle:
        lines.append(html.escape(guide.subtitle, quote=False))
    lines.append(f"👉 {site_url}/guias/{guide.slug}")
    return "\n\n".join(lines)


class GuideAnnouncer:
    type = "guide_announce"

    def __init__(
        self,
        repo: Repository,
        publisher: GuidePublisher,
        download: PhotoDownloader,
        site_url: str,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._repo = repo
        self._publisher = publisher
        self._download = download
        self._site_url = site_url.rstrip("/")
        self._clock = clock

    async def run(self, source: ApiSource) -> None:
        try:
            await self._run()
        except Exception as e:
            logger.warning("GuideAnnounce: failed: %s", _describe(e))

    async def _run(self) -> None:
        candidates = await self._repo.list_guides_to_announce(self._clock())
        if not candidates:
            return
        # One per pass: a backlog never floods the channel.
        guide = candidates[0]
        photo = await self._photo(guide)
        message_id = await self._publish(guide, guide_caption(guide, self._site_url), photo)
        if message_id is None:
            return
        await self._pin(guide, message_id)
        try:
            await self._repo.mark_guide_announced(guide.id, message_id, self._clock())
        except Exception as e:
            # The post is out: without the mark it would be announced again next pass.
            logger.error(
                "GuideAnnounce: %s announced (message %d) but not marked, fix it by hand: %s",
                guide.slug,
                message_id,
                _describe(e),
            )
            return
        logger.info("GuideAnnounce: %s announced (message %d)", guide.slug, message_id)

    async def _publish(
        self, guide: GuideToAnnounce, caption: str, photo: bytes | None
    ) -> int | None:
        """The new message's id, or None (logged) if it could not be sent."""
        try:
            try:
                _, message_id = await self._publisher.publish(caption, photo)
            except Exception as e:
                if photo is None or not can_retry_without_photo(e):
                    raise
                # A cover Telegram rejects would otherwise block every later guide.
                logger.warning(
                    "GuideAnnounce: %s rejected with photo (%s); sending without photo",
                    guide.slug,
                    _describe(e),
                )
                _, message_id = await self._publisher.publish(caption, None)
        except Exception as e:
            logger.warning(
                "GuideAnnounce: %s not announced, retrying next pass: %s",
                guide.slug,
                _describe(e),
            )
            return None
        return message_id

    async def _photo(self, guide: GuideToAnnounce) -> bytes | None:
        try:
            return await self._download(f"{self._site_url}/guias/{guide.slug}.jpeg")
        except Exception as e:
            logger.warning("GuideAnnounce: cover of %s not downloaded: %s", guide.slug, _describe(e))
            return None

    async def _pin(self, guide: GuideToAnnounce, message_id: int) -> None:
        """Leaves only the new announcement pinned; failures are logged, never raised."""
        try:
            previous = await self._repo.last_announced_guide_message()
            if previous is not None and previous != message_id:
                try:
                    await self._publisher.unpin(previous)
                except Exception as e:
                    logger.warning(
                        "GuideAnnounce: previous message %d not unpinned: %s",
                        previous,
                        _describe(e),
                    )
            await self._publisher.pin(message_id)
        except Exception as e:
            logger.warning(
                "GuideAnnounce: %s message %d not pinned: %s",
                guide.slug,
                message_id,
                _describe(e),
            )
