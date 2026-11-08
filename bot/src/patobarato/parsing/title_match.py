"""Tells whether a store's product title can be the product a message talks about."""

import re
import unicodedata

# Tokens shorter than this ("de", "con", "4K"…) say nothing about the product.
MIN_TOKEN_LENGTH = 3
# Below this share of the message's tokens found in the store title, the titles disagree.
MIN_OVERLAP = 0.25

_NON_WORD = re.compile(r"[^a-z0-9]+")


def title_tokens(title: str) -> list[str]:
    """Lowercase, accent- and punctuation-free tokens of at least MIN_TOKEN_LENGTH chars."""
    folded = "".join(
        c for c in unicodedata.normalize("NFD", title.lower()) if not unicodedata.combining(c)
    )
    return [t for t in _NON_WORD.split(folded) if len(t) >= MIN_TOKEN_LENGTH]


def titles_mismatch(message_title: str, store_title: str) -> bool:
    """True when the store's product is clearly not the message's (e.g. a wrong link).

    It is a mismatch only when the message's first token (usually the brand) is missing
    from the store title AND few of the message's tokens appear in it.
    """
    message = title_tokens(message_title)
    store = set(title_tokens(store_title))
    if not message or not store:
        return False  # nothing to compare
    if message[0] in store:
        return False
    shared = len(set(message) & store)
    return shared / len(set(message)) < MIN_OVERLAP
