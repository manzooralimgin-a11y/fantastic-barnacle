from __future__ import annotations

from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.email_inbox.models import EmailThread


def _ingest_payload(*, email_id: str, subject: str, body: str, sender: str = "Anna Bergmann <anna@example.com>") -> dict:
    return {
        "id": email_id,
        "from": sender,
        "subject": subject,
        "body": body,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }


@pytest.mark.asyncio
async def test_booking_email_appears_in_filtered_inbox(client) -> None:
    payload = _ingest_payload(
        email_id="email-booking-1",
        subject="Room request for 2026-08-10",
        body=(
            "Hello DAS ELB, my name is Anna Bergmann. "
            "I would like to book a Komfort room from 2026-08-10 to 2026-08-12 for 2 guests. "
            "Please send me an offer."
        ),
    )

    response = await client.post(
        "/api/email-inbox/ingest",
        json=payload,
        headers={"X-Email-Inbox-Secret": "dev-email-inbox-secret"},
    )

    assert response.status_code == 202

    inbox_response = await client.get("/api/hms/email-inbox")
    assert inbox_response.status_code == 200
    body = inbox_response.json()
    assert body["total"] >= 1
    thread = next(item for item in body["items"] if item["external_email_id"] == "email-booking-1")
    assert thread["category"] == "reservation"
    assert thread["reply_generated"] is True
    assert thread["status"] == "processed"
    assert thread["extracted_data"]["intent"] == "hotel"


@pytest.mark.asyncio
async def test_spam_email_is_not_shown_in_filtered_inbox(client) -> None:
    payload = _ingest_payload(
        email_id="email-spam-1",
        subject="SEO backlinks for your website",
        body="We can improve your ranking. Unsubscribe here for more marketing offers.",
        sender="Growth Agency <sales@example.org>",
    )

    response = await client.post(
        "/api/email-inbox/ingest",
        json=payload,
        headers={"X-Email-Inbox-Secret": "dev-email-inbox-secret"},
    )
    assert response.status_code == 202

    inbox_response = await client.get("/api/hms/email-inbox")
    assert inbox_response.status_code == 200
    ids = {item["external_email_id"] for item in inbox_response.json()["items"]}
    assert "email-spam-1" not in ids


@pytest.mark.asyncio
async def test_valid_reservation_can_generate_and_send_reply(client) -> None:
    payload = _ingest_payload(
        email_id="email-restaurant-1",
        subject="Dinner reservation on 2026-09-14",
        body=(
            "Good evening, this is Markus Weber. "
            "Could I reserve a table for 4 guests on 2026-09-14 at 19:30?"
        ),
        sender="Markus Weber <markus@example.com>",
    )
    response = await client.post(
        "/api/email-inbox/ingest",
        json=payload,
        headers={"X-Email-Inbox-Secret": "dev-email-inbox-secret"},
    )
    assert response.status_code == 202
    thread_id = response.json()["thread_id"]

    generate_response = await client.post(f"/api/hms/email-inbox/{thread_id}/generate-reply")
    assert generate_response.status_code == 200
    generated_thread = generate_response.json()["thread"]
    assert generated_thread["reply_generated"] is True
    assert generated_thread["reply_content"]

    send_response = await client.post(f"/api/hms/email-inbox/{thread_id}/send-reply", json={})
    assert send_response.status_code == 200
    sent_thread = send_response.json()["thread"]
    assert sent_thread["reply_sent"] is True
    assert sent_thread["reply_badge"] == "Manually Replied"


@pytest.mark.asyncio
async def test_duplicate_ingestion_does_not_create_new_thread(
    client,
    db_session: AsyncSession,
) -> None:
    payload = _ingest_payload(
        email_id="email-duplicate-1",
        subject="Availability request",
        body="Can you send me a room offer for 2026-10-01 to 2026-10-03?",
    )

    first = await client.post(
        "/api/email-inbox/ingest",
        json=payload,
        headers={"X-Email-Inbox-Secret": "dev-email-inbox-secret"},
    )
    second = await client.post(
        "/api/email-inbox/ingest",
        json=payload,
        headers={"X-Email-Inbox-Secret": "dev-email-inbox-secret"},
    )

    assert first.status_code == 202
    assert second.status_code == 202
    assert second.json()["duplicate"] is True

    total = await db_session.scalar(
        select(func.count(EmailThread.id)).where(EmailThread.external_email_id == "email-duplicate-1")
    )
    assert total == 1
