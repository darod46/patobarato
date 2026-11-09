"""Tells the public website to refresh its cached pages."""

import logging

import httpx

logger = logging.getLogger("patobarato.admin.revalidate")


class RevalidateError(Exception):
    """The website refused or could not be reached. The message never holds the secret."""


class WebRevalidator:
    def __init__(self, http: httpx.AsyncClient, url: str | None, secret: str | None) -> None:
        self._http = http
        self._url = url
        self._secret = secret

    async def revalidate(self) -> None:
        if not self._url or not self._secret:
            return
        try:
            response = await self._http.post(
                self._url, headers={"x-revalidate-secret": self._secret}
            )
        except httpx.HTTPError as e:
            raise RevalidateError(f"No se pudo avisar a la web ({type(e).__name__})") from None
        if not response.is_success:
            raise RevalidateError(f"La web rechazó la revalidación (HTTP {response.status_code})")
