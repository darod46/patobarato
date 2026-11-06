"""Lookup of the configured stores by URL or id."""

from patobarato.stores.base import Store


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
