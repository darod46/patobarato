import pytest

from patobarato.parsing.title_match import title_tokens, titles_mismatch


def test_tokens_are_normalised_and_short_ones_dropped():
    assert title_tokens("Raqueta de Pádel, SYMINO!") == ["raqueta", "padel", "symino"]


def test_symino_racket_vs_nothing_headphones_is_a_mismatch():
    assert titles_mismatch(
        "SYMINO Raqueta de Pádel de fibra de carbono",
        "Nothing Ear (a) Auriculares inalámbricos con cancelación de ruido",
    )


def test_same_brand_with_different_wording_matches():
    assert not titles_mismatch(
        "Zeblaze Btalk PRO - Reloj Inteligente con llamadas",
        'Zeblaze Btalk Pro Smartwatch 1.91" HD Display Bluetooth Calling',
    )


def test_spanish_vs_english_title_with_the_same_brand_matches():
    assert not titles_mismatch(
        "Baseus Cargador rápido de 65W con 3 puertos",
        "Baseus 65W GaN Fast Charger USB C PD Quick Charge",
    )


def test_brand_missing_but_enough_shared_words_matches():
    assert not titles_mismatch(
        "Auriculares Bluetooth inalámbricos deportivos",
        "QCY Auriculares Bluetooth inalámbricos",
    )


@pytest.mark.parametrize("message, store", [("", "Nothing Ear (a)"), ("Raqueta", ""), ("!!", "x")])
def test_nothing_to_compare_is_not_a_mismatch(message, store):
    assert not titles_mismatch(message, store)
