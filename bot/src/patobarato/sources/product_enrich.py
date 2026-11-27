"""Writes a short description and a category for the products shown on the web, with DeepSeek.

Each pass takes the newest products still without a description (new deals first, then the
backlog) and gives each one up to three passes before leaving it alone. Products edited by hand
in the admin are never touched.
"""

import logging
from collections.abc import Callable
from datetime import datetime

from patobarato.core.pipeline import utcnow
from patobarato.enrich.deepseek import DeepSeekClient, DeepSeekError, DeepSeekFatal
from patobarato.enrich.product_text import SYSTEM, build_prompt, parse_answer
from patobarato.models import ApiSource
from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.product_enrich")

DEFAULT_BATCH = 40


class ProductEnricher:
    type = "product_enrich"

    def __init__(
        self,
        client: DeepSeekClient,
        repo: Repository,
        clock: Callable[[], datetime] = utcnow,
    ) -> None:
        self._client = client
        self._repo = repo
        self._clock = clock

    async def run(self, source: ApiSource) -> None:
        batch = int(source.config.get("batch", DEFAULT_BATCH))
        products = await self._repo.products_to_enrich(batch)
        done = failed = 0
        for product in products:
            try:
                answer = await self._client.json_completion(SYSTEM, build_prompt(product.title))
            except DeepSeekFatal as e:
                # Bad key or no balance: every other call would fail the same way.
                logger.warning("ProductEnrich: DeepSeek no disponible (%s); se reintenta en la próxima pasada", e)
                break
            except DeepSeekError as e:
                logger.info("ProductEnrich: producto %d sin respuesta (%s)", product.id, e)
                answer = None
            text = parse_answer(answer) if answer is not None else None
            if text is None:
                failed += 1
                await self._repo.record_enrich_failure(product.id, product.attempts + 1)
                continue
            await self._repo.save_product_text(product.id, text.description, text.category, self._clock())
            done += 1
        if products:
            logger.info("ProductEnrich: %d descripciones, %d fallidas", done, failed)
