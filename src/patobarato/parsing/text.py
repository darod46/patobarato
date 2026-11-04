"""Pure text parsing for Spanish deal posts: prices, coupon, title, hashtags."""

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

# --- Tunable rules -----------------------------------------------------------

# A number as written in Spanish posts: "1.299,99", "1299", "29.99", "29,99".
AMOUNT = r"\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?"
_NOT_PART_OF_NUMBER = r"(?<![\d.,])"
_NOT_PERCENT = r"(?!\d|[.,]\d|\s*%)"  # also blocks backtracking to a shorter number

# An amount with a currency: "249,99€", "249,99 €", "€249,99", "249,99 EUR".
MONEY_RE = re.compile(
    rf"{_NOT_PART_OF_NUMBER}(?:€\s*(?P<before>{AMOUNT})|(?P<after>{AMOUNT})\s*(?:€|EUR\b))"
    rf"{_NOT_PERCENT}",
    re.IGNORECASE,
)
# Bare amount (no currency), used after a "previous price" keyword.
BARE_AMOUNT_RE = re.compile(rf"{_NOT_PART_OF_NUMBER}(?:{AMOUNT}){_NOT_PERCENT}")

# Keywords (accent-free, lowercase) that introduce the previous price.
PREVIOUS_KEYWORD_RE = re.compile(
    r"\b(?:antes|pvp|precio anterior|precio habitual|era)\b"
)
# Max characters between the keyword and its amount.
PREVIOUS_GAP = 20
STRIKETHROUGH_RE = re.compile(r"~~(.*?)~~", re.DOTALL)
# Keywords (accent-free, lowercase) that make the amount right after them the price.
PRICE_KEYWORD_RE = re.compile(r"\b(?:precio|ahora|oferta)\s*[:\-]?\s*$")

COUPON_KEYWORD_RE = re.compile(r"\bcupon\b")
COUPON_CODE_RE = re.compile(r"^(?:\s*`(?P<tick>[A-Z0-9]{4,})`|[^:`]{0,25}:\s*`?(?P<code>[A-Z0-9]{4,})\b)")
COUPON_MAX_LENGTH = 60

URL_RE = re.compile(r"https?://\S+|\bwww\.\S+", re.IGNORECASE)
# Leading decoration (emojis, bullets, punctuation) before the first word character.
LEADING_NOISE_RE = re.compile(r"^[\W_]+")
# Headline formulas such as "OFERTA:" or "CHOLLO -".
TITLE_FORMULA_RE = re.compile(
    r"^(?:oferta|ofertón|oferton|chollo|chollazo|alerta|bomba|flash)\s*[:!\-–—]+\s*",
    re.IGNORECASE,
)
TITLE_TRAILING_RE = re.compile(r"[\s:\-–—|]+$")
TITLE_MAX_LENGTH = 200

HASHTAG_RE = re.compile(r"(?<!\w)#(\w+)")


@dataclass(frozen=True)
class PriceInfo:
    price: Decimal | None
    previous_price: Decimal | None
    coupon: str | None


def _fold(text: str) -> str:
    """Lowercase and strip accents, keeping the string length unchanged."""
    out = []
    for ch in unicodedata.normalize("NFC", text):
        base = "".join(c for c in unicodedata.normalize("NFD", ch) if not unicodedata.combining(c))
        base = base.lower()
        out.append(base if len(base) == 1 else ch)
    return "".join(out)


def parse_amount(raw: str) -> Decimal | None:
    s = re.sub(r"[^\d.,]", "", raw)
    if not s:
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        s = s.replace(".", "")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def _money_value(m: re.Match[str]) -> Decimal | None:
    return parse_amount(m.group("before") or m.group("after"))


def _find_previous(folded: str) -> tuple[Decimal | None, tuple[int, int] | None]:
    """Return the previous price and the span of its text, if any."""
    for m in STRIKETHROUGH_RE.finditer(folded):
        inner = MONEY_RE.search(m.group(1)) or BARE_AMOUNT_RE.search(m.group(1))
        if inner:
            start = m.start(1) + inner.start()
            value = _money_value(inner) if inner.re is MONEY_RE else parse_amount(inner.group())
            return value, (start, m.start(1) + inner.end())
    for m in PREVIOUS_KEYWORD_RE.finditer(folded):
        line_end = folded.find("\n", m.end())
        window = folded[m.end() : line_end if line_end != -1 else len(folded)]
        for pattern in (MONEY_RE, BARE_AMOUNT_RE):
            found = pattern.search(window)
            if found and found.start() <= PREVIOUS_GAP:
                value = _money_value(found) if pattern is MONEY_RE else parse_amount(found.group())
                return value, (m.end() + found.start(), m.end() + found.end())
    return None, None


def _find_price(folded: str, previous_span: tuple[int, int] | None) -> Decimal | None:
    first: Decimal | None = None
    for m in MONEY_RE.finditer(folded):
        if previous_span and m.start() < previous_span[1] and m.end() > previous_span[0]:
            continue
        value = _money_value(m)
        if value is None:
            continue
        if PRICE_KEYWORD_RE.search(folded[: m.start()]):
            return value
        if first is None:
            first = value
    return first


def _find_coupon(text: str, folded: str) -> str | None:
    for m in COUPON_KEYWORD_RE.finditer(folded):
        line_end = text.find("\n", m.end())
        rest = text[m.end() : line_end if line_end != -1 else len(text)]
        code = COUPON_CODE_RE.match(rest)
        if code:
            return code.group("tick") or code.group("code")
        description = rest.strip(" \t:-–—`")
        if description:
            return description[:COUPON_MAX_LENGTH].rstrip()
    return None


def parse_prices(text: str) -> PriceInfo:
    folded = _fold(text)
    previous, span = _find_previous(folded)
    price = _find_price(folded, span)
    if price is None or (previous is not None and previous <= price):
        previous = None
    return PriceInfo(price, previous, _find_coupon(unicodedata.normalize("NFC", text), folded))


def parse_title(text: str) -> str:
    for line in text.splitlines():
        line = URL_RE.sub("", line)
        line = MONEY_RE.sub("", line)
        line = LEADING_NOISE_RE.sub("", line)
        line = TITLE_FORMULA_RE.sub("", line)
        line = TITLE_TRAILING_RE.sub("", " ".join(line.split()))
        if line:
            return line[:TITLE_MAX_LENGTH].rstrip()
    return ""


def parse_hashtags(text: str) -> list[str]:
    seen: dict[str, None] = {}
    for tag in HASHTAG_RE.findall(text):
        seen.setdefault(tag.lower(), None)
    return list(seen)
