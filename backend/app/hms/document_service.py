from __future__ import annotations

from datetime import date, datetime, timezone
import re

from fastapi import HTTPException
from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import HotelAccessContext
from app.hms.folio_service import ensure_folio_for_reservation_record
from app.hms.models import (
    DocumentBlueprint,
    DocumentTemplate,
    HotelDocument,
    HotelFolio,
    HotelInvoice,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
    RoomType,
)
from app.hms.schemas import HotelDocumentGenerateRequest

DOCUMENT_KIND_ALIASES = {
    "invoice": "invoice",
    "receipt": "receipt",
    "payment_receipt": "receipt",
    "debit_note": "debit_note",
    "debit": "debit_note",
    "debit_receipt": "debit_note",
    "storno": "storno",
    "reversal": "storno",
    "cancellation": "storno",
    "registration": "registration",
    "registration_form": "registration",
    "offer": "offer",
    "confirmation": "confirmation",
}

DOCUMENT_BLUEPRINTS: tuple[dict[str, str], ...] = (
    {
        "code": "hotel_invoice",
        "document_kind": "invoice",
        "name": "Hotel Invoice",
        "description": "Guest invoice based on folio line items and payments.",
        "default_title_template": "Rechnung {{document_number}}",
        "default_subject_template": "Ihre Rechnung {{document_number}} für {{property_name}}",
        "default_body_template": (
            "Rechnung {{document_number}}\n"
            "{{property_name}}\n"
            "{{property_address}}\n\n"
            "Gast: {{guest_name}}\n"
            "Buchung: {{booking_id}}\n"
            "Aufenthalt: {{check_in}} bis {{check_out}}\n"
            "Zimmer: {{room_display}}\n"
            "Folio: {{folio_number}}\n\n"
            "Leistungen:\n{{folio_lines}}\n\n"
            "Zwischensumme: {{subtotal}} {{currency}}\n"
            "Gesamt: {{total}} {{currency}}\n"
            "Bereits bezahlt: {{paid_amount}} {{currency}}\n"
            "Offen: {{balance_due}} {{currency}}\n"
        ),
    },
    {
        "code": "hotel_payment_receipt",
        "document_kind": "receipt",
        "name": "Payment Receipt",
        "description": "Simple payment receipt for completed or partial hotel payments.",
        "default_title_template": "Zahlungsbeleg {{document_number}}",
        "default_subject_template": "Ihr Zahlungsbeleg {{document_number}} für {{property_name}}",
        "default_body_template": (
            "Zahlungsbeleg {{document_number}}\n"
            "{{property_name}}\n"
            "{{property_address}}\n\n"
            "Gast: {{guest_name}}\n"
            "Buchung: {{booking_id}}\n"
            "Folio: {{folio_number}}\n"
            "Rechnung: {{invoice_number}}\n"
            "Zimmer: {{room_display}}\n\n"
            "Gesamtbetrag: {{total}} {{currency}}\n"
            "Bereits bezahlt: {{paid_amount}} {{currency}}\n"
            "Offener Betrag: {{balance_due}} {{currency}}\n\n"
            "Letzte Zahlung: {{last_payment_amount}} {{currency}}\n"
            "Zahlungsart: {{last_payment_method}}\n"
            "Zahlungsdatum: {{last_payment_date}}\n"
        ),
    },
    {
        "code": "hotel_debit_note",
        "document_kind": "debit_note",
        "name": "Debit Note",
        "description": "Debit note for outstanding hotel balances.",
        "default_title_template": "Belastungsbeleg {{document_number}}",
        "default_subject_template": "Ihr Belastungsbeleg {{document_number}} für {{property_name}}",
        "default_body_template": (
            "Belastungsbeleg {{document_number}}\n"
            "{{property_name}}\n\n"
            "Gast: {{guest_name}}\n"
            "Buchung: {{booking_id}}\n"
            "Rechnung: {{invoice_number}}\n"
            "Zimmer: {{room_display}}\n\n"
            "Gesamtbetrag: {{total}} {{currency}}\n"
            "Bereits bezahlt: {{paid_amount}} {{currency}}\n"
            "Restbetrag: {{balance_due}} {{currency}}\n"
        ),
    },
    {
        "code": "hotel_storno",
        "document_kind": "storno",
        "name": "Storno Document",
        "description": "Cancellation or reversal document for hotel invoices.",
        "default_title_template": "Storno {{document_number}}",
        "default_subject_template": "Ihr Stornobeleg {{document_number}} für {{property_name}}",
        "default_body_template": (
            "Stornobeleg {{document_number}}\n"
            "{{property_name}}\n\n"
            "Gast: {{guest_name}}\n"
            "Buchung: {{booking_id}}\n"
            "Rechnung: {{invoice_number}}\n"
            "Zimmer: {{room_display}}\n\n"
            "Dieser Beleg dokumentiert eine Stornierung oder Korrektur."
        ),
    },
    {
        "code": "hotel_registration_form",
        "document_kind": "registration",
        "name": "Registration Form",
        "description": "Arrival registration form for front desk completion.",
        "default_title_template": "Meldeschein {{booking_id}}",
        "default_subject_template": "Ihr Meldeschein für {{property_name}}",
        "default_body_template": (
            "Meldeschein\n"
            "{{property_name}}\n\n"
            "Gast: {{guest_name}}\n"
            "E-Mail: {{guest_email}}\n"
            "Telefon: {{guest_phone}}\n"
            "Buchung: {{booking_id}}\n"
            "Anreise: {{check_in}}\n"
            "Abreise: {{check_out}}\n"
            "Zimmerkategorie: {{room_type_label}}\n"
            "Zimmer: {{room_display}}\n"
            "Erwachsene: {{adults}}\n"
            "Kinder: {{children}}\n"
        ),
    },
    {
        "code": "hotel_offer",
        "document_kind": "offer",
        "name": "Offer",
        "description": "Offer document for a pending or proposed stay.",
        "default_title_template": "Angebot {{booking_id}}",
        "default_subject_template": "Ihr Angebot für {{property_name}}",
        "default_body_template": (
            "Angebot für Ihren Aufenthalt\n\n"
            "Sehr geehrte/r {{guest_name}},\n\n"
            "wir freuen uns, Ihnen folgendes Angebot für {{property_name}} zu machen:\n"
            "- Aufenthalt: {{check_in}} bis {{check_out}}\n"
            "- Zimmerkategorie: {{room_type_label}}\n"
            "- Gäste: {{adults}} Erwachsene, {{children}} Kinder\n"
            "- Angebotspreis: {{total}} {{currency}}\n\n"
            "Bei Rückfragen stehen wir gern zur Verfügung.\n"
        ),
    },
    {
        "code": "hotel_confirmation",
        "document_kind": "confirmation",
        "name": "Confirmation",
        "description": "Booking confirmation document for confirmed hotel reservations.",
        "default_title_template": "Buchungsbestätigung {{booking_id}}",
        "default_subject_template": "Ihre Buchungsbestätigung für {{property_name}}",
        "default_body_template": (
            "Buchungsbestätigung\n\n"
            "Vielen Dank für Ihre Buchung bei {{property_name}}.\n\n"
            "Gast: {{guest_name}}\n"
            "Buchung: {{booking_id}}\n"
            "Aufenthalt: {{check_in}} bis {{check_out}}\n"
            "Zimmerkategorie: {{room_type_label}}\n"
            "Zimmer: {{room_display}}\n"
            "Gesamtbetrag: {{total}} {{currency}}\n"
            "Zahlungsstatus: {{payment_status}}\n"
        ),
    },
)


