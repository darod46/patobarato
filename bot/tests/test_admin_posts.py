from datetime import UTC, datetime
from decimal import Decimal

import pytest
from telethon.errors import PhotoInvalidDimensionsError

from patobarato.admin.posts import PostError, PostService
from patobarato.publishing.telegram_publisher import ChannelMismatchError
from patobarato.models import PublicationStatus
from patobarato.storage.repository import InMemoryRepository
from patobarato.stores.registry import StoreRegistry
from tests.test_repository import make_offer

NOW = datetime(2026, 11, 9, 10, 0, tzinfo=UTC)
URL = "https://www.amazon.es/dp/B000000001?tag=patobarato-21"


class FakePublisher:
    def __init__(self, publish_errors: list | None = None) -> None:
        self.publish_errors = list(publish_errors or [])
        self.published: list[tuple[str, bytes | None]] = []
        self.edits: list[tuple[int, int, str]] = []

    async def publish(self, caption, photo):
        self.published.append((caption, photo))
        if self.publish_errors:
            raise self.publish_errors.pop(0)
        return -1001, 55

    async def edit(self, chat_id, message_id, caption):
        self.edits.append((chat_id, message_id, caption))


async def make_service(
    status=PublicationStatus.DRAFT,
    chat_id=None,
    message_id=None,
    channel="telegram",
    image: bytes | None = b"img",
    publisher=None,
):
    repo = InMemoryRepository()
    source = repo.add_source("@canal")
    offer = make_offer()
    product_id = await repo.upsert_product(offer)
    await repo.set_product_image(product_id, "https://img/x.jpg")
    offer_id = await repo.insert_offer(product_id, source.id, 1, offer, "raw", NOW)
    pid = await repo.insert_publication(
        offer_id, product_id, "ES", chat_id, message_id, Decimal("9.99"), URL, NOW,
        channel=channel, status=status,
    )

    async def downloader(url):
        return image

    publisher = publisher or FakePublisher()
    service = PostService(repo, publisher, StoreRegistry([]), downloader, lambda: NOW)
    return service, repo, publisher, pid


async def test_publish_draft_posts_photo_and_marks_active():
    service, repo, publisher, pid = await make_service()

    result = await service.publish_draft(pid)

    assert result == {"chat_id": -1001, "message_id": 55}
    assert publisher.published[0][1] == b"img"
    post = await repo.get_post(pid)
    assert post.status == PublicationStatus.ACTIVE
    assert (post.chat_id, post.message_id) == (-1001, 55)


async def test_publish_draft_without_downloadable_photo_posts_text():
    service, _, publisher, pid = await make_service(image=None)
    await service.publish_draft(pid)
    assert publisher.published[0][1] is None


async def test_publish_draft_retries_without_photo_when_rejected():
    publisher = FakePublisher([PhotoInvalidDimensionsError(request=None)])
    service, repo, publisher, pid = await make_service(publisher=publisher)

    await service.publish_draft(pid)

    assert [p for _, p in publisher.published] == [b"img", None]
    assert (await repo.get_post(pid)).status == PublicationStatus.ACTIVE


async def test_publish_draft_rejects_non_draft():
    service, _, _, pid = await make_service(
        status=PublicationStatus.ACTIVE, chat_id=-1001, message_id=5
    )
    with pytest.raises(PostError, match="no es un borrador"):
        await service.publish_draft(pid)


async def test_sync_post_edits_with_active_caption():
    service, _, publisher, pid = await make_service(
        status=PublicationStatus.ACTIVE, chat_id=-1001, message_id=5
    )

    assert await service.sync_post(pid) == {"edited": True}

    chat_id, message_id, caption = publisher.edits[0]
    assert (chat_id, message_id) == (-1001, 5)
    assert "OFERTA TERMINADA" not in caption
    assert "Amazon" in caption


async def test_sync_post_maps_channel_mismatch_to_post_error():
    publisher = FakePublisher()

    async def mismatch(chat_id, message_id, caption):
        raise ChannelMismatchError("other channel")

    publisher.edit = mismatch
    service, _, _, pid = await make_service(
        status=PublicationStatus.ACTIVE, chat_id=-1001, message_id=5, publisher=publisher
    )
    with pytest.raises(PostError, match="No se encuentra el canal del post"):
        await service.sync_post(pid)


async def test_sync_post_ended_uses_ended_caption():
    service, _, publisher, pid = await make_service(
        status=PublicationStatus.ENDED, chat_id=-1001, message_id=5
    )
    await service.sync_post(pid)
    assert publisher.edits[0][2].startswith("❌ <b>OFERTA TERMINADA</b>")


async def test_sync_post_web_only_publication_is_noop():
    service, _, publisher, pid = await make_service(
        status=PublicationStatus.ACTIVE, channel="web"
    )
    assert await service.sync_post(pid) == {"edited": False}
    assert publisher.edits == []


async def test_sync_post_draft_raises():
    service, _, _, pid = await make_service()
    with pytest.raises(PostError, match="borrador"):
        await service.sync_post(pid)


async def test_sync_post_missing_publication_raises():
    service, _, _, _ = await make_service()
    with pytest.raises(PostError, match="La oferta no existe"):
        await service.sync_post(9999)
