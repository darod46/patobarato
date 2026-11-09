"""Invites and removes admin portal users through the Supabase auth admin API."""

import asyncio
import logging
from typing import Any

from supabase_auth.errors import AuthError

from patobarato.storage.repository import Repository

logger = logging.getLogger("patobarato.admin.users")


class UserError(Exception):
    """A user-facing (Spanish) reason why a user action cannot be done."""


class UserAdmin:
    def __init__(self, client: Any, repo: Repository, admin_url: str | None) -> None:
        self._client = client
        self._repo = repo
        self._admin_url = admin_url

    async def invite(self, email: str) -> dict:
        if not self._admin_url:
            raise UserError("Falta ADMIN_URL en el bot")
        redirect = f"{self._admin_url.rstrip('/')}/auth/confirm"
        try:
            response = await asyncio.to_thread(
                self._client.auth.admin.invite_user_by_email,
                email,
                {"redirect_to": redirect},
            )
        except AuthError as e:
            raise UserError(str(e.message)) from None
        user_id = str(response.user.id)
        await self._repo.add_admin_user(user_id, email)
        return {"user_id": user_id}

    async def revoke(self, user_id: str) -> dict:
        owners = await self._repo.owner_ids()
        if user_id in owners and len(owners) == 1:
            raise UserError("No puedes quitar al último propietario")
        try:
            await asyncio.to_thread(self._client.auth.admin.delete_user, user_id)
        except ValueError:
            raise UserError("Usuario no válido") from None
        except AuthError as e:
            raise UserError(str(e.message)) from None
        return {"user_id": user_id}
