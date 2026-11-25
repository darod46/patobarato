import logging
from datetime import UTC, datetime, timedelta

from patobarato.models import ApiSource, GuideToAnnounce
from patobarato.sources.guide_announce import GuideAnnouncer
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)
SITE = "https://patobarato.com"


class FakePublisher:
    def __init__(self, fail_publish=False, fail_pin=False, fail_unpin=False, message_id=500):
        self.fail_publish = fail_publish
        self.fail_pin = fail_pin
        self.fail_unpin = fail_unpin
        self.message_id = message_id
        self.calls: list[tuple] = []

    async def publish(self, caption, photo):
        self.calls.append(("publish", caption, photo))
        if self.fail_publish:
            raise ConnectionError("down")
        return (-100123, self.message_id)

    async def pin(self, message_id):
        self.calls.append(("pin", message_id))
        if self.fail_pin:
            raise RuntimeError("ChatAdminRequired")

    async def unpin(self, message_id):
        self.calls.append(("unpin", message_id))
        if self.fail_unpin:
            raise RuntimeError("MessageIdInvalid")


class FakeDownload:
    def __init__(self, data: bytes | None = b"jpeg"):
        self.data = data
        self.urls: list[str] = []

    async def __call__(self, url):
        self.urls.append(url)
        return self.data


def _source() -> ApiSource:
    return ApiSource(
        id=1,
        type="guide_announce",
        identifier="patobarato",
        country="ES",
        config={},
        every_minutes=30,
        hashtags=[],
        last_run_at=None,
    )


def _announcer(repo, publisher, download=None):
    return GuideAnnouncer(repo, publisher, download or FakeDownload(), SITE, clock=lambda: NOW)


async def test_announces_oldest_first_and_only_one_per_pass():
    repo = InMemoryRepository()
    repo.add_guide(2, "freidoras", "Las mejores freidoras", "Sin aceite", published_at=NOW - timedelta(hours=1))
    repo.add_guide(1, "aspiradoras", "Las mejores aspiradoras", "Para tu casa", published_at=NOW - timedelta(days=1))
    publisher = FakePublisher()
    download = FakeDownload()

    await _announcer(repo, publisher, download).run(_source())

    assert download.urls == [f"{SITE}/guias/aspiradoras.jpeg"]
    assert publisher.calls == [
        (
            "publish",
            (
                "📘 <b>Nueva guía: Las mejores aspiradoras</b>\n\nPara tu casa\n\n"
                f"👉 {SITE}/guias/aspiradoras"
            ),
            b"jpeg",
        ),
        ("pin", 500),
    ]
    assert [g.slug for g in await repo.list_guides_to_announce(NOW)] == ["freidoras"]
    assert await repo.last_announced_guide_message() == 500


async def test_skips_drafts_future_and_already_announced():
    repo = InMemoryRepository()
    repo.add_guide(1, "borrador", "B", None, status="draft", published_at=NOW - timedelta(days=1))
    repo.add_guide(2, "futura", "F", None, published_at=NOW + timedelta(hours=1))
    repo.add_guide(3, "vieja", "V", None, published_at=NOW - timedelta(days=9),
                   announced_at=NOW - timedelta(days=9))
    repo.add_guide(4, "sin-fecha", "S", None, published_at=None)
    publisher = FakePublisher()

    await _announcer(repo, publisher).run(_source())

    assert publisher.calls == []


async def test_subtitle_line_omitted_when_null():
    repo = InMemoryRepository()
    repo.add_guide(1, "teles", "Teles & más", None, published_at=NOW)
    publisher = FakePublisher()

    await _announcer(repo, publisher).run(_source())

    assert publisher.calls[0][1] == (
        f"📘 <b>Nueva guía: Teles &amp; más</b>\n\n👉 {SITE}/guias/teles"
    )


async def test_photo_failure_sends_without_photo():
    repo = InMemoryRepository()
    repo.add_guide(1, "teles", "Teles", "Sub", published_at=NOW)
    publisher = FakePublisher()

    await _announcer(repo, publisher, FakeDownload(None)).run(_source())

    assert publisher.calls[0][0] == "publish"
    assert publisher.calls[0][2] is None
    assert await repo.list_guides_to_announce(NOW) == []


