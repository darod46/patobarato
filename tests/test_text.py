from decimal import Decimal

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
