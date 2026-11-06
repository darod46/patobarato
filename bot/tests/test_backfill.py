import asyncio
import dataclasses
from datetime import UTC, datetime
from decimal import Decimal

from patobarato.core.backfill import backfill_images
from patobarato.models import ParsedOffer
from patobarato.storage.repository import InMemoryRepository


def _offer(asin: str) -> ParsedOffer:
    return ParsedOffer(
        asin=asin,
        country="ES",
        store="amazon",
        title="t",
        price=Decimal("1"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url=f"https://www.amazon.es/dp/{asin}",
        product_url=f"https://www.amazon.es/dp/{asin}",
    )


class Finder:
    def __init__(self, urls: dict[str, str | None]) -> None:
        self.urls = urls
        self.calls: list[tuple[str, str, str]] = []
        self.page_urls: list[str] = []

    async def find(self, asin: str, country: str, store: str, url: str = "") -> str | None:
        self.calls.append((asin, country, store))
        self.page_urls.append(url)
        if self.urls.get(asin) == "boom":
            raise RuntimeError("down")
        return self.urls.get(asin)


async def test_backfill_sets_found_images_and_spaces_requests():
    repo = InMemoryRepository()
    a = await repo.upsert_product(_offer("B000000001"))
    b = await repo.upsert_product(_offer("B000000002"))
    c = await repo.upsert_product(_offer("B000000003"))
    sleeps: list[float] = []

    async def sleep(seconds: float) -> None:
        sleeps.append(seconds)

    finder = Finder({"B000000001": "https://img/1.jpg", "B000000002": None, "B000000003": "boom"})
    found, missing = await backfill_images(repo, finder, sleep=sleep, delay=3.0)

    assert (found, missing) == (1, 2)
    assert repo.product_images == {a: "https://img/1.jpg"}
    assert [c[0] for c in finder.calls] == ["B000000001", "B000000002", "B000000003"]
    assert sleeps == [3.0, 3.0]
    assert b not in repo.product_images and c not in repo.product_images


async def test_backfill_forwards_each_products_store():
    repo = InMemoryRepository()
    await repo.upsert_product(_offer("B000000001"))
    await repo.upsert_product(dataclasses.replace(_offer("X1"), store="aliexpress"))
    finder = Finder({})

    async def sleep(seconds: float) -> None:
        pass

    await backfill_images(repo, finder, sleep=sleep)

    assert sorted(finder.calls) == [
        ("B000000001", "ES", "amazon"),
        ("X1", "ES", "aliexpress"),
    ]


async def test_backfill_passes_the_stored_product_url():
    repo = InMemoryRepository()
    await repo.upsert_product(
        dataclasses.replace(_offer("X1"), store="aliexpress", product_url="https://es.aliexpress.com/item/X1.html")
    )
    finder = Finder({})
    await backfill_images(repo, finder, sleep=lambda s: asyncio.sleep(0))
    assert finder.page_urls == ["https://es.aliexpress.com/item/X1.html"]
