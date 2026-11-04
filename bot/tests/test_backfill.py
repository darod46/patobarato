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
    )


class Finder:
    def __init__(self, urls: dict[str, str | None]) -> None:
        self.urls = urls
        self.calls: list[str] = []

    async def find(self, asin: str, country: str) -> str | None:
        self.calls.append(asin)
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
    assert finder.calls == ["B000000001", "B000000002", "B000000003"]
    assert sleeps == [3.0, 3.0]
    assert b not in repo.product_images and c not in repo.product_images
