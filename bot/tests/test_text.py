from decimal import Decimal
from pathlib import Path

import pytest

from patobarato.parsing.text import (
    PriceInfo,
    parse_amount,
    parse_hashtags,
    parse_prices,
    parse_title,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1.299,99", Decimal("1299.99")),
        ("1299", Decimal("1299")),
        ("29.99", Decimal("29.99")),
        ("29,99", Decimal("29.99")),
        ("1.299", Decimal("1299")),
    ],
)
def test_parse_amount_formats(raw, expected):
    assert parse_amount(raw) == expected


def test_parse_amount_invalid():
    assert parse_amount("abc") is None


def test_price_and_previous():
    text = "🔥 Sony WH-1000XM5\n✅ Ahora: 249,99€\n❌ Antes: 419,99€\nhttps://amzn.to/x"
    assert parse_prices(text) == PriceInfo(Decimal("249.99"), Decimal("419.99"), None)


def test_pvp_thousands():
    info = parse_prices("Portátil Lenovo 1.099€ (PVP 1.299,00 €)")
    assert info.price == Decimal("1099")
    assert info.previous_price == Decimal("1299.00")


def test_percentage_not_price():
    assert parse_prices("-40% Auriculares a 29,99 €").price == Decimal("29.99")


def test_incoherent_previous_dropped():
    info = parse_prices("Precio: 30€ Antes: 25€")
    assert info.price == Decimal("30")
    assert info.previous_price is None


def test_strikethrough_previous():
    info = parse_prices("Ratón 19,99€ ~~34,99€~~")
    assert info.price == Decimal("19.99")
    assert info.previous_price == Decimal("34.99")


def test_euro_before_number_and_priority_keyword():
    info = parse_prices("Envío 4,99€\nOferta: €15,50")
    assert info.price == Decimal("15.50")


def test_no_price():
    assert parse_prices("Mirad esta maravilla https://amzn.to/x").price is None


def test_coupon_code():
    assert parse_prices("Cupón: SONY10").coupon == "SONY10"


def test_coupon_backticks():
    assert parse_prices("Usa el cupón `AHORRA5X` al pagar").coupon == "AHORRA5X"


def test_coupon_description():
    assert "5 €" in parse_prices("Aplica el cupón de 5 € en la página").coupon


def test_coupon_description_truncated():
    coupon = parse_prices("Cupón: " + "marca la casilla " * 10).coupon
    assert len(coupon) <= 60


def test_no_coupon():
    assert parse_prices("Auriculares 29,99€").coupon is None


def test_title_strips_noise():
    title = parse_title("🔥🔥 Auriculares Sony WH-1000XM5 a 249,99€ https://amzn.to/x\nmás texto")
    assert "Sony WH-1000XM5" in title and "€" not in title and "http" not in title


def test_title_strips_formula_and_skips_url_line():
    assert parse_title("https://amzn.to/x\n🔥 OFERTA: Cafetera Philips") == "Cafetera Philips"


def test_title_empty():
    assert parse_title("https://amzn.to/x") == ""


def test_title_truncated():
    assert len(parse_title("a" * 300)) == 200


def test_hashtags():
    assert parse_hashtags("#Auriculares #sony #auriculares") == ["auriculares", "sony"]


def test_percentage_not_previous_price():
    info = parse_prices("Auriculares 3€\nAntes 50%")
    assert info.price == Decimal("3")
    assert info.previous_price is None


# --- I3: scheme-less links in titles ------------------------------------------


def test_title_strips_schemeless_links():
    assert parse_title("amzn.to/3abcd Auriculares Sony 29,99€") == "Auriculares Sony"
    title = parse_title("Ver en amazon.es/dp/B000000000?tag=otro-21\n9,99€")
    assert title == "Ver en"


def test_title_keeps_versions_and_model_names():
    assert parse_title("Sony WH-1000XM5 v2.0 negro 29,99€") == "Sony WH-1000XM5 v2.0 negro"


# --- M10: price sanity -----------------------------------------------------------


def test_zero_price_rejected():
    assert parse_prices("Regalo 0€").price is None
    assert parse_prices("Gratis 0,00€").price is None


def test_zero_amount_skipped_for_next_price():
    assert parse_prices("Envío 0€\nAuriculares 19,99€").price == Decimal("19.99")


def test_discount_amount_is_not_price():
    info = parse_prices("Auriculares 5€ de descuento con cupón\n19,99€")
    assert info.price == Decimal("19.99")


