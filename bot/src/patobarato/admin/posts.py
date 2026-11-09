"""Admin-driven publishing: publish a draft post and sync an edited one."""

import logging
from collections.abc import Callable
from datetime import datetime
from typing import Protocol

from patobarato.core.pipeline import ImageDownloader
from patobarato.models import ParsedOffer, PostData, PublicationStatus
from patobarato.publishing.format import format_caption, format_ended_caption
from patobarato.publishing.telegram_publisher import ChannelMismatchError, can_retry_without_photo
from patobarato.storage.repository import Repository
from patobarato.stores.registry import StoreRegistry

logger = logging.getLogger("patobarato.admin.posts")


class PostError(Exception):
    """A user-facing (Spanish) reason why a post action cannot be done."""


class PostPublisher(Protocol):
    async def publish(self, caption: str, photo: bytes | None) -> tuple[int, int]: ...

    async def edit(self, chat_id: int, message_id: int, caption: str) -> None: ...


def caption_for(post: PostData, registry: StoreRegistry) -> str:
    store = registry.get(post.store)
    store_name = store.name if store is not None else post.store.capitalize()
    offer = ParsedOffer(
        asin="",
        country=post.country,
        store=post.store,
        title=post.title,
        price=post.price,
        previous_price=post.previous_price,
        coupon=post.coupon,
        hashtags=list(post.hashtags),
        canonical_url=post.affiliate_url,
        product_url=post.affiliate_url,
        image_url=post.image_url,
        affiliate_url=post.affiliate_url,
        price_before_coupon=post.price_before_coupon,
    )
    if post.status == PublicationStatus.ENDED:
        return format_ended_caption(offer, post.affiliate_url, store_name)
    return format_caption(offer, post.affiliate_url, store_name)


class PostService:
    def __init__(
        self,
        repo: Repository,
        publisher: PostPublisher,
        registry: StoreRegistry,
        image_downloader: ImageDownloader,
        clock: Callable[[], datetime],
    ) -> None:
        self._repo = repo
        self._publisher = publisher
        self._registry = registry
        self._image_downloader = image_downloader
        self._clock = clock

    async def _load(self, publication_id: int) -> PostData:
        post = await self._repo.get_post(publication_id)
        if post is None:
            raise PostError("La oferta no existe")
        return post

    async def publish_draft(self, publication_id: int) -> dict:
        post = await self._load(publication_id)
        if post.status != PublicationStatus.DRAFT:
            raise PostError("La oferta no es un borrador")
        caption = caption_for(post, self._registry)
        photo = await self._download(post.image_url) if post.image_url else None
        try:
            chat_id, message_id = await self._publisher.publish(caption, photo)
        except Exception as exc:
            if photo is None or not can_retry_without_photo(exc):
                raise
            logger.warning(
                "Publication %s rejected with photo (%s: %s); publishing without photo",
                publication_id,
                type(exc).__name__,
                exc,
            )
            chat_id, message_id = await self._publisher.publish(caption, None)
        await self._repo.mark_post_published(publication_id, chat_id, message_id, self._clock())
        return {"chat_id": chat_id, "message_id": message_id}

    async def sync_post(self, publication_id: int) -> dict:
        post = await self._load(publication_id)
        if post.status == PublicationStatus.DRAFT:
            raise PostError("Es un borrador: publícalo primero")
        if post.chat_id is None or post.message_id is None:
            return {"edited": False}
        try:
            await self._publisher.edit(
                post.chat_id, post.message_id, caption_for(post, self._registry)
            )
        except ChannelMismatchError:
            raise PostError("No se encuentra el canal del post") from None
        return {"edited": True}

    async def _download(self, url: str) -> bytes | None:
        try:
            return await self._image_downloader(url)
        except Exception as exc:
            logger.warning("Photo download failed for %s: %s: %s", url, type(exc).__name__, exc)
            return None
