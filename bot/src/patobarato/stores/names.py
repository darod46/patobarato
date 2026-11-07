"""How deal posts name stores: registered ones and common Spanish retailers.

Keys are store ids (the registry's for registered stores); aliases are
lowercase and accent-free, words separated by single spaces.
"""

STORE_ALIASES: dict[str, tuple[str, ...]] = {
    "amazon": ("amazon",),
    "aliexpress": ("aliexpress", "ali express"),
    "elcorteingles": ("elcorteingles", "el corte ingles", "corte ingles", "eci"),
    "mediamarkt": ("mediamarkt", "media markt"),
    "pccomponentes": ("pccomponentes", "pc componentes"),
    "carrefour": ("carrefour",),
    "fnac": ("fnac",),
    "worten": ("worten",),
    "lidl": ("lidl",),
    "decathlon": ("decathlon",),
    "alcampo": ("alcampo",),
    "leroymerlin": ("leroy merlin", "leroymerlin"),
    "ikea": ("ikea",),
    "ebay": ("ebay",),
    "miravia": ("miravia",),
    "temu": ("temu",),
    "shein": ("shein",),
    "coolmod": ("coolmod",),
    "pcbox": ("pcbox",),
    "phonehouse": ("phone house", "phonehouse"),
    "druni": ("druni",),
    "primor": ("primor",),
    "sprinter": ("sprinter",),
    "zalando": ("zalando",),
    "conforama": ("conforama",),
    "eroski": ("eroski",),
    "mercadona": ("mercadona",),
}


def store_for_alias(alias: str) -> str | None:
    """The store id an alias (lowercase, accent-free) names, if any."""
    wanted = " ".join(alias.split())
    for store_id, aliases in STORE_ALIASES.items():
        if wanted in aliases:
            return store_id
    return None
