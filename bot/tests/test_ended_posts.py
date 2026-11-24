import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from telethon.errors import MessageIdInvalidError

from patobarato.admin.posts import PostError
from patobarato.models import ApiSource, ParsedOffer, PublicationStatus
from patobarato.sources.ended_posts import EndedPostsSource, is_permanent_edit_failure
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)


class FakePosts:
    def __init__(self, repo, fail=(), error=None):
        self.repo = repo
        self.fail = set(fail)
        self.error = error or (lambda: ConnectionError("timeout"))
        self.calls: list[int] = []

    async def sync_post(self, publication_id):
        self.calls.append(publication_id)
        if publication_id in self.fail:
            raise self.error()
        await self.repo.mark_post_synced(publication_id, NOW)
        return {"edited": True}


def _source() -> ApiSource:
    return ApiSource(
        id=1,
        type="ended_posts",
        identifier="patobarato",
        country="ES",
        config={},
        every_minutes=60,
        hashtags=[],
        last_run_at=None,
    )


async def _seed_ended(repo, asin, ended_days_ago=1):
    offer = ParsedOffer(
        asin=asin,
        country="ES",
        store="amazon",
        title=f"Producto {asin}",
        price=Decimal("9.99"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url=f"https://www.amazon.es/dp/{asin}",
        product_url=f"https://www.amazon.es/dp/{asin}",
    )
    source = repo.add_source(f"@c{asin}")
    product_id = await repo.upsert_product(offer)
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    return await repo.insert_publication(
        offer_id, product_id, "ES", -1001, 5, Decimal("9.99"), "https://aff",
        NOW - timedelta(days=40), status=PublicationStatus.ENDED,
        ended_at=NOW - timedelta(days=ended_days_ago),
    )


def _pub(repo, publication_id):
    return next(p for p in repo.publications() if p["id"] == publication_id)


def _make(repo, posts, limit=100, delay=1.5):
    sleeps: list[float] = []

    async def sleep(seconds):
        sleeps.append(seconds)

    source = EndedPostsSource(
        repo, posts, clock=lambda: NOW, limit=limit, sleep=sleep, delay_seconds=delay
    )
    return source, sleeps


async def test_type_is_ended_posts():
    assert EndedPostsSource.type == "ended_posts"


async def test_edits_pending_posts_and_sleeps_between_edits(caplog):
    repo = InMemoryRepository()
    ids = [await _seed_ended(repo, f"E0{i}", ended_days_ago=i + 1) for i in range(3)]
    posts = FakePosts(repo)
    source, sleeps = _make(repo, posts, delay=2.0)
    with caplog.at_level(logging.INFO, logger="patobarato.ended_posts"):
        await source.run(_source())
    assert posts.calls == ids  # most recently ended first
    assert all(_pub(repo, pid)["post_synced_at"] == NOW for pid in ids)
    assert sleeps == [2.0, 2.0]
    assert "EndedPosts: 3 edited, 0 failed, 0 pending" in caplog.text


async def test_edits_at_most_limit_per_pass(caplog):
    repo = InMemoryRepository()
    for i in range(5):
        await _seed_ended(repo, f"E0{i}", ended_days_ago=i + 1)
    posts = FakePosts(repo)
    source, _ = _make(repo, posts, limit=2)
    with caplog.at_level(logging.INFO, logger="patobarato.ended_posts"):
        await source.run(_source())
    assert len(posts.calls) == 2
    assert "EndedPosts: 2 edited, 0 failed, 3 pending" in caplog.text


async def test_nothing_pending_does_nothing(caplog):
    repo = InMemoryRepository()
    posts = FakePosts(repo)
    source, sleeps = _make(repo, posts)
    with caplog.at_level(logging.INFO, logger="patobarato.ended_posts"):
        await source.run(_source())
    assert posts.calls == [] and sleeps == []
    assert "EndedPosts: 0 edited, 0 failed, 0 pending" in caplog.text


async def test_transient_failure_is_logged_and_left_pending(caplog):
    repo = InMemoryRepository()
    first = await _seed_ended(repo, "E01", ended_days_ago=1)
    second = await _seed_ended(repo, "E02", ended_days_ago=2)
    posts = FakePosts(repo, fail={first})
    source, _ = _make(repo, posts)
    with caplog.at_level(logging.INFO, logger="patobarato.ended_posts"):
        await source.run(_source())
    assert posts.calls == [first, second]
    assert _pub(repo, first)["post_synced_at"] is None
    assert _pub(repo, second)["post_synced_at"] == NOW
    assert "ConnectionError" in caplog.text
    assert "will not be retried" not in caplog.text
    assert "EndedPosts: 1 edited, 1 failed, 1 pending" in caplog.text
    assert any(r.levelno == logging.WARNING for r in caplog.records)


@pytest.mark.parametrize(
    "error",
    [
        lambda: PostError("No se encuentra el canal del post"),
        lambda: MessageIdInvalidError(request=None),
    ],
)
async def test_permanent_failure_leaves_the_queue(error, caplog):
    repo = InMemoryRepository()
    gone = await _seed_ended(repo, "E01")
    posts = FakePosts(repo, fail={gone}, error=error)
    source, _ = _make(repo, posts)
    with caplog.at_level(logging.INFO, logger="patobarato.ended_posts"):
        await source.run(_source())
    assert _pub(repo, gone)["post_synced_at"] == NOW
    assert await repo.list_ended_posts_to_edit(10) == []
    assert "will not be retried" in caplog.text
    assert "EndedPosts: 0 edited, 1 failed, 0 pending" in caplog.text


async def test_listing_failure_is_logged_not_raised(caplog):
    repo = InMemoryRepository()

    async def boom(limit):
        raise RuntimeError("db down")

    repo.list_ended_posts_to_edit = boom
    source, _ = _make(repo, FakePosts(repo))
    with caplog.at_level(logging.WARNING, logger="patobarato.ended_posts"):
        await source.run(_source())
    assert "EndedPosts" in caplog.text and "RuntimeError" in caplog.text


def test_is_permanent_edit_failure():
    assert is_permanent_edit_failure(PostError("No se encuentra el canal del post"))
    assert is_permanent_edit_failure(MessageIdInvalidError(request=None))
    assert not is_permanent_edit_failure(PostError("La oferta no existe"))
    assert not is_permanent_edit_failure(ConnectionError("timeout"))
