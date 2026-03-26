from __future__ import annotations

import asyncio
import logging

import resend

from app.config import settings
from app.observability.logging import log_event
from app.shared.notifications import notifications

logger = logging.getLogger("app.email_inbox.delivery")


def _send_via_resend(*, to: str, subject: str, body: str) -> None:
    resend.api_key = settings.resend_api_key
    resend.Emails.send(
        {
            "from": f"{settings.email_inbox_from_name} <{settings.email_inbox_from_address}>",
            "to": [to],
            "subject": subject,
            "text": body,
        }
    )


async def send_email_reply(*, to: str, subject: str, body: str) -> None:
    if settings.resend_api_key:
        await asyncio.to_thread(_send_via_resend, to=to, subject=subject, body=body)
        return

    log_event(
        logger,
        logging.WARNING,
        "email_reply_delivery_fallback",
        provider="notification_stub",
        recipient=to,
        subject=subject,
    )
    await notifications.send_email(to=to, subject=subject, body=body)

