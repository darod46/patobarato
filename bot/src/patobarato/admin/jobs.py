"""Runs the jobs the admin portal queues in ``admin_jobs``."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from patobarato.admin.posts import PostError
from patobarato.admin.revalidate import RevalidateError
from patobarato.admin.users import UserError
from patobarato.core.pipeline import DraftError
from patobarato.models import AdminJob
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.admin.jobs")

CLAIM_LIMIT = 10
INTERNAL_ERROR = "Error interno del bot"
UNKNOWN_TYPE = "Tipo de trabajo desconocido"
_USER_ERRORS = (PostError, DraftError, UserError, RevalidateError)


class JobRunner:
    def __init__(
        self,
        repo: Repository,
        posts: Any,
        pipeline: Any,
        users: Any,
        revalidator: Any,
        poll_seconds: float,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._repo = repo
        self._posts = posts
        self._pipeline = pipeline
        self._users = users
        self._revalidator = revalidator
        self._poll_seconds = poll_seconds
        self._sleep = sleep

    async def run(self) -> None:
        while True:
            try:
                await self.run_once()
            except Exception:
                logger.exception("Admin job loop failed; retrying")
            await self._sleep(self._poll_seconds)

    async def run_once(self) -> int:
        jobs = await self._repo.claim_jobs(CLAIM_LIMIT)
        for job in jobs:
            await self._handle(job)
        return len(jobs)

    async def _handle(self, job: AdminJob) -> None:
        try:
            result = await self._dispatch(job)
        except _USER_ERRORS as e:
            await self._repo.finish_job(job.id, error=str(e))
        except Exception:
            logger.exception("Admin job %s (%s) failed", job.id, job.type)
            await self._repo.finish_job(job.id, error=INTERNAL_ERROR)
        else:
            await self._repo.finish_job(job.id, result=result)

    async def _dispatch(self, job: AdminJob) -> dict:
        payload = job.payload
        match job.type:
            case "create_offer_from_url":
                publication_id = await self._pipeline.create_draft(payload["url"], job.id)
                return {"publication_id": publication_id}
            case "publish_draft":
                return await self._then_revalidate(
                    await self._posts.publish_draft(payload["publication_id"])
                )
            case "sync_post":
                return await self._then_revalidate(
                    await self._posts.sync_post(payload["publication_id"])
                )
            case "invite_user":
                return await self._users.invite(payload["email"])
            case "revoke_user":
                return await self._users.revoke(payload["user_id"])
            case "revalidate":
                await self._revalidator.revalidate()
                return {}
            case _:
                raise UserError(UNKNOWN_TYPE)

    async def _then_revalidate(self, result: dict) -> dict:
        """The Telegram side already succeeded, so a web failure is only a note on the result."""
        try:
            await self._revalidator.revalidate()
        except RevalidateError as e:
            return {**result, "revalidate_error": str(e)}
        return result
