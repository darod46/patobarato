"""Telethon glue for @patobaratobot: private messages in, the service's answer out."""

import logging

from telethon import TelegramClient, events
from telethon.errors import InputUserDeactivatedError, UserIsBlockedError

from patobarato.alerts.checker import UserBlocked
from patobarato.alerts.service import AlertService, AlertUser

logger = logging.getLogger("patobarato.alerts_bot")


def register_handlers(client: TelegramClient, service: AlertService) -> None:
    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_message(event) -> None:  # pragma: no cover - thin Telethon wrapper
        sender = await event.get_sender()
        user = AlertUser(
            telegram_id=event.sender_id,
            chat_id=event.chat_id,
            username=getattr(sender, "username", None),
            first_name=getattr(sender, "first_name", None),
        )
        reply = await service.handle(user, event.raw_text or "")
        await event.respond(reply, parse_mode="html", link_preview=False)


def make_sender(client: TelegramClient):
    async def send(chat_id: int, text: str) -> None:  # pragma: no cover - thin Telethon wrapper
        try:
            await client.send_message(chat_id, text, parse_mode="html", link_preview=True)
        except (UserIsBlockedError, InputUserDeactivatedError) as e:
            raise UserBlocked(str(e)) from e

    return send
