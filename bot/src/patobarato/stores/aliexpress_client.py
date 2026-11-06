"""Client for the AliExpress Portals (affiliate) API."""

import hmac
import time
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from typing import Any

import httpx

DEFAULT_ENDPOINT = "https://api-sg.aliexpress.com/sync"
TARGET_CURRENCY = "EUR"
TARGET_LANGUAGE = "ES"


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