def _normalize_document_kind(value: str) -> str:
    normalized = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    document_kind = DOCUMENT_KIND_ALIASES.get(normalized)
    if document_kind is None:
        raise HTTPException(status_code=400, detail="Unsupported hotel document kind")
    return document_kind


async def _existing_user_id(db: AsyncSession, user_id: int | None) -> int | None:
    if user_id is None:
        return None
    from app.auth.models import User

    existing = await db.get(User, user_id)
    return existing.id if existing is not None else None


async def _resolve_property_id(hotel_access: HotelAccessContext, property_id: int | None) -> int:
    resolved = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")
    resolved = resolved or hotel_access.active_property_id
    if resolved is None:
        raise HTTPException(status_code=403, detail="No hotel property access configured for user")
    return resolved


async def _seed_document_blueprints(db: AsyncSession) -> None:
    for definition in DOCUMENT_BLUEPRINTS:
        existing = (
            await db.execute(select(DocumentBlueprint).where(DocumentBlueprint.code == definition["code"]))
        ).scalar_one_or_none()
        if existing is None:
            blueprint = DocumentBlueprint(**definition)
            db.add(blueprint)
            await db.flush()
            db.add(
                DocumentTemplate(
                    property_id=None,
                    blueprint_id=blueprint.id,
                    code=definition["code"],
                    name=definition["name"],
                    language="de",
                    subject_template=definition["default_subject_template"],
                    title_template=definition["default_title_template"],
                    body_template=definition["default_body_template"],
                    metadata_json={"document_kind": definition["document_kind"]},
                    is_default=True,
                    is_active=True,
                )
            )
            await db.flush()
            continue

        template_existing = (
            await db.execute(
                select(DocumentTemplate).where(
                    DocumentTemplate.blueprint_id == existing.id,
                    DocumentTemplate.property_id.is_(None),
                    DocumentTemplate.code == definition["code"],
                )
            )
        ).scalar_one_or_none()
        if template_existing is None:
            db.add(
                DocumentTemplate(
                    property_id=None,
                    blueprint_id=existing.id,
                    code=definition["code"],
                    name=definition["name"],
                    language="de",
                    subject_template=definition["default_subject_template"],
                    title_template=definition["default_title_template"],
                    body_template=definition["default_body_template"],
                    metadata_json={"document_kind": definition["document_kind"]},
                    is_default=True,
                    is_active=True,
                )
            )
            await db.flush()


