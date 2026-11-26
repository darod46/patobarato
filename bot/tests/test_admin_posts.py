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
    clock: datetime = NOW,
    site_url: str | None = None,
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
    service = PostService(repo, publisher, StoreRegistry([]), downloader, lambda: clock, site_url)
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


async def test_sync_post_ended_marks_post_synced():
    service, repo, _, pid = await make_service(
        status=PublicationStatus.ENDED, chat_id=-1001, message_id=5
    )
    await service.sync_post(pid)
    assert repo.publications()[0]["post_synced_at"] == NOW


async def test_sync_post_active_does_not_mark_post_synced():
    service, repo, _, pid = await make_service(
        status=PublicationStatus.ACTIVE, chat_id=-1001, message_id=5
    )
    await service.sync_post(pid)
    assert repo.publications()[0]["post_synced_at"] is None


LATER = datetime(2026, 11, 12, 18, 30, tzinfo=UTC)  # 19:30 in Madrid; NOW (publication time) is 11:00


async def test_publish_draft_caption_has_the_publish_time_and_the_affiliate_line():
    service, _, publisher, pid = await make_service(clock=LATER)
    await service.publish_draft(pid)
    caption = publisher.published[0][0]
    assert "🕒 Precio y disponibilidad a las 19:30 del 12/11; pueden cambiar." in caption
    assert "ℹ️ Enlace de afiliado" in caption


async def test_editing_an_active_post_shows_the_edit_time():
    service, _, publisher, pid = await make_service(
        status=PublicationStatus.ACTIVE, chat_id=-1001, message_id=55, clock=LATER
    )
    await service.sync_post(pid)
    assert "a las 19:30 del 12/11" in publisher.edits[0][2]


async def test_ending_a_post_keeps_the_time_it_was_published():
    service, _, publisher, pid = await make_service(
        status=PublicationStatus.ENDED, chat_id=-1001, message_id=55, clock=LATER
    )
    await service.sync_post(pid)
    caption = publisher.edits[0][2]
    assert "OFERTA TERMINADA" in caption
    assert "a las 11:00 del 09/11" in caption


SITE = "https://www.patobarato.com"


async def test_with_web_links_a_draft_links_to_its_deal_page():
    service, _, publisher, pid = await make_service(site_url=SITE)
    await service.publish_draft(pid)
    caption = publisher.published[0][0]
    assert f"🛒 Ver la oferta: {SITE}/oferta/amazon/pato-b000000001" in caption
    assert "Enlace de afiliado" not in caption and "amazon.es" not in caption


async def test_with_web_links_an_ended_post_is_edited_to_the_deal_page():
    service, _, publisher, pid = await make_service(
        status=PublicationStatus.ENDED, chat_id=-1001, message_id=55, site_url=SITE
    )
    await service.sync_post(pid)
    caption = publisher.edits[0][2]
    assert "OFERTA TERMINADA" in caption
    assert f"{SITE}/oferta/amazon/pato-b000000001" in caption


async def test_without_web_links_posts_keep_the_affiliate_link():
    service, _, publisher, pid = await make_service()
    await service.publish_draft(pid)
    assert URL in publisher.published[0][0]
