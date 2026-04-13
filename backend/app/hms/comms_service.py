from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User
from app.dependencies import HotelAccessContext
from app.email_inbox.delivery import send_email_reply
from app.hms.models import (
    HotelMessageEvent,
    HotelMessageTemplate,
    HotelMessageThread,
    HotelProperty,
)
from app.hms.pms.repositories.reservations_repo import get_reservation_with_relations
from app.hms.schemas import (
    HotelMessageEventRead,
    HotelMessageSendRequest,
    HotelMessageTemplateCreate,
    HotelMessageTemplateRead,
    HotelMessageTemplateUpdate,
    HotelMessageThreadRead,
)

DEFAULT_MESSAGE_TEMPLATES: tuple[dict[str, str], ...] = (
    {
        "code": "booking_confirmation",
        "name": "Booking Confirmation",
        "channel": "email",
        "category": "confirmation",
        "subject_template": "Ihre Buchung {{booking_id}} im {{property_name}}",
        "body_template": (
            "Hallo {{guest_name}},\n\n"
            "vielen Dank fuer Ihre Buchung im {{property_name}}.\n"
            "Wir freuen uns, Sie vom {{check_in}} bis {{check_out}} willkommen zu heissen.\n\n"
            "Mit freundlichen Gruessen\n{{property_name}}"
        ),
    },
    {
        "code": "pre_arrival",
        "name": "Pre-Arrival Message",
        "channel": "email",
        "category": "pre_arrival",
        "subject_template": "Vor Ihrer Anreise: {{booking_id}}",
        "body_template": (
            "Hallo {{guest_name}},\n\n"
            "Ihre Anreise ins {{property_name}} steht bevor.\n"
            "Ihr Aufenthalt beginnt am {{check_in}} in Zimmer {{room_number}}.\n\n"
            "Wenn Sie Fragen haben, antworten Sie einfach auf diese Nachricht."
        ),
    },
    {
        "code": "thank_you",
        "name": "Post-Stay Thank You",
        "channel": "email",
        "category": "post_stay",
        "subject_template": "Danke fuer Ihren Aufenthalt im {{property_name}}",
        "body_template": (
            "Hallo {{guest_name}},\n\n"
            "vielen Dank fuer Ihren Aufenthalt im {{property_name}}.\n"
            "Wir hoffen, dass Sie eine gute Zeit bei uns hatten.\n\n"
            "Beste Gruesse\n{{property_name}}"
        ),
    },
)


def _render_template(template: str | None, context: dict[str, str]) -> str | None:
    if template is None:
        return None

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return context.get(key, "")

    return re.sub(r"{{\s*([a-zA-Z0-9_]+)\s*}}", replace, template)


async def _resolve_property_id(hotel_access: HotelAccessContext, property_id: int | None) -> int:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")
    resolved_property_id = resolved_property_id or hotel_access.active_property_id
    if resolved_property_id is None:
        raise HTTPException(status_code=403, detail="No hotel property access configured for user")
    return resolved_property_id


