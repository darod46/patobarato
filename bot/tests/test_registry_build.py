import logging
from types import SimpleNamespace

import httpx

from patobarato.stores.registry import build_registry


def _settings(**kw):
    base = dict(
        affiliate_tag="patobarato-21",
        aliexpress_app_key=None,
        aliexpress_app_secret=None,
        aliexpress_tracking_id=None,
        awin_publisher_id=None,
        awin_merchants={"pccomponentes": None, "mediamarkt": 77},
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_without_aliexpress_credentials_it_is_not_registered(caplog):
    with caplog.at_level(logging.INFO, logger="patobarato.stores"):
        registry = build_registry(_settings(), httpx.AsyncClient(), httpx.AsyncClient())
    assert "aliexpress" not in registry.ids
    assert registry.ids == ["amazon", "pccomponentes", "mediamarkt"]
    assert any(
        r.levelno == logging.WARNING and "aliexpress" in r.getMessage() for r in caplog.records
    )


def test_partial_aliexpress_credentials_not_enough():
    registry = build_registry(
        _settings(aliexpress_app_key="k", aliexpress_app_secret="s"),
        httpx.AsyncClient(),
        httpx.AsyncClient(),
    )
    assert "aliexpress" not in registry.ids


def test_full_aliexpress_credentials_register_it_after_amazon(caplog):
    with caplog.at_level(logging.INFO):
        registry = build_registry(
            _settings(
                aliexpress_app_key="KEY",
                aliexpress_app_secret="SECRETVALUE",
                aliexpress_tracking_id="trk",
            ),
            httpx.AsyncClient(),
            httpx.AsyncClient(),
        )
    assert registry.ids[:2] == ["amazon", "aliexpress"]
    assert "SECRETVALUE" not in caplog.text
