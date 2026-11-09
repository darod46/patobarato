"""Parses Chollometro pages (stdlib only).

The listing embeds one JSON per Vue component in single-quoted ``data-vue3``
attributes; a thread page embeds ``window.__INITIAL_STATE__``. See
``tests/fixtures/CHOLLOMETRO.md`` for the verified key map.
"""

import json
import logging
import re
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from patobarato.models import ChollometroThread

logger = logging.getLogger("patobarato.chollometro_parse")

BASE_URL = "https://www.chollometro.com"
_VUE_RE = re.compile(r"data-vue3='([^']*)'")
_STATE_MARK = "window.__INITIAL_STATE__ ="
_NUMBER_RE = re.compile(r"\d[\d.,]*")
_THOUSANDS_RE = re.compile(r"\d{1,3}(\.\d{3})+")


def parse_euros(text: str | float | int | None) -> Decimal | None:
    """Euro amount from a number or text like '1.299,00 €'. 0/empty/no number -> None."""
    if text is None or isinstance(text, bool):
        return None
    if isinstance(text, int | float):
        value = Decimal(str(text))
    else:
        match = _NUMBER_RE.search(text)
        if not match:
            return None
        number = match.group(0).rstrip(".,")
        if "," in number:
            number = number.replace(".", "").replace(",", ".")
        elif _THOUSANDS_RE.fullmatch(number):
            number = number.replace(".", "")
        try:
            value = Decimal(number)
        except InvalidOperation:
            return None
    return value if value > 0 else None


def _absolute(url: Any) -> str | None:
    if not isinstance(url, str) or not url.strip():
        return None
    url = url.strip()
    return url if url.startswith("http") else BASE_URL + url


def _categories(*names: Any) -> list[str]:
    seen: list[str] = []
    for name in names:
        if isinstance(name, str) and name.strip() and name.strip() not in seen:
            seen.append(name.strip())
    return seen


def _build(
    data: dict[str, Any],
    *,
    url: str,
    visit_url: str | None,
    categories: list[str],
) -> ChollometroThread:
    merchant = data.get("merchant")
    merchant_name = merchant.get("merchantName") if isinstance(merchant, dict) else None
    percentage = data.get("percentage")
    discount = (
        int(percentage)
        if isinstance(percentage, int | float) and percentage > 0
        else None
    )
    coupon = data.get("voucherCode")
    coupon = coupon.strip() if isinstance(coupon, str) else ""
    return ChollometroThread(
        thread_id=int(data["threadId"]),
        title=str(data["title"]),
        url=url,
        visit_url=visit_url,
        merchant=merchant_name or None,
        price=parse_euros(data.get("price")),
        previous_price=parse_euros(data.get("nextBestPrice")),
        discount=discount,
        temperature=float(data.get("temperature") or 0),
        expired=bool(data.get("isExpired")),
        sold_out=False,  # Chollometro exposes no sold-out field
        coupon=coupon or None,
        categories=categories,
        published_at=datetime.fromtimestamp(int(data["publishedAt"]), UTC),
    )


def parse_listing(html: str) -> list[ChollometroThread]:
    threads: list[dict[str, Any]] = []
    visit_links: dict[str, str] = {}
    for raw in _VUE_RE.findall(html):
        try:
            component = json.loads(raw)
            name = component.get("name")
            props = component.get("props") or {}
            if name == "ThreadMainListItemNormalizer":
                thread = props["thread"]
                if isinstance(thread, dict) and "threadId" in thread:
                    threads.append(thread)
            elif name == "ThreadListItemMainButton":
                link = _absolute(props.get("link"))
                if link and props.get("threadId") is not None:
                    visit_links[str(props["threadId"])] = link
        except (ValueError, KeyError, TypeError, AttributeError):
            logger.warning("Skipping malformed Chollometro component JSON")
    result: list[ChollometroThread] = []
    for data in threads:
        try:
            tid = str(data["threadId"])
            main_group = data.get("mainGroup")
            group = (
                main_group.get("threadGroupName")
                if isinstance(main_group, dict)
                else None
            )
            result.append(
                _build(
                    data,
                    url=f"{BASE_URL}/ofertas/{data['titleSlug']}-{tid}",
                    visit_url=visit_links.get(tid),
                    categories=_categories(group),
                )
            )
        except (ValueError, KeyError, TypeError):
            logger.warning(
                "Skipping malformed Chollometro thread %s", data.get("threadId")
            )
    return result


def parse_thread_page(html: str) -> ChollometroThread | None:
    start = html.find(_STATE_MARK)
    if start < 0:
        return None
    try:
        state, _ = json.JSONDecoder().raw_decode(
            html[start + len(_STATE_MARK) :].lstrip()
        )
        data = state["threadDetail"]
        groups = [g for g in (data.get("groups") or []) if isinstance(g, dict)]
        default = [g.get("threadGroupName") for g in groups if g.get("isDefault")]
        names = [g.get("threadGroupName") for g in groups]
        tid = str(data["threadId"])
        url = data.get("url") or f"{BASE_URL}/ofertas/{data['titleSlug']}-{tid}"
        return _build(
            data,
            url=url,
            visit_url=_absolute(data.get("linkCloakedItemMainButton")),
            categories=_categories(*default, *names),
        )
    except (ValueError, KeyError, TypeError, AttributeError):
        logger.warning("Could not parse Chollometro thread page", exc_info=True)
        return None
