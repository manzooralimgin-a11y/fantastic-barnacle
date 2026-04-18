from __future__ import annotations

import email
import email.header
import imaplib
import logging
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import TYPE_CHECKING

from app.config import settings
from app.observability.logging import log_event

if TYPE_CHECKING:
    from app.email_inbox.schemas import NormalizedEmailPayload

logger = logging.getLogger("app.email_inbox.imap_poller")


def _decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    parts = email.header.decode_header(value)
    decoded: list[str] = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def _extract_text_body(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))
            if ctype == "text/plain" and "attachment" not in disposition:
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_content_charset() or "utf-8"
                    return payload.decode(charset, errors="replace")
        return ""
    raw = msg.get_payload(decode=True)
    if isinstance(raw, bytes):
        charset = msg.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace")
    return ""


def _parse_received_at(msg: email.message.Message) -> datetime:
    date_str = msg.get("Date")
    if date_str:
        try:
            return parsedate_to_datetime(date_str).astimezone(timezone.utc).replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _make_external_id(msg: email.message.Message, uid: bytes) -> str:
    message_id = str(msg.get("Message-ID", "")).strip()
    if message_id:
        return message_id
    return f"imap-uid-{uid.decode(errors='replace')}"


def fetch_unseen_emails() -> list[NormalizedEmailPayload]:
    """
    Connect to the configured IMAP mailbox, fetch all UNSEEN messages,
    mark them SEEN, and return a list of NormalizedEmailPayload objects
    ready for the ingest pipeline.

    Returns an empty list if IMAP is not configured or on connection failure.
    """
    from app.email_inbox.schemas import NormalizedEmailPayload

    if not settings.imap_host or not settings.imap_username or not settings.imap_password:
        log_event(logger, logging.WARNING, "imap_poll_skipped", reason="imap_not_configured")
        return []

    payloads: list[NormalizedEmailPayload] = []
    conn: imaplib.IMAP4 | imaplib.IMAP4_SSL | None = None
    try:
        if settings.imap_use_ssl:
            conn = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port)
        else:
            conn = imaplib.IMAP4(settings.imap_host, settings.imap_port)

        conn.login(settings.imap_username, settings.imap_password)
        conn.select(settings.imap_mailbox)

        _, uid_data = conn.uid("search", None, "UNSEEN")  # type: ignore[call-overload]
        uids: list[bytes] = uid_data[0].split() if uid_data and uid_data[0] else []

        log_event(
            logger,
            logging.INFO,
            "imap_poll",
            host=settings.imap_host,
            mailbox=settings.imap_mailbox,
            unseen_count=len(uids),
        )

        for uid in uids:
            try:
                _, msg_data = conn.uid("fetch", uid, "(RFC822)")  # type: ignore[call-overload]
                if not msg_data or not msg_data[0] or not isinstance(msg_data[0], tuple):
                    continue
                raw = msg_data[0][1]
                if not isinstance(raw, bytes):
                    continue

                msg = email.message_from_bytes(raw)
                external_id = _make_external_id(msg, uid)
                sender = str(msg.get("From", "")).strip()
                subject = _decode_header_value(msg.get("Subject"))
                body = _extract_text_body(msg)
                received_at = _parse_received_at(msg)

                payload = NormalizedEmailPayload(
                    id=external_id,
                    sender=sender,
                    subject=subject or None,
                    body=body,
                    received_at=received_at,
                )
                payloads.append(payload)

                # Mark SEEN before processing — dedup in ingest_email prevents re-processing.
                conn.uid("store", uid, "+FLAGS", "\\Seen")  # type: ignore[call-overload]

                log_event(
                    logger,
                    logging.INFO,
                    "imap_email_fetched",
                    uid=uid.decode(errors="replace"),
                    external_id=external_id,
                    sender=sender,
                )
            except Exception as exc:
                log_event(
                    logger,
                    logging.ERROR,
                    "imap_email_fetch_error",
                    uid=uid.decode(errors="replace"),
                    error=str(exc),
                )

    except Exception as exc:
        log_event(logger, logging.ERROR, "imap_poll_failed", error=str(exc))
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass

    return payloads
