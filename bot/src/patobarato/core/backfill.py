"""One-off: find the image of products that have none yet."""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Protocol

from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.backfill")

BACKFILL_DELAY_SECONDS = 3.0


class StoreImageFinder(Protocol):
    async def find(self, product_id: str, country: str, store: str) -> str | None: ...


async def backfill_images(
    repo: Repository,
    finder: StoreImageFinder,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    delay: float = BACKFILL_DELAY_SECONDS,
) -> tuple[int, int]:
    """Returns ``(found, missing)``; requests are spaced ``delay`` seconds apart."""
    found = missing = 0
    products = await repo.get_products_without_image()
    for index, (product_id, asin, country, store) in enumerate(products):
        if index:
            await sleep(delay)
        try:
            url = await finder.find(asin, country, store)
            if url:
                await repo.set_product_image(product_id, url)
                found += 1
                continue
        except Exception:
            logger.error("Image backfill failed for %s", asin, exc_info=True)
        missing += 1
    return found, missing
