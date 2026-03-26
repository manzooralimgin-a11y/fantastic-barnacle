from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant, User
from app.config import settings
from app.email_inbox.ai import email_ai_service
from app.email_inbox.delivery import send_email_reply
from app.email_inbox.models import EmailThread
from app.email_inbox.schemas import (
    EmailClassification,
    EmailInboxListResponse,
    EmailReplyDraft,
    EmailThreadRead,
    EmailThreadUpdate,
    ExtractedBookingData,
    NormalizedEmailPayload,
)
from app.hms.models import HotelProperty, RoomType
from app.hms.room_inventory import normalize_room_category, room_category_display_label
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.read_availability import calculate_hotel_availability, generate_restaurant_slots

logger = logging.getLogger("app.email_inbox.service")


@dataclass(slots=True)
class EmailIngestionResult:
    thread: EmailThread
    duplicate: bool


def _thread_reply_badge(thread: EmailThread) -> str:
    if not thread.reply_sent:
        return "Not Replied"
    if thread.replied_by_user_id is not None:
        return "Manually Replied"
    return "Auto Replied"


def serialize_email_thread(thread: EmailThread) -> EmailThreadRead:
    return EmailThreadRead.model_validate(
        {
            "id": thread.id,
            "external_email_id": thread.external_email_id,
            "sender": thread.sender,
            "subject": thread.subject,
            "body": thread.body,
            "received_at": thread.received_at,
            "category": thread.category or "pending",
            "classification_confidence": thread.classification_confidence,
            "extracted_data": thread.extracted_data,
            "summary": thread.summary,
            "reply_generated": bool(thread.reply_generated),
            "reply_sent": bool(thread.reply_sent),
            "reply_content": thread.reply_content,
            "reply_generated_at": thread.reply_generated_at,
            "reply_sent_at": thread.reply_sent_at,
            "replied_by_user_id": thread.replied_by_user_id,
            "status": thread.status or "pending",
            "reply_mode": thread.reply_mode or settings.email_inbox_reply_mode,
            "processing_error": thread.processing_error,
            "reply_error": thread.reply_error,
            "reply_badge": _thread_reply_badge(thread),
        }
    )


async def _record_event(metric_name: str, *, source: str) -> None:
    await api_metrics.record_business_event(metric_name)
    await api_metrics.record_business_event(f"{metric_name}.source.{source}")


def _sender_email(sender: str) -> str | None:
    _name, email = parseaddr(sender)
    candidate = email.strip().lower()
    return candidate or None


async def _preferred_property(db: AsyncSession) -> HotelProperty | None:
    if settings.email_inbox_default_property_id:
        record = await db.get(HotelProperty, settings.email_inbox_default_property_id)
        if record:
            return record
    result = await db.execute(select(HotelProperty).order_by(HotelProperty.id).limit(1))
    return result.scalar_one_or_none()


async def _preferred_restaurant(db: AsyncSession) -> Restaurant | None:
    if settings.email_inbox_default_restaurant_id:
        record = await db.get(Restaurant, settings.email_inbox_default_restaurant_id)
        if record:
            return record
    result = await db.execute(select(Restaurant).order_by(Restaurant.id).limit(1))
    return result.scalar_one_or_none()


