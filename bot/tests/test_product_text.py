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
