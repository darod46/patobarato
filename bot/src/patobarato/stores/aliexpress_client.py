"""Client for the AliExpress Portals (affiliate) API."""

import hmac
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from typing import Any

import httpx

DEFAULT_ENDPOINT = "https://api-sg.aliexpress.com/sync"
TARGET_CURRENCY = "EUR"
TARGET_LANGUAGE = "ES"

logger = logging.getLogger("patobarato.aliexpress")


class AliExpressError(Exception):
    def __init__(self, code: str, msg: str) -> None:
        super().__init__(f"AliExpress error {code}: {msg}")
        self.code = code
        self.msg = msg


@dataclass
class AliProduct:
    product_id: str
    title: str
    price: Decimal
    original_price: Decimal | None
    discount: int | None
    image_url: str | None
    url: str
    promotion_link: str | None


@dataclass
class AliPromo:
    name: str
    start: date | None
    end: date | None


@dataclass
class AliPromoPage:
    products: list[AliProduct]
    has_more: bool


def _decimal(value: Any) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return None


def _discount(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(Decimal(str(value).strip().rstrip("%").strip()))
    except InvalidOperation:
        return None


def _product(raw: dict[str, Any]) -> AliProduct:
    return AliProduct(
        product_id=str(raw["product_id"]),
        title=raw.get("product_title", ""),
        price=Decimal(str(raw["target_sale_price"])),
        original_price=_decimal(raw.get("target_original_price")),
        discount=_discount(raw.get("discount")),
        image_url=raw.get("product_main_image_url") or None,
        url=raw.get("product_detail_url", ""),
        promotion_link=raw.get("promotion_link") or None,
    )


def _products(result: dict[str, Any]) -> list[AliProduct]:
    items = (result.get("result", {}).get("products") or {}).get("product") or []
    return [_product(item) for item in items]


def _strict_products(result: dict[str, Any]) -> tuple[list[AliProduct], int]:
    """Parse products, skipping (and counting) rows without id, positive price or link."""
    items = (result.get("result", {}).get("products") or {}).get("product") or []
    products: list[AliProduct] = []
    skipped = 0
    for item in items:
        try:
            if not item.get("product_id") or not item.get("promotion_link"):
                raise ValueError("missing field")
            product = _product(item)
            if not product.price.is_finite() or product.price <= 0:
                raise ValueError("bad price")
        except (KeyError, ValueError, InvalidOperation, AttributeError):
            skipped += 1
            continue
        products.append(product)
    return products, skipped


def _day(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


class AliExpressClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        app_key: str,
        app_secret: str,
        tracking_id: str,
        endpoint: str = DEFAULT_ENDPOINT,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._http = http
        self._app_key = app_key
        self._secret = app_secret
        self._tracking_id = tracking_id
        self._endpoint = endpoint
        self._clock = clock

    def sign(self, params: dict[str, str]) -> str:
        """HMAC-SHA256 (key=app_secret) over key+value pairs sorted by key, uppercase hex."""
        message = "".join(f"{k}{params[k]}" for k in sorted(params) if k != "sign")
        return hmac.new(self._secret.encode(), message.encode(), sha256).hexdigest().upper()

    async def call(self, method: str, **params: Any) -> dict[str, Any]:
        data = {
            "app_key": self._app_key,
            "timestamp": str(int(self._clock() * 1000)),
            "sign_method": "sha256",
            "method": method,
            "v": "2.0",
            "format": "json",
            **{k: str(v) for k, v in params.items() if v is not None},
        }
        data["sign"] = self.sign(data)
        response = await self._http.post(self._endpoint, data=data)
        response.raise_for_status()
        body = response.json()
        error = body.get("error_response")
        if error:
            raise AliExpressError(str(error.get("code", "")), str(error.get("msg", "")))
        for payload in body.values():
            resp_result = payload.get("resp_result") if isinstance(payload, dict) else None
            if resp_result is not None and str(resp_result.get("resp_code")) != "200":
                raise AliExpressError(
                    str(resp_result.get("resp_code")), str(resp_result.get("resp_msg", ""))
                )
        return body

    @staticmethod
    def _payload(body: dict[str, Any], name: str) -> dict[str, Any]:
        return body.get(name, {}).get("resp_result", {})

    async def link_generate(self, url: str) -> str:
        body = await self.call(
            "aliexpress.affiliate.link.generate",
            promotion_link_type="0",
            source_values=url,
            tracking_id=self._tracking_id,
        )
        result = self._payload(body, "aliexpress_affiliate_link_generate_response")
        links = (result.get("result", {}).get("promotion_links") or {}).get("promotion_link") or []
        if not links:
            raise AliExpressError("no_link", "No promotion link returned")
        return links[0]["promotion_link"]

    async def product_detail(self, product_id: str) -> AliProduct | None:
        body = await self.call(
            "aliexpress.affiliate.productdetail.get",
            product_ids=product_id,
            target_currency=TARGET_CURRENCY,
            target_language=TARGET_LANGUAGE,
            tracking_id=self._tracking_id,
        )
        products = _products(self._payload(body, "aliexpress_affiliate_productdetail_get_response"))
        return products[0] if products else None

    async def hot_products(
        self,
        category_ids: list[str],
        keywords: str | None,
        page_size: int,
        page_no: int,
    ) -> list[AliProduct]:
        body = await self.call(
            "aliexpress.affiliate.hotproduct.query",
            category_ids=",".join(category_ids) if category_ids else None,
            keywords=keywords or None,
            page_size=page_size,
            page_no=page_no,
            target_currency=TARGET_CURRENCY,
            target_language=TARGET_LANGUAGE,
            tracking_id=self._tracking_id,
        )
        return _products(self._payload(body, "aliexpress_affiliate_hotproduct_query_response"))

    async def product_query(
        self,
        keywords: str | None,
        category_ids: list[str],
        page_size: int,
        page_no: int,
        sort: str = "LAST_VOLUME_DESC",
    ) -> list[AliProduct]:
        body = await self.call(
            "aliexpress.affiliate.product.query",
            keywords=keywords or None,
            category_ids=",".join(category_ids) if category_ids else None,
            page_size=page_size,
            page_no=page_no,
            sort=sort,
            ship_to_country="ES",
            target_currency=TARGET_CURRENCY,
            target_language=TARGET_LANGUAGE,
            tracking_id=self._tracking_id,
        )
        return _products(self._payload(body, "aliexpress_affiliate_product_query_response"))

    async def featured_promos(self) -> list[AliPromo]:
        body = await self.call("aliexpress.affiliate.featuredpromo.get")
        result = self._payload(body, "aliexpress_affiliate_featuredpromo_get_response")
        items = (result.get("result", {}).get("promos") or {}).get("promo") or []
        return [
            AliPromo(
                name=str(item["promo_name"]),
                start=_day(item.get("start_time")),
                end=_day(item.get("end_time")),
            )
            for item in items
            if item.get("promo_name")
        ]

    async def featured_promo_products(
        self, promo_name: str, page_no: int = 1, page_size: int = 50
    ) -> AliPromoPage:
        body = await self.call(
            "aliexpress.affiliate.featuredpromo.products.get",
            promo_name=promo_name,
            page_no=page_no,
            page_size=page_size,
            target_currency=TARGET_CURRENCY,
            target_language=TARGET_LANGUAGE,
            tracking_id=self._tracking_id,
        )
        payload = self._payload(body, "aliexpress_affiliate_featuredpromo_products_get_response")
        products, skipped = _strict_products(payload)
        if skipped:
            logger.info(
                "featuredpromo %s: skipped %d products without price or link", promo_name, skipped
            )
        try:
            total = int(payload.get("result", {}).get("total_record_count") or 0)
        except (TypeError, ValueError):
            total = 0
        return AliPromoPage(products=products, has_more=page_no * page_size < total)