def _render_template(template: str | None, context: dict[str, str]) -> str | None:
    if template is None:
        return None

    def replace(match: re.Match[str]) -> str:
        key = match.group(1).strip()
        return context.get(key, "")

    return re.sub(r"{{\s*([a-zA-Z0-9_]+)\s*}}", replace, template)


async def _reservation_context(
    db: AsyncSession,
    reservation: HotelReservation,
) -> dict[str, str]:
    property_record = await db.get(HotelProperty, reservation.property_id)
    stay = (
        await db.execute(select(HotelStay).where(HotelStay.reservation_id == reservation.id))
    ).scalar_one_or_none()
    folio = await ensure_folio_for_reservation_record(db, reservation)

    room_number = reservation.room
    room_type_label = reservation.room_type_label
    room_id = stay.room_id if stay is not None else None
    if room_id is not None:
        room = await db.get(Room, room_id)
        if room is not None:
            room_number = room.room_number
            room_type_label = await db.scalar(select(RoomType.name).where(RoomType.id == room.room_type_id)) or room_type_label

    paid_amount = round(float(folio.total) - float(folio.balance_due), 2)
    completed_payments = sorted(
        [payment for payment in folio.payments if (payment.status or "").lower() == "completed"],
        key=lambda payment: payment.paid_at or payment.created_at,
    )
    last_payment = completed_payments[-1] if completed_payments else None
    folio_lines = "\n".join(
        f"- {line.description}: {float(line.total_price):.2f} {folio.currency}"
        for line in sorted(folio.lines, key=lambda item: item.id)
    ) or "- Keine Positionen"

    return {
        "property_name": property_record.name if property_record is not None else "Hotel",
        "property_address": property_record.address if property_record is not None else "",
        "property_city": property_record.city if property_record is not None else "",
        "guest_name": reservation.guest_name,
        "guest_email": reservation.guest_email or "",
        "guest_phone": reservation.guest_phone or reservation.phone or "",
        "booking_id": reservation.booking_id,
        "check_in": reservation.check_in.isoformat(),
        "check_out": reservation.check_out.isoformat(),
        "room_type_label": room_type_label or "",
        "room_display": room_number or "Noch nicht zugewiesen",
        "adults": str(reservation.adults),
        "children": str(reservation.children),
        "payment_status": reservation.payment_status,
        "currency": reservation.currency,
        "total": f"{float(folio.total):.2f}",
        "subtotal": f"{float(folio.subtotal):.2f}",
        "balance_due": f"{float(folio.balance_due):.2f}",
        "paid_amount": f"{paid_amount:.2f}",
        "last_payment_amount": f"{float(last_payment.amount):.2f}" if last_payment is not None else "0.00",
        "last_payment_method": last_payment.method if last_payment is not None else "",
        "last_payment_date": last_payment.paid_at.date().isoformat() if last_payment and last_payment.paid_at else "",
        "folio_number": folio.folio_number,
        "invoice_number": "",
        "folio_lines": folio_lines,
    }


