"""Pure text parsing for Spanish deal posts: prices, coupon, title, hashtags."""

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from patobarato.stores.names import STORE_ALIASES, store_for_alias

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
STRIKE_MARK = "~~"  # added by the listener around strikethrough text
STRIKETHROUGH_RE = re.compile(r"~~(.*?)~~", re.DOTALL)
# Keywords (accent-free, lowercase) that make the amount right after them the price.
PRICE_KEYWORD_RE = re.compile(r"\b(?:precio final|precio|ahora|oferta)\s*[:\-]?\s*$")
# "Precio <store>", "Precio en <store>", "PVP <store>": when <store> is a known store other
# than the offer's own, the amount is that store's reference price, neither the deal
# price nor its previous price. Unknown words ("Precio Prime 19,99€") change nothing.
_STORE_ALIAS_RE = "|".join(
    r"\s+".join(map(re.escape, alias.split()))
    for alias in sorted(
        {a for aliases in STORE_ALIASES.values() for a in aliases}, key=len, reverse=True
    )
)
REFERENCE_STORE_RE = re.compile(
    rf"\b(?:precio|pvp)\s+(?:(?:en|de|del)\s+)?(?P<store>{_STORE_ALIAS_RE})\b"
)
# Max characters between the store name and its amount.
REFERENCE_GAP = 20
# An amount followed by one of these (accent-free, lowercase) is a discount, not a price.
DISCOUNT_SUFFIX_RE = re.compile(r"\s*(?:de\s+)?(?:descuento|dto)\b")

COUPON_KEYWORD_RE = re.compile(r"\bcupon\b")
COUPON_CODE_RE = re.compile(r"^(?:\s*`(?P<tick>[A-Z0-9]{4,})`|[^:`]{0,25}:\s*`?(?P<code>[A-Z0-9]{4,})\b)")
COUPON_MAX_LENGTH = 60

# Common TLDs of deal links; a bare "name.tld" with one of these is a link.
_LINK_TLDS = r"es|com|net|org|eu|to|ly|co|io|me|gl|link|info|shop|store|de|fr|it|uk"
URL_RE = re.compile(
    r"https?://\S+"
    r"|\bwww\.\S+"
    r"|\b(?:[a-z0-9-]+\.)+[a-z]{2,}/\S*"  # domain.tld/path, e.g. amzn.to/3abcd
    rf"|\b(?:[a-z0-9-]+\.)+(?:{_LINK_TLDS})\b(?![.\-])(?:[?#]\S*)?"  # bare domain.tld
    r"|\S*[?&]tag=\S*",  # any leftover affiliate parameter
    re.IGNORECASE,
)
# Leading decoration (emojis, bullets, punctuation) before the first word character.
LEADING_NOISE_RE = re.compile(r"^[\W_]+")
# Headline formulas such as "OFERTA:" or "CHOLLO -".
TITLE_FORMULA_RE = re.compile(
    r"^(?:oferta|ofertón|oferton|chollo|chollazo|alerta|bomba|flash)\s*[:!\-–—]+\s*",
    re.IGNORECASE,
)
TITLE_TRAILING_RE = re.compile(r"[\s:\-–—|]+$")
# Symbols kept in titles even though Unicode classes them like emojis.
_KEPT_SYMBOLS = frozenset("©®™°")
# Invisible emoji joiners / presentation selectors.
_EMOJI_GLUE = frozenset("\u200d\ufe0e\ufe0f")
# Marketing sentences: "Lead-in: Esta depiladora X es tu mejor aliada…" or
# "Este robot X está rebajado…". The product follows the demonstrative.
_DEMONSTRATIVE = r"(?:este|esta|estos|estas|esto)"
TITLE_LEAD_IN_RE = re.compile(rf"^(?:[^:]{{3,80}}:\s+)?{_DEMONSTRATIVE}\s+(?P<product>.+)$", re.IGNORECASE)
# Where the sales pitch starts after the product name in such sentences.
TITLE_PITCH_RE = re.compile(
    r"\s+(?:es|está|están|son|hoy|ahora|baja|bajan|se\s+queda|cae|vuelve)\b.*$",
    re.IGNORECASE,
)
TITLE_MAX_LENGTH = 200
# "Durex ▫️ Lubricante…": white small square (optionally with the emoji selector)
# between brand and product.
BRAND_SEPARATOR_RE = re.compile("\\s*\u25ab\ufe0f?\\s*")

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


Span = tuple[int, int]


def _overlaps(start: int, end: int, spans: list[Span]) -> bool:
    return any(start < span_end and end > span_start for span_start, span_end in spans)


