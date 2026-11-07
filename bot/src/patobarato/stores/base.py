"""The Store protocol and the base class adapters inherit from."""

from typing import Protocol

from patobarato.models import PriceQuote


class Store(Protocol):
    id: str
    name: str

    def matches(self, url: str) -> bool: ...

    def product_id(self, url: str) -> str | None: ...

    def canonical_url(self, product_id: str, country: str) -> str: ...

    def canonical_for(self, url: str, country: str) -> str: ...

    async def affiliate_url(self, canonical_url: str, product_id: str) -> str: ...

    async def find_image(self, product_id: str, canonical_url: str) -> str | None: ...

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None: ...


class BaseStore:
    """Shared defaults; stores whose URL is not rebuilt from the id override them."""

    id: str
    name: str

    def matches(self, url: str) -> bool:
        raise NotImplementedError

    def product_id(self, url: str) -> str | None:
        raise NotImplementedError

    def canonical_url(self, product_id: str, country: str) -> str:
        raise NotImplementedError

    def canonical_for(self, url: str, country: str) -> str:
        product_id = self.product_id(url)
        if product_id is None:
            raise ValueError(f"No product id in {url!r}")
        return self.canonical_url(product_id, country)

    async def fetch_price(self, product_id: str, canonical_url: str) -> PriceQuote | None:
        return None
