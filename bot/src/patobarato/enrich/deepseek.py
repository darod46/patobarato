"""Minimal DeepSeek chat client (OpenAI-compatible API) that returns one JSON object.

The API key is only sent in the Authorization header and never logged.
"""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable

import httpx

logger = logging.getLogger("patobarato.deepseek")

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-flash"
RETRY_STATUSES = {429, 500, 502, 503, 504}


class DeepSeekError(Exception):
    """A request that failed after its retries (or returned unusable content)."""


class DeepSeekFatal(DeepSeekError):
    """Bad key (401) or no balance (402): stop until someone fixes the account."""


class DeepSeekClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        api_key: str,
        *,
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        attempts: int = 3,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._http = http
        self._api_key = api_key
        self._model = model
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._attempts = attempts
        self._sleep = sleep

    async def json_completion(self, system: str, user: str, *, max_tokens: int = 400) -> dict:
        """The model's answer parsed as a JSON object; retries blank content, invalid JSON, 429 and 5xx."""
        body = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "thinking": {"type": "disabled"},
            "response_format": {"type": "json_object"},
            "max_tokens": max_tokens,
            "temperature": 0.7,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        last = "sin respuesta"
        for attempt in range(self._attempts):
            if attempt:
                await self._sleep(2.0 * attempt)
            try:
                response = await self._http.post(self._url, json=body, headers=headers)
            except httpx.HTTPError as e:
                last = type(e).__name__
                continue
            if response.status_code in (401, 402):
                raise DeepSeekFatal(f"HTTP {response.status_code}")
            if response.status_code in RETRY_STATUSES:
                last = f"HTTP {response.status_code}"
                continue
            if response.status_code != 200:
                raise DeepSeekError(f"HTTP {response.status_code}")
            try:
                content = response.json()["choices"][0]["message"]["content"] or ""
                parsed = json.loads(content) if content.strip() else None
            except (ValueError, KeyError, IndexError, TypeError):
                parsed = None
            if isinstance(parsed, dict):
                return parsed
            last = "contenido vacío o no es JSON"
        raise DeepSeekError(last)