async def _get_property_scoped(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None,
) -> HotelProperty:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    property_record = await db.get(HotelProperty, resolved_property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")
    return property_record


async def _safe_user_id(db: AsyncSession, candidate_user_id: int | None) -> int | None:
    if candidate_user_id is None:
        return None
    user = await db.get(User, candidate_user_id)
    return user.id if user is not None else None


def _serialize_template(template: HotelMessageTemplate) -> HotelMessageTemplateRead:
    return HotelMessageTemplateRead.model_validate(template)


def _serialize_event(event: HotelMessageEvent) -> HotelMessageEventRead:
    return HotelMessageEventRead.model_validate(
        {
            "id": event.id,
            "property_id": event.property_id,
            "thread_id": event.thread_id,
            "template_id": event.template_id,
            "template_name": event.template.name if event.template is not None else None,
            "direction": event.direction,
            "channel": event.channel,
            "subject": event.subject,
            "body_text": event.body_text,
            "sender_email": event.sender_email,
            "recipient_email": event.recipient_email,
            "status": event.status,
            "sent_at": event.sent_at,
            "error_message": event.error_message,
            "metadata_json": event.metadata_json,
            "created_at": event.created_at,
            "updated_at": event.updated_at,
        }
    )


def _serialize_thread(thread: HotelMessageThread) -> HotelMessageThreadRead:
    sorted_events = sorted(thread.events, key=lambda item: (item.created_at, item.id))
    return HotelMessageThreadRead.model_validate(
        {
            "id": thread.id,
            "property_id": thread.property_id,
            "reservation_id": thread.reservation_id,
            "guest_id": thread.guest_id,
            "channel": thread.channel,
            "status": thread.status,
            "subject": thread.subject,
            "guest_name": thread.guest_name,
            "guest_email": thread.guest_email,
            "last_message_at": thread.last_message_at,
            "last_direction": thread.last_direction,
            "created_at": thread.created_at,
            "updated_at": thread.updated_at,
            "events": [_serialize_event(event) for event in sorted_events],
        }
    )


async def ensure_default_message_templates(db: AsyncSession) -> None:
    existing = (
        await db.execute(
            select(HotelMessageTemplate).where(HotelMessageTemplate.property_id.is_(None))
        )
    ).scalars().all()
    existing_codes = {template.code for template in existing}
    for definition in DEFAULT_MESSAGE_TEMPLATES:
        if definition["code"] in existing_codes:
            continue
        db.add(
            HotelMessageTemplate(
                property_id=None,
                code=definition["code"],
                name=definition["name"],
                channel=definition["channel"],
                category=definition["category"],
                subject_template=definition["subject_template"],
                body_template=definition["body_template"],
                is_default=True,
                is_active=True,
            )
        )
    await db.flush()


async def list_message_templates(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> list[HotelMessageTemplateRead]:
    property_record = await _get_property_scoped(db, hotel_access=hotel_access, property_id=property_id)
    await ensure_default_message_templates(db)
    result = await db.execute(
        select(HotelMessageTemplate)
        .where(
            or_(
                HotelMessageTemplate.property_id == property_record.id,
                HotelMessageTemplate.property_id.is_(None),
            )
        )
        .order_by(
            HotelMessageTemplate.property_id.desc().nulls_last(),
            HotelMessageTemplate.is_default.desc(),
            HotelMessageTemplate.name.asc(),
            HotelMessageTemplate.id.asc(),
        )
    )
    return [_serialize_template(template) for template in result.scalars().all()]


async def create_message_template(
    db: AsyncSession,
    *,
    payload: HotelMessageTemplateCreate,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> HotelMessageTemplateRead:
    property_record = await _get_property_scoped(db, hotel_access=hotel_access, property_id=property_id)
    normalized_code = payload.code.strip().lower().replace(" ", "_").replace("-", "_")
    existing = (
        await db.execute(
            select(HotelMessageTemplate)
            .where(
                HotelMessageTemplate.property_id == property_record.id,
                HotelMessageTemplate.code == normalized_code,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status_code=409, detail="Message template code already exists")

    template = HotelMessageTemplate(
        property_id=property_record.id,
        code=normalized_code,
        name=payload.name.strip(),
        channel=payload.channel.strip().lower(),
        category=payload.category.strip().lower(),
        subject_template=payload.subject_template,
        body_template=payload.body_template,
        metadata_json=payload.metadata_json,
        is_default=payload.is_default,
        is_active=payload.is_active,
    )
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return _serialize_template(template)


async def update_message_template(
    db: AsyncSession,
    *,
    template_id: int,
    payload: HotelMessageTemplateUpdate,
    hotel_access: HotelAccessContext,
) -> HotelMessageTemplateRead:
    template = await db.get(HotelMessageTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Message template not found")
    if template.property_id is None:
        raise HTTPException(status_code=400, detail="System message templates are read-only")
    if template.property_id not in hotel_access.property_ids:
        raise HTTPException(status_code=403, detail="User does not have access to this message template")

    if payload.name is not None:
        template.name = payload.name.strip()
    if payload.channel is not None:
        template.channel = payload.channel.strip().lower()
    if payload.category is not None:
        template.category = payload.category.strip().lower()
    if payload.subject_template is not None:
        template.subject_template = payload.subject_template
    if payload.body_template is not None:
        template.body_template = payload.body_template
    if payload.metadata_json is not None:
        template.metadata_json = payload.metadata_json
    if payload.is_default is not None:
        template.is_default = payload.is_default
    if payload.is_active is not None:
        template.is_active = payload.is_active

    await db.flush()
    await db.refresh(template)
    return _serialize_template(template)


async def list_message_threads(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
    reservation_id: int | None = None,
    limit: int = 100,
) -> list[HotelMessageThreadRead]:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    query = (
        select(HotelMessageThread)
        .where(HotelMessageThread.property_id == resolved_property_id)
        .options(
            selectinload(HotelMessageThread.events).selectinload(HotelMessageEvent.template),
        )
        .order_by(HotelMessageThread.last_message_at.desc().nullslast(), HotelMessageThread.id.desc())
        .limit(limit)
    )
    if reservation_id is not None:
        query = query.where(HotelMessageThread.reservation_id == reservation_id)
    result = await db.execute(query)
    return [_serialize_thread(thread) for thread in result.scalars().unique().all()]


async def _resolve_message_template(
    db: AsyncSession,
    *,
    property_id: int,
    template_id: int | None,
    template_code: str | None,
) -> HotelMessageTemplate | None:
    await ensure_default_message_templates(db)
    if template_id is not None:
        template = await db.get(HotelMessageTemplate, template_id)
        if template is None or (template.property_id not in {None, property_id}):
            raise HTTPException(status_code=404, detail="Message template not found")
        return template
    if template_code:
        template = (
            await db.execute(
                select(HotelMessageTemplate)
                .where(
                    HotelMessageTemplate.code == template_code.strip().lower(),
                    or_(
                        HotelMessageTemplate.property_id == property_id,
                        HotelMessageTemplate.property_id.is_(None),
                    ),
                )
                .order_by(HotelMessageTemplate.property_id.desc().nulls_last())
                .limit(1)
            )
        ).scalar_one_or_none()
        if template is None:
            raise HTTPException(status_code=404, detail="Message template not found")
        return template
    return None


def _build_message_context(reservation, property_record: HotelProperty) -> dict[str, str]:
    return {
        "booking_id": reservation.booking_id or f"R-{reservation.id}",
        "guest_name": reservation.guest_name or "Guest",
        "property_name": property_record.name,
        "check_in": reservation.check_in.isoformat(),
        "check_out": reservation.check_out.isoformat(),
        "room_number": reservation.room or "",
        "room_type": reservation.room_type_label or "",
    }


async def send_reservation_message(
    db: AsyncSession,
    *,
    reservation_id: int,
    payload: HotelMessageSendRequest,
    hotel_access: HotelAccessContext,
) -> HotelMessageThreadRead:
    reservation = await get_reservation_with_relations(
        db,
        property_id=hotel_access.active_property_id or 0,
        reservation_id=reservation_id,
    )
    if reservation is None:
        for property_id in hotel_access.property_ids:
            reservation = await get_reservation_with_relations(
                db,
                property_id=property_id,
                reservation_id=reservation_id,
            )
            if reservation is not None:
                break
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")

    property_record = await db.get(HotelProperty, reservation.property_id)
    if property_record is None:
        raise HTTPException(status_code=404, detail="Hotel property not found")

    template = await _resolve_message_template(
        db,
        property_id=reservation.property_id,
        template_id=payload.template_id,
        template_code=payload.template_code,
    )
    context = _build_message_context(reservation, property_record)

    recipient_email = (payload.recipient_email or reservation.guest_email or "").strip()
    if not recipient_email:
        raise HTTPException(status_code=400, detail="Reservation message requires a recipient email")

    rendered_subject = payload.subject
    rendered_body = payload.body_text
    if template is not None:
        rendered_subject = rendered_subject or _render_template(template.subject_template, context)
        rendered_body = rendered_body or _render_template(template.body_template, context)
    rendered_subject = (rendered_subject or f"Nachricht zu Ihrer Buchung {context['booking_id']}").strip()
    rendered_body = (rendered_body or "").strip()
    if not rendered_body:
        raise HTTPException(status_code=400, detail="Reservation message requires a message body")

    thread: HotelMessageThread | None = None
    if payload.thread_id is not None:
        thread = await db.get(HotelMessageThread, payload.thread_id)
        if thread is None or thread.property_id != reservation.property_id:
            raise HTTPException(status_code=404, detail="Message thread not found")
    else:
        thread = (
            await db.execute(
                select(HotelMessageThread)
                .where(
                    HotelMessageThread.property_id == reservation.property_id,
                    HotelMessageThread.reservation_id == reservation.id,
                    HotelMessageThread.channel == "email",
                    HotelMessageThread.status == "open",
                )
                .order_by(HotelMessageThread.last_message_at.desc().nullslast(), HotelMessageThread.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    if thread is None:
        created_by_user_id = await _safe_user_id(db, getattr(hotel_access.user, "id", None))
        thread = HotelMessageThread(
            property_id=reservation.property_id,
            reservation_id=reservation.id,
            guest_id=reservation.guest_id,
            channel="email",
            status="open",
            subject=rendered_subject,
            guest_name=reservation.guest_name,
            guest_email=recipient_email,
            created_by_user_id=created_by_user_id,
        )
        db.add(thread)
        await db.flush()

    event = HotelMessageEvent(
        property_id=reservation.property_id,
        thread_id=thread.id,
        template_id=template.id if template is not None else None,
        direction="outbound",
        channel="email",
        subject=rendered_subject,
        body_text=rendered_body,
        sender_email=None,
        recipient_email=recipient_email,
        status="queued",
        metadata_json={
            "reservation_id": reservation.id,
            "booking_id": reservation.booking_id,
            **(payload.metadata_json or {}),
        },
    )
    db.add(event)
    await db.flush()

    now = datetime.now(timezone.utc)
    try:
        await send_email_reply(to=recipient_email, subject=rendered_subject, body=rendered_body)
        event.status = "sent"
        event.sent_at = now
    except Exception as exc:
        event.status = "failed"
        event.error_message = str(exc)
        thread.last_message_at = now
        thread.last_direction = "outbound"
        thread.subject = rendered_subject
        thread.guest_name = reservation.guest_name
        thread.guest_email = recipient_email
        await db.flush()
        raise HTTPException(status_code=502, detail="Failed to send reservation message") from exc

    thread.last_message_at = now
    thread.last_direction = "outbound"
    thread.subject = rendered_subject
    thread.guest_name = reservation.guest_name
    thread.guest_email = recipient_email
    await db.flush()

    refreshed = (
        await db.execute(
            select(HotelMessageThread)
            .where(HotelMessageThread.id == thread.id)
            .options(
                selectinload(HotelMessageThread.events).selectinload(HotelMessageEvent.template),
            )
        )
    ).scalar_one()
    return _serialize_thread(refreshed)
