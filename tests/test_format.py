from decimal import Decimal

from patobarato.models import ParsedOffer
from patobarato.publishing.format import (
    BUTTON_TEXT,
    discount_percent,
    format_caption,
    format_price,
)


def make_offer(**overrides) -> ParsedOffer:
    data = dict(
        asin="B09XS7JWHH",
        country="ES",
        store="amazon.es",
        title="Sony WH-1000XM5",
        price=Decimal("249.99"),
        previous_price=None,
        coupon=None,
        hashtags=[],
        canonical_url="https://www.amazon.es/dp/B09XS7JWHH?tag=patobarato-21",
    )
    data.update(overrides)
    return ParsedOffer(**data)


def test_full_caption():
    offer = make_offer(
        previous_price=Decimal("419.99"),
        coupon="SONY10",
        hashtags=["auriculares", "sony"],
    )
    assert format_caption(offer) == (
        "🦆 <b>Sony WH-1000XM5</b>\n"
        "✅ Precio: <b>249,99 €</b>\n"
        "❌ Antes: <s>419,99 €</s> (-40%)\n"
        "🎟️ Cupón: <code>SONY10</code>\n"
        "\n"
        "#auriculares #sony"
    )


def test_minimal_caption():
    caption = format_caption(make_offer())
    assert caption.split("\n") == [
        "🦆 <b>Sony WH-1000XM5</b>",
        "✅ Precio: <b>249,99 €</b>",
    ]


def test_html_escaped():
    caption = format_caption(make_offer(title="Cable <USB> & más"))
    assert "Cable &lt;USB&gt; &amp; más" in caption


def test_long_title_trimmed():
    caption = format_caption(make_offer(title="a" * 2000))
    assert len(caption) <= 1024
    lines = caption.split("\n")
    assert lines[1] == "✅ Precio: <b>249,99 €</b>"
    assert lines[0].endswith("…</b>")


def test_long_title_with_escapes_trimmed():
    caption = format_caption(make_offer(title="&<" * 1000), max_len=200)
    assert len(caption) <= 200
    assert "&amp;&lt;" in caption


def test_hashtags_normalized_and_empty_dropped():
    caption = format_caption(make_offer(hashtags=["#Café", "Ñandú!", "***"]))
    assert caption.endswith("\n\n#caf #ñandú") or caption.endswith("\n\n#café #ñandú")
    assert "#café #ñandú" in caption


def test_format_price_thousands():
    assert format_price(Decimal("1299.9")) == "1.299,90"


def test_format_price_small():
    assert format_price(Decimal("5")) == "5,00"


def test_discount_percent_rounds():
    assert discount_percent(Decimal("249.99"), Decimal("419.99")) == 40
    assert discount_percent(Decimal("66.5"), Decimal("100")) == 34


def test_button_text():
    assert BUTTON_TEXT == "🛒 Ver en Amazon"
