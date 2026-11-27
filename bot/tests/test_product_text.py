import pytest

from patobarato.enrich.product_text import CATEGORIES, build_prompt, parse_answer

GOOD = (
    "Una aspiradora sin cable ligera y fácil de manejar, pensada para repasar la casa a diario sin "
    "enchufes de por medio. Su depósito se vacía en un gesto."
)


def test_prompt_asks_for_json_with_an_example_and_the_title():
    prompt = build_prompt("Cecotec Conga 1500")
    assert "json" in prompt
    assert '"category"' in prompt and '"description"' in prompt
    assert prompt.rstrip().endswith("Título del producto: Cecotec Conga 1500")
    for key in CATEGORIES:
        assert key in prompt


def test_valid_answer_is_trimmed_and_kept():
    text = parse_answer({"description": "  " + GOOD.replace(" ", "  ", 1), "category": " Hogar "})
    assert text is not None
    assert text.description == GOOD
    assert text.category == "hogar"


def test_short_title_is_kept_trimmed_or_dropped():
    text = parse_answer({"description": GOOD, "category": "hogar", "short_title": "  Cecotec Conga 1500 robot aspirador. "})
    assert text.short_title == "Cecotec Conga 1500 robot aspirador"
    assert parse_answer({"description": GOOD, "short_title": "Amazon Echo Dot 5.ª generación"}).short_title == (
        "Amazon Echo Dot 5.ª generación"
    )
    for bad in (None, 3, "Tv", "x" * 71, "Oferta Cecotec Conga", "Conga 1500 al mejor precio", "Conga -30%"):
        text = parse_answer({"description": GOOD, "category": "hogar", "short_title": bad})
        assert text is not None and text.short_title is None


def test_prompt_asks_for_a_short_title():
    prompt = build_prompt("Cecotec Conga 1500")
    assert '"short_title"' in prompt and "short_title:" in prompt


def test_unknown_category_becomes_otros():
    assert parse_answer({"description": GOOD, "category": "jardín"}).category == "otros"
    assert parse_answer({"description": GOOD}).category == "otros"


@pytest.mark.parametrize(
    "bad",
    [
        GOOD + " Ahora por solo 19,99 €.",
        GOOD + " Con un 30 % de descuento.",
        GOOD + " Es la mejor del mercado.",
        GOOD + " Un imprescindible en casa.",
        GOOD + " Lo hemos probado y nos encanta.",
        GOOD + " Una oferta que no puedes dejar pasar.",
        GOOD + " Disponible en Amazon.",
        "Muy buena.",
        "x" * 500,
    ],
)
def test_answers_breaking_a_rule_are_rejected(bad):
    assert parse_answer({"description": bad, "category": "hogar"}) is None


def test_missing_or_non_text_description_is_rejected():
    assert parse_answer({"category": "hogar"}) is None
    assert parse_answer({"description": 12, "category": "hogar"}) is None