async def ingest_email(
    db: AsyncSession,
    payload: NormalizedEmailPayload,
    *,
    source: str,
) -> EmailIngestionResult:
    existing = (
        await db.execute(
            select(EmailThread).where(EmailThread.external_email_id == payload.id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        await _record_event("email.duplicate", source=source)
        log_event(
            logger,
            logging.INFO,
            "email_received",
            source=source,
            duplicate=True,
            email_thread_id=existing.id,
            external_email_id=payload.id,
        )
        return EmailIngestionResult(thread=existing, duplicate=True)

    thread = EmailThread(
        external_email_id=payload.id,
        sender=payload.sender,
        subject=payload.subject or None,
        body=payload.body,
        received_at=payload.received_at,
        raw_email=payload.model_dump(mode="json", by_alias=True),
        category="pending",
        status="pending",
        reply_mode=settings.email_inbox_reply_mode,
    )
    db.add(thread)
    await db.flush()

    await _record_event("email.total", source=source)
    log_event(
        logger,
        logging.INFO,
        "email_received",
        source=source,
        duplicate=False,
        email_thread_id=thread.id,
        external_email_id=payload.id,
        sender=payload.sender,
    )
    return EmailIngestionResult(thread=thread, duplicate=False)


async def _load_thread_for_update(db: AsyncSession, thread_id: int) -> EmailThread:
    thread = await db.get(EmailThread, thread_id)
    if thread is None:
        raise HTTPException(status_code=404, detail="Email thread not found")
    return thread


def _normalized_email(thread: EmailThread) -> NormalizedEmailPayload:
    return NormalizedEmailPayload.model_validate(thread.raw_email)


async def _build_hotel_reply_context(
    db: AsyncSession,
    extracted: ExtractedBookingData,
) -> dict[str, Any]:
    property_record = await _preferred_property(db)
    if property_record is None:
        return {"hotel_name": "DAS ELB", "availability": False}

    requested_category = normalize_room_category(extracted.room_type) if extracted.room_type else None
    room_type_records = (
        await db.execute(select(RoomType).where(RoomType.property_id == property_record.id))
    ).scalars().all()

    requested_room_type = None
    for room_type in room_type_records:
        if requested_category and normalize_room_category(room_type.name) == requested_category:
            requested_room_type = room_type
            break

    context: dict[str, Any] = {
        "hotel_name": property_record.name,
        "property_id": property_record.id,
        "requested_room_type": requested_room_type.name if requested_room_type else extracted.room_type,
        "price_from": requested_room_type.base_price if requested_room_type else None,
    }

    if extracted.check_in and extracted.check_out:
        availability = await calculate_hotel_availability(
            db,
            property_id=property_record.id,
            check_in=extracted.check_in,
            check_out=extracted.check_out,
            adults=extracted.guests or 2,
            children=0,
        )
        context["availability"] = availability
        available_alternatives: list[str] = []
        requested_available = False
        for item in availability["room_types"]:
            if item["available_rooms"] > 0:
                available_alternatives.append(item["name"])
            if requested_room_type and item["room_type_id"] == requested_room_type.id:
                requested_available = item["available_rooms"] > 0
        context["available_alternatives"] = available_alternatives
        context["requested_room_available"] = requested_available
    return context


async def _build_restaurant_reply_context(
    db: AsyncSession,
    extracted: ExtractedBookingData,
) -> dict[str, Any]:
    restaurant = await _preferred_restaurant(db)
    if restaurant is None:
        return {"restaurant_name": "DAS ELB Restaurant", "slot_available": False}

    context: dict[str, Any] = {
        "restaurant_name": restaurant.name,
        "restaurant_id": restaurant.id,
        "slot_available": False,
    }
    if extracted.reservation_date:
        slots = await generate_restaurant_slots(
            db,
            restaurant_id=restaurant.id,
            reservation_date=extracted.reservation_date,
            party_size=extracted.guests or 2,
        )
        target_time = extracted.start_time.strftime("%H:%M") if extracted.start_time else None
        if target_time:
            exact = next((slot for slot in slots if slot["start_time"] == target_time), None)
            context["slot_available"] = bool(exact and exact["available"])
        context["alternative_slots"] = [
            slot["start_time"] for slot in slots if slot["available"]
        ][:3]
    return context


async def _build_reply_context(
    db: AsyncSession,
    extracted: ExtractedBookingData,
) -> dict[str, Any]:
    if extracted.intent == "hotel":
        return await _build_hotel_reply_context(db, extracted)
    return await _build_restaurant_reply_context(db, extracted)


async def process_email_thread(
    db: AsyncSession,
    *,
    thread_id: int,
    source: str = "pipeline",
) -> EmailThread:
    thread = await _load_thread_for_update(db, thread_id)
    if thread.category != "pending" and thread.status in {"processed", "ignored"}:
        return thread

    normalized = _normalized_email(thread)
    try:
        classification: EmailClassification = await email_ai_service.classify_email(normalized)
        thread.category = classification.category
        thread.classification_confidence = classification.confidence
        thread.processing_error = None
        await _record_event("email.filtered", source=source)
        await _record_event(f"email.filtered.{classification.category}", source=source)
        log_event(
            logger,
            logging.INFO,
            "email_filtered",
            source=source,
            email_thread_id=thread.id,
            category=classification.category,
            confidence=classification.confidence,
            sender=thread.sender,
        )

        if classification.category != "reservation":
            thread.status = "ignored"
            thread.summary = thread.summary or (thread.subject or "Ignored email")
            return thread

        extracted = await email_ai_service.extract_booking_data(normalized)
        thread.extracted_data = extracted.model_dump(mode="json", exclude_none=True)
        thread.summary = extracted.summary or thread.summary or (thread.subject or "Reservation inquiry")
        thread.status = "processed"

        if settings.email_inbox_reply_mode in {"generate_only", "manual_approval", "auto_send"}:
            await generate_reply_for_thread(
                db,
                thread_id=thread.id,
                source=source,
            )

        if settings.email_inbox_reply_mode == "auto_send":
            await send_reply_for_thread(
                db,
                thread_id=thread.id,
                source=source,
                replied_by_user_id=None,
            )
        return thread
    except HTTPException:
        raise
    except Exception as exc:
        thread.processing_error = str(exc)
        thread.status = "pending"
        await _record_event("email.processing.failure", source=source)
        log_event(
            logger,
            logging.ERROR,
            "email_processing_failed",
            source=source,
            email_thread_id=thread.id,
            error=str(exc),
        )
        raise


async def generate_reply_for_thread(
    db: AsyncSession,
    *,
    thread_id: int,
    source: str,
) -> EmailThread:
    thread = await _load_thread_for_update(db, thread_id)
    if thread.category not in {"reservation", "pending"}:
        raise HTTPException(status_code=400, detail="Reply generation is only available for reservation emails")

    normalized = _normalized_email(thread)
    extracted = ExtractedBookingData.model_validate(thread.extracted_data or {})
    if extracted.intent is None:
        extracted = await email_ai_service.extract_booking_data(normalized)
        thread.extracted_data = extracted.model_dump(mode="json", exclude_none=True)

    context = await _build_reply_context(db, extracted)
    draft: EmailReplyDraft = await email_ai_service.generate_reply(
        email=normalized,
        extracted=extracted,
        context=context,
    )
    if not draft.safe_to_send:
        raise HTTPException(status_code=422, detail="AI reply draft was not safe to send")

    thread.reply_content = draft.content
    thread.reply_generated = True
    thread.reply_generated_at = datetime.now(timezone.utc)
    thread.reply_error = None
    thread.reply_mode = settings.email_inbox_reply_mode

    await _record_event("email.reply.generated", source=source)
    log_event(
        logger,
        logging.INFO,
        "reply_generated",
        source=source,
        email_thread_id=thread.id,
        category=thread.category,
        status=thread.status,
    )
    return thread


async def send_reply_for_thread(
    db: AsyncSession,
    *,
    thread_id: int,
    source: str,
    replied_by_user_id: int | None,
    reply_content: str | None = None,
) -> EmailThread:
    thread = await _load_thread_for_update(db, thread_id)
    if thread.category != "reservation":
        raise HTTPException(status_code=400, detail="Only reservation emails can be replied to")

    if reply_content:
        thread.reply_content = reply_content
    if not thread.reply_content:
        await generate_reply_for_thread(db, thread_id=thread.id, source=source)

    recipient = (
        (thread.extracted_data or {}).get("email")
        if isinstance(thread.extracted_data, dict)
        else None
    ) or _sender_email(thread.sender)
    if not recipient:
        raise HTTPException(status_code=400, detail="No recipient email available for this thread")

    subject = f"Re: {thread.subject}" if thread.subject else "Your DAS ELB reservation inquiry"
    try:
        await send_email_reply(to=recipient, subject=subject, body=thread.reply_content or "")
    except Exception as exc:
        thread.reply_error = str(exc)
        await _record_event("email.reply.failure", source=source)
        log_event(
            logger,
            logging.ERROR,
            "reply_send_failed",
            source=source,
            email_thread_id=thread.id,
            error=str(exc),
        )
        raise HTTPException(status_code=503, detail="Reply delivery failed")

    thread.reply_sent = True
    thread.reply_sent_at = datetime.now(timezone.utc)
    thread.replied_by_user_id = replied_by_user_id
    thread.reply_error = None

    await _record_event("email.reply.sent", source=source)
    log_event(
        logger,
        logging.INFO,
        "reply_sent",
        source=source,
        email_thread_id=thread.id,
        replied_by_user_id=replied_by_user_id,
    )
    return thread


async def update_email_thread(
    db: AsyncSession,
    *,
    thread_id: int,
    payload: EmailThreadUpdate,
) -> EmailThread:
    thread = await _load_thread_for_update(db, thread_id)
    if payload.reply_content is not None:
        thread.reply_content = payload.reply_content
    if payload.status is not None:
        thread.status = payload.status
    return thread


async def get_email_thread(db: AsyncSession, *, thread_id: int) -> EmailThread:
    return await _load_thread_for_update(db, thread_id)


async def list_filtered_email_threads(
    db: AsyncSession,
    *,
    limit: int = 50,
) -> EmailInboxListResponse:
    query: Select[tuple[EmailThread]] = (
        select(EmailThread)
        .where(EmailThread.category == "reservation", EmailThread.status != "ignored")
        .order_by(EmailThread.received_at.desc(), EmailThread.id.desc())
        .limit(max(min(limit, 200), 1))
    )
    threads = (await db.execute(query)).scalars().all()
    total = (
        await db.scalar(
            select(func.count(EmailThread.id)).where(
                EmailThread.category == "reservation",
                EmailThread.status != "ignored",
            )
        )
    ) or 0
    pending = sum(not thread.reply_sent for thread in threads)
    auto_replied = sum(thread.reply_sent and thread.replied_by_user_id is None for thread in threads)
    manually_replied = sum(thread.reply_sent and thread.replied_by_user_id is not None for thread in threads)
    return EmailInboxListResponse(
        items=[serialize_email_thread(thread) for thread in threads],
        total=total,
        pending=pending,
        auto_replied=auto_replied,
        manually_replied=manually_replied,
    )


async def email_inbox_stats(db: AsyncSession) -> dict[str, int]:
    total_emails = await db.scalar(select(func.count(EmailThread.id))) or 0
    filtered_emails = (
        await db.scalar(select(func.count(EmailThread.id)).where(EmailThread.category == "reservation"))
        or 0
    )
    reply_generated = (
        await db.scalar(select(func.count(EmailThread.id)).where(EmailThread.reply_generated.is_(True)))
        or 0
    )
    reply_sent = (
        await db.scalar(select(func.count(EmailThread.id)).where(EmailThread.reply_sent.is_(True)))
        or 0
    )
    return {
        "total_emails": total_emails,
        "filtered_emails": filtered_emails,
        "reply_generated": reply_generated,
        "reply_sent": reply_sent,
    }
