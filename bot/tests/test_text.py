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


@pytest.mark.parametrize(
    ("name", "title"),
    [
        ("a", "Durex Lubricante Original H2O 100 ml"),
        ("b", "Skechers Slip-ins Summits Rosa Ros"),
        ("c", "Xiaomi Power Bank 10000mAh 22.5W Lite, Ligera y Portátil, Potencia Máxima de 22,5 W"),
    ],
)
def test_title_from_brand_separator_line(name, title):
    assert parse_title(_cazachollazos(name)) == title


def test_brand_separator_without_variation_selector():
    assert parse_title("Top ventas\nAnker ▫ Cargador 65W 25€") == "Anker Cargador 65W"


def test_brand_separator_title_is_capped():
    assert len(parse_title("Oferta\nMarca ▫️ " + "x" * 300)) == 200


@pytest.mark.parametrize(
    ("text", "price"),
    [
        ("Precio en Amazon: 19,99€", Decimal("19.99")),
        ("Precio Amazon 19,99€", Decimal("19.99")),
        ("Precio con cupón: 12€", Decimal("12")),
        ("Precio Prime 19,99€", Decimal("19.99")),
        ("Precio Black Friday 49€", Decimal("49")),
        ("Precio por unidad 2€", Decimal("2")),
        ("Precio con descuento 9€", Decimal("9")),
        ("Precio aplicando cupón 12€", Decimal("12")),
        ("Precio Mediamarkt 30€ / Amazon 25€", Decimal("25")),
    ],
)
def test_own_store_and_unknown_words_keep_the_price(text, price):
    assert parse_prices(text, own_store="amazon").price == price


def test_own_store_reference_is_the_deal_price():
    assert parse_prices("Precio Mediamarkt 30€ / Amazon 25€", own_store="mediamarkt").price == Decimal("30")


def test_other_store_price_ignored_with_own_store():
    assert parse_prices(_cazachollazos("a"), own_store="amazon").price is None
    assert parse_prices("Precio en Fnac: 30€\nCascos 25€", own_store="amazon").price == Decimal("25")


@pytest.mark.parametrize(
    ("text", "title"),
    [
        ("Auriculares Sony WH-1000XM5\n▫️ Precio: 199€\n▫️ Envío gratis", "Auriculares Sony WH-1000XM5"),
        ("Cascos Sony 50€\n▫️ Envío gratis", "Cascos Sony"),
        ("Cascos Sony 50€\n🔥 ▫️ Envío gratis", "Cascos Sony"),
        ("Cascos Sony 50€\nEnvío gratis ▫️", "Cascos Sony"),
    ],
)
def test_brand_separator_used_as_bullet_is_not_a_title(text, title):
    assert parse_title(text) == title


def test_aliexpress_apply_coupon_line():
    text = (
        "🔥 PRECIAZO!\n❗️Aplicar cupón: AEES03\n🚚 Envío gratis\n\n"
        "SYMINO ▫️ Raqueta de Pádel\n\n🔗 Link: https://s.click.aliexpress.com/e/_c3ifBofV\n\n📢 #pub"
    )
    info = parse_prices(text, "aliexpress")
    assert info.coupon == "AEES03"
    assert info.price is None


MINI_PC = (
    "🔥 PRECIAZO!\n❗️Aplicar cupón de 8€: AEES08\n🚚 Envío gratis\n\n"
    "EU Computer ▫️ Mini PC Intel N150, 16GB RAM, 256GB SSD, Windows 11 Pro, Wifi6, BT5.2\n\n"
    "🔗 Link: https://s.click.aliexpress.com/e/_c3n479AB\n\n📢 #pub"
)


def test_coupon_amount_is_not_the_price():
    info = parse_prices(MINI_PC, "aliexpress")
    assert info.price is None
    assert info.previous_price is None
    assert info.coupon == "AEES08"


@pytest.mark.parametrize(
    "line",
    [
        "Aplicar cupón de 8€: AEES08",
        "Cupón 5€: AHORRA5",
        "Descuento de 10€ con el código PROMO10",
        "Código PROMO10 -10€",
    ],
)
def test_amounts_on_coupon_lines_are_ignored(line):
    info = parse_prices(f"Mini PC\n{line}", "aliexpress")
    assert info.price is None
    assert info.previous_price is None


def test_real_price_kept_next_to_a_coupon_amount_line():
    text = "Mini PC 129,99€\nAntes: 199,99€\nAplicar cupón de 8€: AEES08"
    info = parse_prices(text, "aliexpress")
    assert info.price == Decimal("129.99")
    assert info.previous_price == Decimal("199.99")
    assert info.coupon == "AEES08"


def test_coupon_amount_line_before_the_price_keeps_the_real_price():
    text = "Cupón de 8€: AEES08\nPrecio: 121,99€"
    assert parse_prices(text, "aliexpress").price == Decimal("121.99")


@pytest.mark.parametrize("text", ["Precio con cupón 19,99€", "Precio con cupón: 19,99€"])
def test_price_with_coupon_is_still_the_price(text):
    assert parse_prices(text).price == Decimal("19.99")