def _reference_spans(folded: str, own_store: str | None) -> list[Span]:
    """Spans of amounts quoted as another store's price ("Precio MediaMarkt: 25€")."""
    spans: list[Span] = []
    for m in REFERENCE_STORE_RE.finditer(folded):
        if store_for_alias(m.group("store")) == own_store:
            continue
        line_end = folded.find("\n", m.end())
        window = folded[m.end() : line_end if line_end != -1 else len(folded)]
        found = MONEY_RE.search(window) or BARE_AMOUNT_RE.search(window)
        if found and found.start() <= REFERENCE_GAP:
            spans.append((m.end() + found.start(), m.end() + found.end()))
    return spans


def _find_previous(folded: str, excluded: list[Span]) -> tuple[Decimal | None, Span | None]:
    """Return the previous price and the span of its text, if any (not in ``excluded``)."""
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
            if found and _overlaps(m.end() + found.start(), m.end() + found.end(), excluded):
                break
            if found and found.start() <= PREVIOUS_GAP:
                value = _money_value(found) if pattern is MONEY_RE else parse_amount(found.group())
                return value, (m.end() + found.start(), m.end() + found.end())
    return None, None


def _find_price(folded: str, excluded: list[Span]) -> Decimal | None:
    first: Decimal | None = None
    for m in MONEY_RE.finditer(folded):
        if _overlaps(m.start(), m.end(), excluded):
            continue
        value = _money_value(m)
        if value is None or value <= 0:
            continue
        if DISCOUNT_SUFFIX_RE.match(folded, m.end()):
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
        description = " ".join(rest.replace(STRIKE_MARK, "").split()).strip(" \t:-–—`")
        if description:
            return description[:COUPON_MAX_LENGTH].rstrip()
    return None


def parse_prices(text: str, own_store: str | None = None) -> PriceInfo:
    """Prices in a post; ``own_store`` (a store id) is the store the deal is for."""
    folded = _fold(text)
    references = _reference_spans(folded, own_store)
    previous, span = _find_previous(folded, references)
    price = _find_price(folded, references + ([span] if span else []))
    if price is None or (previous is not None and previous <= price):
        previous = None
    return PriceInfo(price, previous, _find_coupon(unicodedata.normalize("NFC", text), folded))


def _strip_emojis(text: str) -> str:
    return "".join(
        ch
        for ch in text
        if ch in _KEPT_SYMBOLS
        or (ch not in _EMOJI_GLUE and unicodedata.category(ch) not in ("So", "Sk", "Cs"))
    )


def _strip_marketing(title: str) -> str:
    """Turns a sales sentence into the product name it talks about."""
    match = TITLE_LEAD_IN_RE.match(title)
    if not match:
        return title
    product = TITLE_PITCH_RE.sub("", match.group("product")).strip()
    if len(product.split()) < 2:
        return title
    return product[0].upper() + product[1:]


def _clean_title_line(line: str) -> str:
    line = URL_RE.sub("", line)
    line = MONEY_RE.sub("", line).replace(STRIKE_MARK, "")
    line = _strip_emojis(line)
    line = LEADING_NOISE_RE.sub("", line)
    line = TITLE_FORMULA_RE.sub("", line)
    line = TITLE_TRAILING_RE.sub("", " ".join(line.split()))
    line = _strip_marketing(line)
    return line[:TITLE_MAX_LENGTH].rstrip()


def _is_brand_line(line: str) -> bool:
    """A "Brand ▫️ Product" line has text on both sides; a leading/trailing ▫️ is a bullet."""
    parts = BRAND_SEPARATOR_RE.split(line, maxsplit=1)
    return len(parts) == 2 and all(re.search(r"\w", _strip_emojis(p)) for p in parts)


def parse_title(text: str) -> str:
    lines = text.splitlines()
    # "Brand ▫️ Product" names the product, whatever headline comes before it.
    for line in lines:
        if _is_brand_line(line):
            title = _clean_title_line(BRAND_SEPARATOR_RE.sub(" ", line))
            if title:
                return title
    for line in lines:
        title = _clean_title_line(line)
        if title:
            return title
    return ""


def strip_urls(text: str) -> str:
    """Removes every link-like token (with or without scheme) and tidies spaces."""
    return " ".join(URL_RE.sub(" ", text).split())


def parse_hashtags(text: str) -> list[str]:
    seen: dict[str, None] = {}
    for tag in HASHTAG_RE.findall(text):
        seen.setdefault(tag.lower(), None)
    return list(seen)
