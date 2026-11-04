import html
import re
from decimal import ROUND_HALF_UP, Decimal

from patobarato.models import ParsedOffer

BUTTON_TEXT = "🛒 Ver en Amazon"

_INVALID_TAG_CHARS = re.compile(r"[^a-z0-9_áéíóúñü]")


def format_price(value: Decimal) -> str:
    """Spanish format: Decimal('1299.9') -> '1.299,90'."""
    text = f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}"
    return text.replace(",", "X").replace(".", ",").replace("X", ".")


def discount_percent(price: Decimal, previous: Decimal) -> int:
    percent = (previous - price) / previous * 100
    return int(percent.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _normalize_hashtag(tag: str) -> str:
    return _INVALID_TAG_CHARS.sub("", tag.lower())


def _build(offer: ParsedOffer, title: str) -> str:
    assert offer.price is not None, "format_caption requires a price"
    lines = [
        f"🦆 <b>{html.escape(title)}</b>",
        f"✅ Precio: <b>{format_price(offer.price)} €</b>",
    ]
    if offer.previous_price is not None:
        lines.append(
            f"❌ Antes: <s>{format_price(offer.previous_price)} €</s>"
            f" (-{discount_percent(offer.price, offer.previous_price)}%)"
        )
    if offer.coupon:
        lines.append(f"🎟️ Cupón: <code>{html.escape(offer.coupon)}</code>")
    tags = [t for t in (_normalize_hashtag(h) for h in offer.hashtags) if t]
    if tags:
        lines.append("")
        lines.append(" ".join(f"#{t}" for t in tags))
    return "\n".join(lines)


def format_caption(offer: ParsedOffer, max_len: int = 1024) -> str:
    caption = _build(offer, offer.title)
    if len(caption) <= max_len:
        return caption
    # Trim only the (unescaped) title, longest prefix that fits.
    lo, hi = 0, len(offer.title)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if len(_build(offer, offer.title[:mid].rstrip() + "…")) <= max_len:
            lo = mid
        else:
            hi = mid - 1
    return _build(offer, offer.title[:lo].rstrip() + "…")
