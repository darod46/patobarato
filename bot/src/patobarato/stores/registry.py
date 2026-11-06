"""Lookup of the configured stores by URL or id."""

import logging
from typing import TYPE_CHECKING

import httpx

from patobarato.stores.base import Store

if TYPE_CHECKING:
    from patobarato.config import Settings

logger = logging.getLogger("patobarato.stores")


class StoreRegistry:
    def __init__(self, stores: list[Store]) -> None:
        self._stores = list(stores)

    def store_for(self, url: str) -> Store | None:
        return next((s for s in self._stores if s.matches(url)), None)

    def get(self, store_id: str) -> Store | None:
        return next((s for s in self._stores if s.id == store_id), None)

    @property
    def ids(self) -> list[str]:
        return [s.id for s in self._stores]


def build_registry(
    settings: "Settings", http: httpx.AsyncClient, amazon_http: httpx.AsyncClient
) -> StoreRegistry:
    """Amazon, AliExpress (needs its three credentials) and one Awin store per merchant."""
    from patobarato.stores.aliexpress import AliExpressStore
    from patobarato.stores.aliexpress_client import AliExpressClient
    from patobarato.stores.amazon import AmazonStore
    from patobarato.stores.awin import awin_store

    stores: list[Store] = [AmazonStore(settings.affiliate_tag, amazon_http)]
    if (
        settings.aliexpress_app_key
        and settings.aliexpress_app_secret
        and settings.aliexpress_tracking_id
    ):
        client = AliExpressClient(
            http,
            settings.aliexpress_app_key,
            settings.aliexpress_app_secret,
            settings.aliexpress_tracking_id,
        )
        stores.append(AliExpressStore(client))
    else:
        logger.warning(
            "Store aliexpress skipped: missing ALIEXPRESS_APP_KEY, "
            "ALIEXPRESS_APP_SECRET or ALIEXPRESS_TRACKING_ID"
        )
    if not settings.awin_publisher_id:
        logger.warning(
            "Awin links will not be tracked: missing AWIN_PUBLISHER_ID"
        )
    for store_id, merchant_id in settings.awin_merchants.items():
        stores.append(awin_store(store_id, merchant_id, settings.awin_publisher_id, http))
    registry = StoreRegistry(stores)
    logger.info("Active stores: %s", ", ".join(registry.ids))
    return registry
