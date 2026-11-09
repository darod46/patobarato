import pytest

from patobarato.admin.jobs import JobRunner
from patobarato.admin.posts import PostError
from patobarato.admin.revalidate import RevalidateError
from patobarato.admin.users import UserError
from patobarato.core.pipeline import DraftError
from patobarato.storage.repository import InMemoryRepository


class FakePosts:
    def __init__(self):
        self.calls = []
        self.error = None

    async def publish_draft(self, pid):
        self.calls.append(("publish", pid))
        if self.error:
            raise self.error
        return {"publication_id": pid}

    async def sync_post(self, pid):
        self.calls.append(("sync", pid))
        if self.error:
            raise self.error
        return {"publication_id": pid, "synced": True}


class FakePipeline:
    def __init__(self):
        self.calls = []
        self.error = None

    async def create_draft(self, url, job_id):
        self.calls.append((url, job_id))
        if self.error:
            raise self.error
        return 42


class FakeUsers:
    def __init__(self):
        self.calls = []

    async def invite(self, email):
        self.calls.append(("invite", email))
        return {"user_id": "u1"}

    async def revoke(self, user_id):
        self.calls.append(("revoke", user_id))
        return {"user_id": user_id}


class FakeRevalidator:
    def __init__(self):
        self.count = 0
        self.error = None

    async def revalidate(self):
        self.count += 1
        if self.error:
            raise self.error


def make():
    repo = InMemoryRepository()
    posts, pipeline, users, reval = FakePosts(), FakePipeline(), FakeUsers(), FakeRevalidator()

    async def no_sleep(_):
        pass

    runner = JobRunner(repo, posts, pipeline, users, reval, 0.0, sleep=no_sleep)
    return runner, repo, posts, pipeline, users, reval


async def test_run_once_dispatches_each_type():
    runner, repo, posts, pipeline, users, reval = make()
    j1 = repo.add_job("create_offer_from_url", {"url": "https://u"})
    repo.add_job("publish_draft", {"publication_id": 5})
    repo.add_job("sync_post", {"publication_id": 6})
    repo.add_job("invite_user", {"email": "a@b.es"})
    repo.add_job("revoke_user", {"user_id": "u9"})
    repo.add_job("revalidate", {})
    assert await runner.run_once() == 6
    assert pipeline.calls == [("https://u", j1)]
    assert posts.calls == [("publish", 5), ("sync", 6)]
    assert users.calls == [("invite", "a@b.es"), ("revoke", "u9")]
    assert reval.count == 3
    jobs = repo.jobs()
    assert all(j["status"] == "done" for j in jobs)
    assert jobs[0]["result"] == {"publication_id": 42}
    assert jobs[3]["result"] == {"user_id": "u1"}


@pytest.mark.parametrize("error", [PostError("No se puede"), UserError("No se puede")])
async def test_post_error_finishes_job_with_message(error):
    runner, repo, posts, *_ = make()
    posts.error = error
    repo.add_job("publish_draft", {"publication_id": 1})
    await runner.run_once()
    job = repo.jobs()[0]
    assert job["status"] == "error" and job["error"] == "No se puede"


async def test_draft_and_revalidate_errors_are_messages():
    runner, repo, _, pipeline, _, reval = make()
    pipeline.error = DraftError("Enlace no válido")
    reval.error = RevalidateError("HTTP 500")
    repo.add_job("create_offer_from_url", {"url": "x"})
    repo.add_job("revalidate", {})
    await runner.run_once()
    jobs = repo.jobs()
    assert jobs[0]["error"] == "Enlace no válido"
    assert jobs[1]["error"] == "HTTP 500"


async def test_unexpected_error_is_generic():
    runner, repo, posts, *_ = make()
    posts.error = ValueError("secret detail")
    repo.add_job("publish_draft", {"publication_id": 1})
    await runner.run_once()
    job = repo.jobs()[0]
    assert job["status"] == "error" and job["error"] == "Error interno del bot"


async def test_unknown_type():
    runner, repo, *_ = make()
    repo.add_job("nope", {})
    await runner.run_once()
    assert repo.jobs()[0]["error"] == "Tipo de trabajo desconocido"


async def test_revalidate_failure_after_sync_keeps_done():
    runner, repo, _, _, _, reval = make()
    reval.error = RevalidateError("HTTP 500")
    repo.add_job("sync_post", {"publication_id": 6})
    await runner.run_once()
    job = repo.jobs()[0]
    assert job["status"] == "done" and job["error"] is None
    assert job["result"] == {
        "publication_id": 6,
        "synced": True,
        "revalidate_error": "HTTP 500",
    }


async def test_run_survives_exception_in_run_once():
    runner, *_ = make()
    calls = 0

    async def boom():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("db down")
        raise KeyboardInterrupt  # stops the otherwise endless loop

    runner.run_once = boom
    with pytest.raises(KeyboardInterrupt):
        await runner.run()
    assert calls == 2