@pytest.mark.parametrize("suffix", ["dto", "de dto", "de descuento", "DTO."])
def test_discount_suffixes(suffix):
    assert parse_prices(f"Ratón 3€ {suffix}\nAhora 9,99€").price == Decimal("9.99")
    assert parse_prices(f"Ratón 3€ {suffix} y 9,99€").price == Decimal("9.99")


def test_precio_final_keyword():
    assert parse_prices("Pack 2x 3€\nPrecio final 12,50€").price == Decimal("12.50")


def test_title_drops_strikethrough_markers():
    assert parse_title("Auriculares Sony ~~49,99€~~ 29,99€") == "Auriculares Sony"


def test_title_keeps_struck_words_without_markers():
    assert parse_title("~~Ratón~~ Teclado Logitech 19,99€") == "Ratón Teclado Logitech"


def test_coupon_description_drops_strikethrough_markers():
    info = parse_prices("Cafetera 59,99€\nCupón: ~~5€~~ 10€ de descuento")
    assert info.coupon is not None and "~~" not in info.coupon


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("✨Joma - Camiseta Deportiva Manga Larga Hombre✨\n\n💶precio oferta 9,99€", "Joma - Camiseta Deportiva Manga Larga Hombre"),
        ("✨Cecotec Accesorios Freidora de aire ✨\n💶precio oferta 13,90€", "Cecotec Accesorios Freidora de aire"),
        ("Auriculares 🎧 Sony WH-1000XM5 🔥 29,99€", "Auriculares Sony WH-1000XM5"),
        ("Cable USB-C (2 m) 9,99€", "Cable USB-C (2 m)"),
    ],
)
def test_title_drops_emojis_anywhere(raw, expected):
    assert parse_title(raw) == expected


def test_title_drops_marketing_lead_in_and_sales_clause():
    raw = (
        "🍊 Resultados profesionales en casa: Esta depiladora IPL Braun Silk-Expert Pro 5 "
        "es tu mejor aliada contra el vello y hoy baja a precio mínimo en Amazon\n"
        "💰 299,99 € ~~441,55 €~~ (-32%)"
    )
    assert parse_title(raw) == "Depiladora IPL Braun Silk-Expert Pro 5"


def test_title_starting_with_demonstrative_keeps_the_product():
    raw = "Este robot aspirador Roborock Q7 Max está rebajadísimo hoy 199€"
    assert parse_title(raw) == "Robot aspirador Roborock Q7 Max"


def test_title_with_colon_but_no_lead_in_is_kept():
    assert parse_title("Xiaomi Redmi Note 13: 8GB + 256GB 189€") == "Xiaomi Redmi Note 13: 8GB + 256GB"


CAZACHOLLAZOS = Path(__file__).parent / "fixtures"


def _cazachollazos(name: str) -> str:
    return (CAZACHOLLAZOS / f"cazachollazos_{name}.txt").read_text("utf-8")


def test_other_store_reference_price_is_not_the_deal_price():
    info = parse_prices(_cazachollazos("a"))
    assert (info.price, info.previous_price) == (None, None)


@pytest.mark.parametrize(
    ("text", "price"),
    [
        ("Precio en MediaMarkt: 25€", None),
        ("Auriculares 19,99€\nPrecio en MediaMarkt: 25€", Decimal("19.99")),
        ("Precio en MediaMarkt: 25€\nAuriculares a 19,99€", Decimal("19.99")),
        ("PVP Carrefour 30€", None),
        ("Precio El Corte Inglés: 40€ y aquí 29,99€", Decimal("29.99")),
    ],
)
def test_reference_store_prices_are_ignored(text, price):
    info = parse_prices(text)
    assert (info.price, info.previous_price) == (price, None)


def test_reference_store_pvp_is_not_the_previous_price():
    assert parse_prices("Cascos 20€ PVP Carrefour 30€") == PriceInfo(Decimal("20"), None, None)


@pytest.mark.parametrize(
    ("text", "price", "previous"),
    [
        ("Precio oferta 9,99€", Decimal("9.99"), None),
        ("Precio final: 12,50€", Decimal("12.50"), None),
        ("Precio actual 15€ precio habitual 20€", Decimal("15"), Decimal("20")),
        ("Precio mínimo 7€", Decimal("7"), None),
        ("Precio de 25€", Decimal("25"), None),
        ("Ratón 10€ PVP recomendado 18€", Decimal("10"), Decimal("18")),
    ],
)
def test_generic_price_words_are_not_stores(text, price, previous):
    info = parse_prices(text)
    assert (info.price, info.previous_price) == (price, previous)
