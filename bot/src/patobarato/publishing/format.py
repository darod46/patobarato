import html
import re
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from patobarato.models import ParsedOffer
from patobarato.parsing.text import strip_urls

# The link goes in the text as a visible URL: Telegram opens it without a
# confirmation and hands it to the system (Amazon app), unlike URL buttons.
def link_label(store_name: str) -> str:
    return f"🛒 Ver en {store_name}:"


_INVALID_TAG_CHARS = re.compile(r"[^a-z0-9_áéíóúñü]")

MADRID = ZoneInfo("Europe/Madrid")

# Amazon Associates: an affiliate disclosure next to the link, and prices shown with the date/time they
# were read and a note that they may change (we do not read them from the API). Applies to every store.
AFFILIATE_LINE = "ℹ️ Enlace de afiliado: si compras, ganamos una comisión sin coste para ti."


def priced_at_line(priced_at: datetime) -> str:
    local = priced_at.astimezone(MADRID)
    return f"🕒 Precio y disponibilidad a las {local:%H:%M} del {local:%d/%m}; pueden cambiar."


def format_price(value: Decimal) -> str:
    """Spanish format: Decimal('1299.9') -> '1.299,90'."""
    text = f"{value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):,.2f}"
    return text.replace(",", "X").replace(".", ",").replace("X", ".")


def discount_percent(price: Decimal, previous: Decimal) -> int:
    percent = (previous - price) / previous * 100
    return int(percent.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def normalize_hashtag(tag: str) -> str:
    return _INVALID_TAG_CHARS.sub("", tag.lower())


def _build(
    offer: ParsedOffer,
    title: str,
    coupon: str | None,
    link: str,
    store_name: str,
    ended: bool = False,
    priced_at: datetime | None = None,
) -> str:
    assert offer.price is not None, "format_caption requires a price"
    label = "Precio sin cupón" if offer.price_before_coupon else "Precio"
    price = format_price(offer.price)
    lines = []
    if ended:
        lines.append("❌ <b>OFERTA TERMINADA</b>")
    lines.append(f"<b>{html.escape(title)}</b>")
    lines.append(
        f"✅ {label}: <s>{price} €</s>" if ended else f"✅ {label}: <b>{price} €</b>"
    )
    if offer.previous_price is not None:
        lines.append(
            f"❌ Antes: <s>{format_price(offer.previous_price)} €</s>"
            f" (-{discount_percent(offer.price, offer.previous_price)}%)"
        )
    if coupon:
        lines.append(f"🎟️ Cupón: <code>{html.escape(coupon)}</code>")
    lines.append(f"{link_label(store_name)} {html.escape(link, quote=False)}")
    if priced_at is not None:
        lines.append(priced_at_line(priced_at))
    lines.append(AFFILIATE_LINE)
    tags = [t for t in (normalize_hashtag(h) for h in offer.hashtags) if t]
    if tags:
        lines.append("")
        lines.append(" ".join(f"#{t}" for t in tags))
    return "\n".join(lines)


def _format(
    offer: ParsedOffer,
    link: str,
    store_name: str,
    max_len: int,
    ended: bool,
    priced_at: datetime | None,
) -> str:
    """Builds the HTML caption.

    This is the last step before publishing, so every link-like token is
    removed from the title and coupon here: a caption must never carry
    someone else's link or affiliate tag. A coupon that was only a link is dropped.
    ``link`` (our affiliate URL) is the only link and is never trimmed.
    """
    title = strip_urls(offer.title)
    coupon = strip_urls(offer.coupon) if offer.coupon else None
    caption = _build(offer, title, coupon, link, store_name, ended, priced_at)
    if len(caption) <= max_len:
        return caption
    # Trim only the (unescaped) title, longest prefix that fits.
    lo, hi = 0, len(title)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        trimmed = title[:mid].rstrip() + "…"
        if len(_build(offer, trimmed, coupon, link, store_name, ended, priced_at)) <= max_len:
            lo = mid
        else:
            hi = mid - 1
    return _build(offer, title[:lo].rstrip() + "…", coupon, link, store_name, ended, priced_at)


def format_caption(
    offer: ParsedOffer,
    link: str,
    store_name: str = "Amazon",
    max_len: int = 1024,
    priced_at: datetime | None = None,
) -> str:
    """``priced_at``: when the price was read (shown in Madrid time); omitted, the time line is left out."""
    return _format(offer, link, store_name, max_len, ended=False, priced_at=priced_at)


def format_ended_caption(
    offer: ParsedOffer,
    link: str,
    store_name: str = "Amazon",
    max_len: int = 1024,
    priced_at: datetime | None = None,
) -> str:
    """Same caption with an OFERTA TERMINADA header and the price struck through."""
    return _format(offer, link, store_name, max_len, ended=True, priced_at=priced_at)
