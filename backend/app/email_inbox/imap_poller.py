from __future__ import annotations

import email
import email.header
import imaplib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import TYPE_CHECKING

from app.config import settings
from app.observability.logging import log_event

if TYPE_CHECKING:
    from app.email_inbox.schemas import NormalizedEmailPayload

logger = logging.getLogger("app.email_inbox.imap_poller")

# How many messages to backfill when the UNSEEN queue is empty.
_BACKFILL_LIMIT = 10


@dataclass(slots=True)
class FetchedEmail:
    """A single email fetched from IMAP, tagged with origin so the caller
    knows whether to mark it SEEN (only for UNSEEN-derived messages)."""

    payload: "NormalizedEmailPayload"
    uid: bytes
    mark_seen: bool


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


def _fetch_one(
    conn: imaplib.IMAP4 | imaplib.IMAP4_SSL,
    uid: bytes,
    *,
    mark_seen: bool,
) -> "FetchedEmail | None":
    from app.email_inbox.schemas import NormalizedEmailPayload

    # Use BODY.PEEK[] so a plain fetch does NOT implicitly mark the message
    # as SEEN. We decide explicitly below whether to flag it.
    _, msg_data = conn.uid("fetch", uid, "(BODY.PEEK[])")  # type: ignore[call-overload]
    if not msg_data or not msg_data[0] or not isinstance(msg_data[0], tuple):
        return None
    raw = msg_data[0][1]
    if not isinstance(raw, bytes):
        return None

    msg = email.message_from_bytes(raw)
    external_id = _make_external_id(msg, uid)
    sender = str(msg.get("From", "")).strip()
    subject = _decode_header_value(msg.get("Subject"))
    body = _extract_text_body(msg)
    received_at = _parse_received_at(msg)

    # Schema constraints: subject is a non-null str (default ""); body is
    # min_length=1. Coerce degenerate cases so validation never drops an
    # otherwise-valid email (e.g. HTML-only messages, missing subject).
    subject_str = subject or ""
    if len(subject_str) > 500:
        subject_str = subject_str[:500]
    body_str = body or "(no text body)"
    if len(body_str) > 50_000:
        body_str = body_str[:50_000]

    payload = NormalizedEmailPayload(
        id=external_id,
        sender=sender,
        subject=subject_str,
        body=body_str,
        received_at=received_at,
    )
    return FetchedEmail(payload=payload, uid=uid, mark_seen=mark_seen)


def fetch_unseen_emails() -> list[FetchedEmail]:
    """
    Connect to the configured IMAP mailbox and return emails to ingest.

    Behaviour:
      1. Search UNSEEN. If any exist, return all of them. They WILL be
         flagged SEEN by the caller after successful ingest.
      2. Otherwise, fall back to the most recent `_BACKFILL_LIMIT` messages
         (ALL search → last N UIDs). These are NOT marked SEEN — the user's
         mailbox read-state stays untouched. Deduplication is handled
         downstream by ingest_email() via the Message-ID unique index.

    Returns an empty list if IMAP is not configured or on connection failure.
    """

    if not settings.imap_host or not settings.imap_username or not settings.imap_password:
        log_event(logger, logging.WARNING, "imap_poll_skipped", reason="imap_not_configured")
        return []

    fetched: list[FetchedEmail] = []
    conn: imaplib.IMAP4 | imaplib.IMAP4_SSL | None = None
    try:
        if settings.imap_use_ssl:
            conn = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port)
        else:
            conn = imaplib.IMAP4(settings.imap_host, settings.imap_port)

        conn.login(settings.imap_username, settings.imap_password)
        conn.select(settings.imap_mailbox)

        # --- UNSEEN first -------------------------------------------------
        _, unseen_data = conn.uid("search", None, "UNSEEN")  # type: ignore[call-overload]
        unseen_uids: list[bytes] = unseen_data[0].split() if unseen_data and unseen_data[0] else []

        mode = "unseen"
        candidate_uids: list[bytes] = unseen_uids
        mark_seen = True

        if not unseen_uids:
            # --- Backfill: last N emails (ALL search → tail) -------------
            _, all_data = conn.uid("search", None, "ALL")  # type: ignore[call-overload]
            all_uids: list[bytes] = all_data[0].split() if all_data and all_data[0] else []
            candidate_uids = all_uids[-_BACKFILL_LIMIT:] if all_uids else []
            mark_seen = False
            mode = "backfill"

        log_event(
            logger,
            logging.INFO,
            "imap_poll",
            host=settings.imap_host,
            mailbox=settings.imap_mailbox,
            mode=mode,
            candidate_count=len(candidate_uids),
        )

        for uid in candidate_uids:
            try:
                item = _fetch_one(conn, uid, mark_seen=mark_seen)
                if item is None:
                    continue
                fetched.append(item)
                log_event(
                    logger,
                    logging.INFO,
                    "imap_email_fetched",
                    uid=uid.decode(errors="replace"),
                    mode=mode,
                    external_id=item.payload.id,
                    sender=item.payload.sender,
                )
            except Exception as exc:
                log_event(
                    logger,
                    logging.ERROR,
                    "imap_email_fetch_error",
                    uid=uid.decode(errors="replace"),
                    mode=mode,
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

    return fetched


def mark_uid_seen(uid: bytes) -> None:
    """Mark a single UID as SEEN on the IMAP server (best-effort, new connection).

    Called by the ingest task after a successful DB insert so that failures
    during processing don't cause the message's SEEN state to diverge from
    its ingestion state.
    """
    if not settings.imap_host or not settings.imap_username or not settings.imap_password:
        return

    conn: imaplib.IMAP4 | imaplib.IMAP4_SSL | None = None
    try:
        if settings.imap_use_ssl:
            conn = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port)
        else:
            conn = imaplib.IMAP4(settings.imap_host, settings.imap_port)
        conn.login(settings.imap_username, settings.imap_password)
        conn.select(settings.imap_mailbox)
        conn.uid("store", uid, "+FLAGS", "\\Seen")  # type: ignore[call-overload]
    except Exception as exc:
        log_event(
            logger,
            logging.ERROR,
            "imap_mark_seen_failed",
            uid=uid.decode(errors="replace"),
            error=str(exc),
        )
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass
