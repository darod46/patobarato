"""Pure rules of the Chollometro source: which deals qualify, their order and their price."""

from decimal import Decimal

from patobarato.models import ChollometroThread, PriceQuote
from patobarato.publishing.format import discount_percent


def discount_of(t: ChollometroThread) -> int | None:
    """Chollometro's discount, or the one its prices imply, or None."""
    if t.discount is not None:
        return t.discount
    if t.price is None or t.previous_price is None or t.previous_price <= t.price:
        return None
    return discount_percent(t.price, t.previous_price)


def qualifies(t: ChollometroThread, min_temperature: float, min_discount: int) -> bool:
    discount = discount_of(t)
    return t.temperature > min_temperature or (discount is not None and discount >= min_discount)


def rank_key(temperature: float, discount: int | None) -> tuple[float, int]:
    """Sort key: hottest first, then the biggest discount (none counts as 0)."""
    return (-temperature, -(discount or 0))


def reconcile_price(
    thread_price: Decimal, coupon: str | None, quote: PriceQuote | None
) -> tuple[Decimal, Decimal | None] | None:
    """The price to publish and the store's previous price, or None on a mismatch.

    ``coupon`` is any condition the deal brings (a code or free text): with one, a
    higher store price is expected and Chollometro's price is kept.
    """
    if quote is None:
        return thread_price, None
    if quote.price <= thread_price:
        previous = quote.previous_price
        return quote.price, previous if previous is not None and previous > quote.price else None
    if coupon:
        return thread_price, None
    return None