async def test_publish_failure_does_not_mark(caplog):
    repo = InMemoryRepository()
    repo.add_guide(1, "teles", "Teles", "Sub", published_at=NOW)
    publisher = FakePublisher(fail_publish=True)

    with caplog.at_level(logging.WARNING):
        await _announcer(repo, publisher).run(_source())

    assert [c[0] for c in publisher.calls] == ["publish"]
    assert [g.id for g in await repo.list_guides_to_announce(NOW)] == [1]
    assert "teles" in caplog.text


async def test_pin_failure_marks_anyway(caplog):
    repo = InMemoryRepository()
    repo.add_guide(1, "teles", "Teles", "Sub", published_at=NOW)
    publisher = FakePublisher(fail_pin=True)

    with caplog.at_level(logging.WARNING):
        await _announcer(repo, publisher).run(_source())

    assert await repo.list_guides_to_announce(NOW) == []
    assert await repo.last_announced_guide_message() == 500
    assert "not pinned" in caplog.text


async def test_previous_pinned_message_is_unpinned_before_pinning():
    repo = InMemoryRepository()
    repo.add_guide(1, "vieja", "V", None, published_at=NOW - timedelta(days=7),
                   announced_at=NOW - timedelta(days=7), announce_message_id=300)
    repo.add_guide(2, "nueva", "N", None, published_at=NOW)
    publisher = FakePublisher()

    await _announcer(repo, publisher).run(_source())

    assert [c for c in publisher.calls if c[0] != "publish"] == [("unpin", 300), ("pin", 500)]


async def test_unpin_failure_still_pins_and_marks(caplog):
    repo = InMemoryRepository()
    repo.add_guide(1, "vieja", "V", None, published_at=NOW - timedelta(days=7),
                   announced_at=NOW - timedelta(days=7), announce_message_id=300)
    repo.add_guide(2, "nueva", "N", None, published_at=NOW)
    publisher = FakePublisher(fail_unpin=True)

    with caplog.at_level(logging.WARNING):
        await _announcer(repo, publisher).run(_source())

    assert ("pin", 500) in publisher.calls
    assert await repo.list_guides_to_announce(NOW) == []
    assert "not unpinned" in caplog.text


async def test_logs_announcement(caplog):
    repo = InMemoryRepository()
    repo.add_guide(1, "teles", "Teles", None, published_at=NOW)

    with caplog.at_level(logging.INFO):
        await _announcer(repo, FakePublisher()).run(_source())

    assert "GuideAnnounce: teles announced (message 500)" in caplog.text


async def test_nothing_to_do_makes_no_calls():
    repo = InMemoryRepository()
    publisher = FakePublisher()
    download = FakeDownload()

    await _announcer(repo, publisher, download).run(_source())

    assert publisher.calls == []
    assert download.urls == []


async def test_repo_failure_is_logged_not_raised(caplog):
    class BrokenRepo(InMemoryRepository):
        async def list_guides_to_announce(self, now):
            raise RuntimeError("db down")

    with caplog.at_level(logging.WARNING):
        await _announcer(BrokenRepo(), FakePublisher()).run(_source())

    assert "GuideAnnounce: failed" in caplog.text


async def test_in_memory_repo_guide_queries():
    repo = InMemoryRepository()
    repo.add_guide(1, "a", "A", "s", published_at=NOW - timedelta(days=2))
    repo.add_guide(2, "b", "B", None, published_at=NOW - timedelta(days=1))
    assert await repo.list_guides_to_announce(NOW) == [
        GuideToAnnounce(1, "a", "A", "s"),
        GuideToAnnounce(2, "b", "B", None),
    ]
    assert await repo.last_announced_guide_message() is None
    await repo.mark_guide_announced(1, 10, NOW - timedelta(hours=2))
    await repo.mark_guide_announced(2, None, NOW - timedelta(hours=1))
    # The newest announcement has no message: the newest one with a message wins.
    assert await repo.last_announced_guide_message() == 10
    assert await repo.list_guides_to_announce(NOW) == []


async def test_site_url_trailing_slash_is_ignored():
    repo = InMemoryRepository()
    repo.add_guide(1, "teles", "Teles", None, published_at=NOW)
    publisher = FakePublisher()
    download = FakeDownload()

    await GuideAnnouncer(repo, publisher, download, SITE + "/", clock=lambda: NOW).run(_source())

    assert download.urls == [f"{SITE}/guias/teles.jpeg"]
    assert publisher.calls[0][1].endswith(f"👉 {SITE}/guias/teles")
