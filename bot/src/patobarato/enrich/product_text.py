"""Prompt and checks for the short product description and category shown on the web's deal page.

Amazon forbids misleading product claims, so the text may only use what the title says: no prices,
discounts or percentages, no absolute superlatives and no claims of having tested the product.
"""

import json
import re
from dataclasses import dataclass

CATEGORIES = (
    "tecnologia",
    "hogar",
    "belleza",
    "juguetes",
    "alimentacion",
    "deporte",
    "moda",
    "bricolaje",
    "otros",
)

MIN_CHARS = 80
MAX_CHARS = 420
SHORT_MIN_CHARS = 8
SHORT_MAX_CHARS = 70

SYSTEM = (
    "Eres redactor de PatoBarato, una web española de ofertas. Escribes en español de España, "
    "con un tono cercano, claro y honesto. Respondes siempre con un único objeto json."
)

_EXAMPLE = {
    "short_title": "Cosori freidora de aire 5,5 L",
    "description": (
        "Una freidora de aire de 5,5 litros con cesta antiadherente, pensada para cocinar para "
        "tres o cuatro personas con muy poco aceite. Sus programas automáticos facilitan el día a día "
        "y la cesta se limpia en un momento."
    ),
    "category": "hogar",
}

# Things the text must never say. Checked after generation; a hit means the answer is discarded.
FORBIDDEN = re.compile(
    r"€|%|\$|\beuros?\b|\bprecio|\bdescuento|\brebaj|\bahorr|\bofert|\bchollo|\bgratis\b"
    r"|\bel mejor\b|\bla mejor\b|\blos mejores\b|\blas mejores\b|\bmejor del mercado\b"
    r"|\bn[º°o]\.?\s?1\b|\bnúmero uno\b|\bimprescindible|\binsuperable|\bincreíble|\binmejorable"
    r"|\bhemos probado\b|\blo hemos\b|\bgarantiz|\bamazon\b|\baliexpress\b",
    re.IGNORECASE,
)


# The short name may mention a store brand (Amazon Echo) but no sales talk.
SHORT_FORBIDDEN = re.compile(
    r"€|%|\$|\bprecio|\bdescuento|\brebaj|\bofert|\bchollo|\bgratis\b|\bmejor\b|\bn[º°o]\.?\s?1\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ProductText:
    description: str
    category: str
    # None when the model gave no usable short name: the web keeps the full title.
    short_title: str | None = None


def build_prompt(title: str) -> str:
    rules = "\n".join(
        [
            "Escribe una descripción breve del producto para su ficha en la web, destacando sus virtudes.",
            "- Entre 2 y 3 frases, de 150 a 350 caracteres en total.",
            "- Usa solo lo que se deduce del título: qué es, para qué sirve y para quién es. "
            "No inventes medidas, potencias, materiales ni características que no aparezcan.",
            "- No hables de precios, descuentos, porcentajes, ofertas ni de la tienda.",
            "- Nada de superlativos absolutos («el mejor», «nº 1», «imprescindible») "
            "ni digas que lo hemos probado.",
            "- No repitas el título entero ni uses emojis, hashtags o comillas.",
            f"- category: una de {', '.join(CATEGORIES)}. Usa «otros» si ninguna encaja.",
            "- short_title: nombre corto del producto para la web, de 3 a 8 palabras y como mucho 60 "
            "caracteres: marca, modelo si lo hay y qué es, con el dato clave (capacidad, tamaño) si cabe. "
            "Sin adjetivos comerciales, sin listas de características y sin punto final.",
            "",
            "Devuelve solo un objeto json con las claves short_title, description y category, "
            "como en este ejemplo:",
            json.dumps(_EXAMPLE, ensure_ascii=False),
            "",
            f"Título del producto: {title}",
        ]
    )
    return rules


def parse_answer(answer: dict) -> ProductText | None:
    """The validated text, or None when the answer breaks a rule (the caller retries later)."""
    description = answer.get("description")
    if not isinstance(description, str):
        return None
    description = " ".join(description.split())
    if not MIN_CHARS <= len(description) <= MAX_CHARS or FORBIDDEN.search(description):
        return None
    category = answer.get("category")
    category = category.strip().lower() if isinstance(category, str) else ""
    if category not in CATEGORIES:
        category = "otros"
    return ProductText(description, category, _short_title(answer.get("short_title")))


def _short_title(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    title = " ".join(value.split()).rstrip(".")
    if not SHORT_MIN_CHARS <= len(title) <= SHORT_MAX_CHARS or SHORT_FORBIDDEN.search(title):
        return None
    return title
