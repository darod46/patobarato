import logging

import httpx
import pytest

from patobarato.stores.awin import AWIN_HOSTS, AWIN_NAMES, AwinStore, awin_store

URL = "https://www.pccomponentes.com/ninja-af300-freidora-de-aire"


def make(merchant_id=None, publisher_id=None, http=None) -> AwinStore:
    return awin_store("pccomponentes", merchant_id, publisher_id, http)


def test_constants():
    assert AWIN_HOSTS == {
        "pccomponentes": ["pccomponentes.com"],
        "mediamarkt": ["mediamarkt.es"],
        "elcorteingles": ["elcorteingles.es"],
    }
    assert set(AWIN_NAMES) == set(AWIN_HOSTS)


def test_identity():
    s = make()
    assert (s.id, s.name, s.country) == ("pccomponentes", AWIN_NAMES["pccomponentes"], "ES")


def test_matches():
    s = make()
    assert s.matches("https://pccomponentes.com/x")
    assert s.matches(URL)
    assert not s.matches("https://www.mediamarkt.es/x")
    assert not s.matches("https://notpccomponentes.com/x")


def test_product_id():
    s = make()
    assert s.product_id(URL + "?utm_source=x") == "ninja-af300-freidora-de-aire"
    assert s.product_id(URL + "/") == "ninja-af300-freidora-de-aire"
    assert s.product_id("https://www.mediamarkt.es/es/product/_tv-123.html") == "_tv-123"
    assert s.product_id("https://www.pccomponentes.com/") is None


def test_product_id_is_percent_decoded():
    s = make()
    assert s.product_id("https://www.pccomponentes.com/camiseta-ni%C3%B1o") == "camiseta-niño"
    assert s.canonical_url("camiseta-niño", "ES") == "https://pccomponentes.com/camiseta-ni%C3%B1o"


def test_canonical_for_strips_tracking():
    s = make()
    url = URL + "/?a=1&utm_source=x&awc=9&b=2&gclid=g&fbclid=f&utm_medium=m#frag"
    assert s.canonical_for(url, "ES") == URL + "?a=1&b=2"
    assert s.canonical_for("https://www.pccomponentes.com/?utm_x=1", "ES") == "https://www.pccomponentes.com/"


def test_canonical_url_last_resort():
    assert make().canonical_url("abc", "ES") == "https://pccomponentes.com/abc"


async def test_affiliate_url():
    s = make(1234, "5678")
    assert await s.affiliate_url(URL, "p") == (
        "https://www.awin1.com/cread.php?awinmid=1234&awinaffid=5678"
        "&ued=https%3A%2F%2Fwww.pccomponentes.com%2Fninja-af300-freidora-de-aire"
    )


async def test_affiliate_missing_returns_canonical_and_warns_once(caplog):
    s = make(None, "5678")
    with caplog.at_level(logging.WARNING):
        assert await s.affiliate_url(URL, "p") == URL
        assert await s.affiliate_url(URL, "p") == URL
    msgs = [r.getMessage() for r in caplog.records if "affiliate=missing" in r.getMessage()]
    assert len(msgs) == 1 and "store=pccomponentes" in msgs[0]


async def test_find_image():
    http = httpx.AsyncClient(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, text='<meta property="og:image" content="https://i.example/a.jpg">')
        )
    )
    assert await make(http=http).find_image("p", URL) == "https://i.example/a.jpg"
    assert await make(http=None).find_image("p", URL) is None