async def _get_reservation_scoped(
    db: AsyncSession,
    *,
    reservation_id: int,
    property_id: int,
) -> HotelReservation:
    reservation = await db.get(HotelReservation, reservation_id)
    if reservation is None or reservation.property_id != property_id:
        raise HTTPException(status_code=404, detail="Hotel reservation not found")
    return reservation


async def _resolve_template(
    db: AsyncSession,
    *,
    property_id: int,
    document_kind: str,
    template_id: int | None,
    template_code: str | None,
) -> tuple[DocumentBlueprint, DocumentTemplate]:
    await _seed_document_blueprints(db)

    if template_id is not None:
        template = await db.get(DocumentTemplate, template_id)
        if template is None or not template.is_active:
            raise HTTPException(status_code=404, detail="Document template not found")
        blueprint = await db.get(DocumentBlueprint, template.blueprint_id)
        if blueprint is None or blueprint.document_kind != document_kind:
            raise HTTPException(status_code=400, detail="Template does not match requested document kind")
        if template.property_id is not None and template.property_id != property_id:
            raise HTTPException(status_code=403, detail="Template does not belong to the requested hotel property")
        return blueprint, template

    if template_code:
        template = (
            await db.execute(
                select(DocumentTemplate)
                .join(DocumentBlueprint, DocumentBlueprint.id == DocumentTemplate.blueprint_id)
                .where(
                    DocumentTemplate.code == template_code,
                    DocumentTemplate.is_active.is_(True),
                    DocumentBlueprint.document_kind == document_kind,
                    DocumentBlueprint.is_active.is_(True),
                    or_(DocumentTemplate.property_id == property_id, DocumentTemplate.property_id.is_(None)),
                )
                .order_by(DocumentTemplate.property_id.is_(None), DocumentTemplate.id.asc())
            )
        ).scalars().first()
        if template is None:
            raise HTTPException(status_code=404, detail="Document template not found")
        blueprint = await db.get(DocumentBlueprint, template.blueprint_id)
        if blueprint is None:
            raise HTTPException(status_code=404, detail="Document blueprint not found")
        return blueprint, template

    template = (
        await db.execute(
            select(DocumentTemplate)
            .join(DocumentBlueprint, DocumentBlueprint.id == DocumentTemplate.blueprint_id)
            .where(
                DocumentBlueprint.document_kind == document_kind,
                DocumentBlueprint.is_active.is_(True),
                DocumentTemplate.is_active.is_(True),
                or_(DocumentTemplate.property_id == property_id, DocumentTemplate.property_id.is_(None)),
            )
            .order_by(DocumentTemplate.property_id.is_(None), DocumentTemplate.is_default.desc(), DocumentTemplate.id.asc())
        )
    ).scalars().first()
    if template is None:
        raise HTTPException(status_code=404, detail="No active document template found")
    blueprint = await db.get(DocumentBlueprint, template.blueprint_id)
    if blueprint is None:
        raise HTTPException(status_code=404, detail="Document blueprint not found")
    return blueprint, template


async def _next_document_number(
    db: AsyncSession,
    *,
    property_id: int,
    document_kind: str,
    year: int | None = None,
) -> str:
    prefixes = {
        "invoice": "INV",
        "receipt": "RCT",
        "debit_note": "DBT",
        "storno": "STO",
        "registration": "REG",
        "offer": "OFF",
        "confirmation": "CNF",
    }
    prefix = prefixes[document_kind]
    doc_year = year or datetime.now(timezone.utc).year
    doc_prefix = f"{prefix}-{doc_year}-"
    suffix_start = len(doc_prefix) + 1
    result = await db.execute(
        select(func.max(cast(func.substr(HotelDocument.document_number, suffix_start), Integer))).where(
            HotelDocument.property_id == property_id,
            HotelDocument.document_number.like(f"{doc_prefix}%"),
        )
    )
    next_sequence = (result.scalar() or 0) + 1
    return f"{doc_prefix}{next_sequence:04d}"


