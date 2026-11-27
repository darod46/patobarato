import logging
from datetime import UTC, datetime
from decimal import Decimal

from patobarato.enrich.deepseek import DeepSeekError, DeepSeekFatal
from patobarato.models import ApiSource, ParsedOffer, PublicationStatus
from patobarato.sources.product_enrich import ProductEnricher
from patobarato.storage.repository import InMemoryRepository

NOW = datetime(2026, 12, 1, 12, 0, tzinfo=UTC)
GOOD = (
    "Una freidora de aire de gran capacidad para cocinar con muy poco aceite, pensada para familias. "
    "Sus programas automáticos ponen las cosas fáciles en el día a día."
)


class _FakeClient:
    def __init__(self, answers: list) -> None:
        self._answers = list(answers)
        self.prompts: list[str] = []

    async def json_completion(self, system: str, user: str, **_) -> dict:
        self.prompts.append(user)
        answer = self._answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def _source(**config) -> ApiSource:
    return ApiSource(1, "product_enrich", "deepseek", "ES", config, 10, [], None)


async def _product(repo: InMemoryRepository, asin: str, title: str, status=PublicationStatus.ACTIVE) -> int:
    offer = ParsedOffer(
        asin=asin, country="ES", store="amazon", title=title, price=Decimal("1"),
        previous_price=None, coupon=None, hashtags=[], canonical_url=f"https://a/{asin}", product_url=f"https://a/{asin}",
    )
    product_id = await repo.upsert_product(offer)
    await repo.insert_publication(
        offer_id=0, product_id=product_id, country="ES", channel="web", chat_id=None,
        message_id=None, published_price=Decimal("1"), affiliate_url="u", published_at=NOW, status=status,
    )
    return product_id


async def test_writes_description_and_category_newest_first():
    repo = InMemoryRepository()
    old = await _product(repo, "A1", "Freidora Cosori 5,5 L")
    new = await _product(repo, "A2", "Aspiradora Conga")
    client = _FakeClient([{"description": GOOD, "category": "hogar"}] * 2)
    await ProductEnricher(client, repo, lambda: NOW).run(_source())
    assert "Aspiradora Conga" in client.prompts[0] and "Freidora Cosori" in client.prompts[1]
    assert repo.product_texts[new] == {"description": GOOD, "category": "hogar", "at": NOW}
    assert old in repo.product_texts


async def test_skips_drafts_manual_edits_and_done_products_and_respects_batch():
    repo = InMemoryRepository()
    await _product(repo, "D1", "Borrador", status=PublicationStatus.DRAFT)
    manual = await _product(repo, "M1", "Editado a mano")
    repo.manual_texts.add(manual)
    a = await _product(repo, "A1", "Uno")
    b = await _product(repo, "B1", "Dos")
    client = _FakeClient([{"description": GOOD, "category": "hogar"}])
    await ProductEnricher(client, repo, lambda: NOW).run(_source(batch=1))
    assert list(repo.product_texts) == [b]
    await ProductEnricher(_FakeClient([{"description": GOOD, "category": "moda"}]), repo, lambda: NOW).run(_source())
    assert set(repo.product_texts) == {a, b}


async def test_rejected_or_failed_answers_count_attempts_until_three():
    repo = InMemoryRepository()
    pid = await _product(repo, "A1", "Uno")
    bad = {"description": GOOD + " Solo 9,99 €.", "category": "hogar"}
    for answer in (bad, DeepSeekError("HTTP 500"), bad):
        await ProductEnricher(_FakeClient([answer]), repo, lambda: NOW).run(_source())
    assert repo.enrich_attempts[pid] == 3
    assert pid not in repo.product_texts
    client = _FakeClient([])
    await ProductEnricher(client, repo, lambda: NOW).run(_source())
    assert client.prompts == []


async def test_fatal_error_stops_the_pass_without_counting_attempts(caplog):
    repo = InMemoryRepository()
    await _product(repo, "A1", "Uno")
    await _product(repo, "B1", "Dos")
    client = _FakeClient([DeepSeekFatal("HTTP 402"), {"description": GOOD, "category": "hogar"}])
    with caplog.at_level(logging.WARNING):
        await ProductEnricher(client, repo, lambda: NOW).run(_source())
    assert len(client.prompts) == 1
    assert repo.enrich_attempts == {} and repo.product_texts == {}
    assert "HTTP 402" in caplog.text