async def list_document_blueprints(db: AsyncSession) -> list[DocumentBlueprint]:
    await _seed_document_blueprints(db)
    result = await db.execute(
        select(DocumentBlueprint).where(DocumentBlueprint.is_active.is_(True)).order_by(DocumentBlueprint.document_kind.asc(), DocumentBlueprint.id.asc())
    )
    return list(result.scalars().all())


async def list_document_templates(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> list[DocumentTemplate]:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    await _seed_document_blueprints(db)
    result = await db.execute(
        select(DocumentTemplate)
        .where(
            DocumentTemplate.is_active.is_(True),
            or_(DocumentTemplate.property_id == resolved_property_id, DocumentTemplate.property_id.is_(None)),
        )
        .order_by(DocumentTemplate.property_id.is_(None), DocumentTemplate.blueprint_id.asc(), DocumentTemplate.id.asc())
    )
    return list(result.scalars().all())


async def list_documents(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
    document_kind: str | None = None,
    reservation_id: int | None = None,
    stay_id: int | None = None,
    limit: int = 100,
) -> list[HotelDocument]:
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    query = select(HotelDocument).where(HotelDocument.property_id == resolved_property_id)
    if document_kind is not None:
        query = query.where(HotelDocument.document_kind == _normalize_document_kind(document_kind))
    if reservation_id is not None:
        query = query.where(HotelDocument.reservation_id == reservation_id)
    if stay_id is not None:
        query = query.where(HotelDocument.stay_id == stay_id)
    result = await db.execute(
        query.order_by(HotelDocument.created_at.desc(), HotelDocument.id.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_document(
    db: AsyncSession,
    *,
    document_id: int,
    hotel_access: HotelAccessContext,
) -> HotelDocument:
    document = await db.get(HotelDocument, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Hotel document not found")
    if document.property_id not in hotel_access.property_ids:
        raise HTTPException(status_code=403, detail="User does not have access to this hotel's documents")
    return document


async def generate_document(
    db: AsyncSession,
    *,
    payload: HotelDocumentGenerateRequest,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
) -> HotelDocument:
    document_kind = _normalize_document_kind(payload.document_kind)
    resolved_property_id = await _resolve_property_id(hotel_access, property_id)
    reservation = await _get_reservation_scoped(db, reservation_id=payload.reservation_id, property_id=resolved_property_id)
    blueprint, template = await _resolve_template(
        db,
        property_id=resolved_property_id,
        document_kind=document_kind,
        template_id=payload.template_id,
        template_code=payload.template_code,
    )

    if document_kind == "invoice":
        await ensure_folio_for_reservation_record(db, reservation)

    context = await _reservation_context(db, reservation)
    stay = (
        await db.execute(select(HotelStay).where(HotelStay.reservation_id == reservation.id))
    ).scalar_one_or_none()
    folio = (
        await db.execute(
            select(HotelFolio).where(HotelFolio.reservation_id == reservation.id)
        )
    ).scalar_one_or_none()
    invoice = (
        await db.execute(
            select(HotelInvoice)
            .where(HotelInvoice.reservation_id == reservation.id)
            .order_by(HotelInvoice.created_at.desc(), HotelInvoice.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if document_kind == "invoice" and folio is None:
        raise HTTPException(status_code=400, detail="Invoice requires a hotel folio")

    document_number = await _next_document_number(
        db,
        property_id=resolved_property_id,
        document_kind=document_kind,
    )
    context["document_number"] = document_number
    context["invoice_number"] = invoice.invoice_number if invoice is not None else ""

    title = _render_template(template.title_template, context) or blueprint.default_title_template
    subject = _render_template(template.subject_template, context)
    body_text = _render_template(template.body_template, context) or ""

    document = HotelDocument(
        property_id=resolved_property_id,
        reservation_id=reservation.id,
        stay_id=stay.id if stay is not None else None,
        folio_id=folio.id if folio is not None else None,
        blueprint_id=blueprint.id,
        template_id=template.id,
        document_kind=document_kind,
        document_number=document_number,
        status="generated",
        subject=subject,
        title=title,
        body_text=body_text,
        payload_json=context,
        metadata_json={
            "blueprint_code": blueprint.code,
            "template_code": template.code,
        },
        issued_at=datetime.now(timezone.utc),
        created_by_user_id=await _existing_user_id(db, getattr(hotel_access.user, "id", None)),
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document
