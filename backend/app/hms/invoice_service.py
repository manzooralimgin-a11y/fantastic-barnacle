from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import Integer, cast, delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dashboard.service import get_audit_timeline
from app.dependencies import HotelAccessContext
from app.hms.document_service import generate_document, get_document
from app.hms.folio_service import (
    add_folio_line,
    ensure_folio_for_reservation,
    get_folio,
    post_folio_payment,
    void_folio_line,
)
from app.hms.models import (
    HotelFolio,
    HotelFolioPayment,
    HotelInvoice,
    HotelInvoiceDelivery,
    HotelInvoiceLine,
    HotelReservation,
    HotelStay,
)
from app.hms.schemas import (
    HotelDocumentGenerateRequest,
    HotelFolioLineCreate,
    HotelFolioPaymentCreate,
    HotelInvoiceSendRequest,
)
from app.shared.audit import log_human_action
from app.shared.notifications import notifications

LOCKED_INVOICE_STATUSES = {"finalized", "sent", "storno", "cancelled", "paid"}
DISPLAY_CANCELLED_STATUSES = {"cancelled", "storno"}


def _invoice_query_options() -> list:
    return [
        selectinload(HotelInvoice.lines),
        selectinload(HotelInvoice.deliveries),
        selectinload(HotelInvoice.document),
        selectinload(HotelInvoice.reservation),
        selectinload(HotelInvoice.folio).selectinload(HotelFolio.lines),
        selectinload(HotelInvoice.folio).selectinload(HotelFolio.payments),
    ]


def _tax_rate_for_charge_type(charge_type: str | None) -> float:
    normalized = (charge_type or "").strip().lower()
    return 7.0 if normalized == "room" else 19.0


def _split_amounts(gross_amount: float, tax_rate: float) -> tuple[float, float]:
    if tax_rate <= 0:
        return round(gross_amount, 2), 0.0
    divisor = 1 + (tax_rate / 100)
    net_amount = round(gross_amount / divisor, 2)
    tax_amount = round(gross_amount - net_amount, 2)
    return net_amount, tax_amount


def _invoice_total(folio: HotelFolio | None, invoice: HotelInvoice) -> float:
    if folio is not None:
        return round(float(folio.total), 2)
    return round(sum(float(line.gross_amount) for line in invoice.lines), 2)


def _invoice_balance_due(folio: HotelFolio | None, invoice: HotelInvoice) -> float:
    if folio is not None:
        return round(float(folio.balance_due), 2)
    return _invoice_total(folio, invoice)


def _invoice_paid_amount(folio: HotelFolio | None, invoice: HotelInvoice) -> float:
    total = _invoice_total(folio, invoice)
    balance_due = _invoice_balance_due(folio, invoice)
    return round(max(total - balance_due, 0), 2)


def _display_payment_method(folio: HotelFolio | None, reservation: HotelReservation | None) -> str | None:
    payments = []
    if folio is not None:
        payments = sorted(
            [payment for payment in folio.payments if (payment.status or "").lower() == "completed"],
            key=lambda payment: payment.paid_at or payment.created_at,
        )
    if payments:
        return payments[-1].method
    if reservation is not None:
        return reservation.zahlungs_methode
    return None


def _derive_invoice_display_status(
    invoice: HotelInvoice,
    *,
    reservation: HotelReservation | None,
    folio: HotelFolio | None,
) -> str:
    raw_status = (invoice.status or "").strip().lower()
    if raw_status in DISPLAY_CANCELLED_STATUSES:
        return "storno" if raw_status == "storno" else "cancelled"

    balance_due = _invoice_balance_due(folio, invoice)
    total = _invoice_total(folio, invoice)
    paid_amount = _invoice_paid_amount(folio, invoice)
    if total > 0 and balance_due <= 0:
        return "paid"
    if balance_due > 0 and paid_amount > 0:
        return "partially_paid"
    if reservation is not None and reservation.check_out < date.today() and balance_due > 0:
        return "overdue"
    return "open"


def _derive_payment_status(folio: HotelFolio | None, invoice: HotelInvoice) -> str:
    balance_due = _invoice_balance_due(folio, invoice)
    total = _invoice_total(folio, invoice)
    paid_amount = _invoice_paid_amount(folio, invoice)
    if total > 0 and balance_due <= 0:
        return "paid"
    if paid_amount > 0:
        return "partially_paid"
    return "outstanding"


def _can_edit_invoice(invoice: HotelInvoice) -> bool:
    return (invoice.status or "draft").strip().lower() not in LOCKED_INVOICE_STATUSES


def _can_finalize_invoice(invoice: HotelInvoice) -> bool:
    normalized_status = (invoice.status or "draft").strip().lower()
    return normalized_status not in {"finalized", "sent", "storno", "cancelled", "paid"}


def _require_invoice_editable(invoice: HotelInvoice) -> None:
    if not _can_edit_invoice(invoice):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice is locked. Use storno or reversal flow instead of editing the bill directly.",
        )


def _build_allowed_actions(invoice: HotelInvoice, *, reservation: HotelReservation | None, folio: HotelFolio | None) -> dict[str, bool]:
    status_label = _derive_invoice_display_status(invoice, reservation=reservation, folio=folio)
    paid_amount = _invoice_paid_amount(folio, invoice)
    balance_due = _invoice_balance_due(folio, invoice)
    return {
        "can_edit": _can_edit_invoice(invoice),
        "can_add_payment": status_label not in {"paid", "storno", "cancelled"},
        "can_finalize": _can_finalize_invoice(invoice),
        "can_generate_invoice": True,
        "can_generate_receipt": paid_amount > 0,
        "can_generate_debit_note": balance_due > 0 and status_label not in {"storno", "cancelled"},
        "can_generate_storno": status_label not in {"storno", "cancelled"},
    }


async def _get_reservation_scoped(
    db: AsyncSession,
    *,
    reservation_id: int,
    hotel_access: HotelAccessContext,
) -> HotelReservation:
    reservation = await db.get(HotelReservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Hotel reservation not found")
    if reservation.property_id not in hotel_access.property_ids:
        raise HTTPException(status_code=403, detail="User does not have access to this reservation's hotel property")
    return reservation


async def _next_invoice_number(
    db: AsyncSession,
    *,
    property_id: int,
    year: int | None = None,
) -> str:
    invoice_year = year or datetime.now(timezone.utc).year
    prefix = f"INV-{invoice_year}-"
    suffix_start = len(prefix) + 1
    result = await db.execute(
        select(
            func.max(cast(func.substr(HotelInvoice.invoice_number, suffix_start), Integer))
        ).where(
            HotelInvoice.property_id == property_id,
            HotelInvoice.invoice_number.like(f"{prefix}%"),
        )
    )
    next_sequence = (result.scalar() or 0) + 1
    return f"{prefix}{next_sequence:04d}"


async def _load_invoice_detail(db: AsyncSession, invoice_id: int) -> HotelInvoice:
    result = await db.execute(
        select(HotelInvoice)
        .execution_options(populate_existing=True)
        .options(*_invoice_query_options())
        .where(HotelInvoice.id == invoice_id)
    )
    invoice = result.scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Hotel invoice not found")
    return invoice


async def _get_invoice_scoped(
    db: AsyncSession,
    *,
    invoice_id: int,
    hotel_access: HotelAccessContext,
) -> HotelInvoice:
    invoice = await _load_invoice_detail(db, invoice_id)
    if invoice.property_id not in hotel_access.property_ids:
        raise HTTPException(status_code=403, detail="User does not have access to this hotel's invoices")
    return invoice


async def _sync_invoice_lines(
    db: AsyncSession,
    *,
    invoice: HotelInvoice,
    folio: HotelFolio,
) -> None:
    await db.execute(delete(HotelInvoiceLine).where(HotelInvoiceLine.invoice_id == invoice.id))
    await db.flush()

    ordered_lines = sorted(
        [line for line in folio.lines if (line.status or "posted") != "void"],
        key=lambda line: (line.service_date or invoice.created_at.date(), line.id),
    )
    for index, folio_line in enumerate(ordered_lines, start=1):
        gross_amount = round(float(folio_line.total_price), 2)
        tax_rate = _tax_rate_for_charge_type(folio_line.charge_type)
        net_amount, tax_amount = _split_amounts(gross_amount, tax_rate)
        db.add(
            HotelInvoiceLine(
                invoice_id=invoice.id,
                folio_line_id=folio_line.id,
                line_number=index,
                charge_type=folio_line.charge_type,
                description=folio_line.description,
                quantity=float(folio_line.quantity),
                unit_price=float(folio_line.unit_price),
                net_amount=net_amount,
                tax_rate=tax_rate,
                tax_amount=tax_amount,
                gross_amount=gross_amount,
                service_date=folio_line.service_date,
            )
        )
    await db.flush()


async def _ensure_invoice_document(
    db: AsyncSession,
    *,
    invoice: HotelInvoice,
    reservation: HotelReservation,
    hotel_access: HotelAccessContext,
) -> int:
    if invoice.document_id is not None:
        try:
            document = await get_document(db, document_id=invoice.document_id, hotel_access=hotel_access)
        except HTTPException:
            document = None
        if document is not None:
            return document.id

    document = await generate_document(
        db,
        payload=HotelDocumentGenerateRequest(
            reservation_id=reservation.id,
            document_kind="invoice",
        ),
        hotel_access=hotel_access,
        property_id=reservation.property_id,
    )
    invoice.document_id = document.id
    invoice.issued_at = invoice.issued_at or datetime.now(timezone.utc)
    if (invoice.status or "draft").strip().lower() not in LOCKED_INVOICE_STATUSES:
        invoice.status = "issued"
    await db.flush()
    return document.id


def _build_preview_data(invoice: HotelInvoice, reservation: HotelReservation, folio: HotelFolio) -> dict[str, object]:
    items: list[dict[str, object]] = []
    netto_7 = 0.0
    mwst_7 = 0.0
    netto_19 = 0.0
    mwst_19 = 0.0

    for line in sorted(invoice.lines, key=lambda item: item.line_number):
        tax_rate = float(line.tax_rate)
        item_payload = {
            "nr": line.line_number,
            "datum_von": line.service_date.isoformat() if line.service_date else reservation.check_in.isoformat(),
            "datum_bis": line.service_date.isoformat() if line.service_date else reservation.check_in.isoformat(),
            "beschreibung": line.description,
            "menge": float(line.quantity),
            "netto": float(line.net_amount),
            "mwst_satz": int(tax_rate),
            "mwst": float(line.tax_amount),
            "brutto": float(line.gross_amount),
        }
        items.append(item_payload)
        if int(tax_rate) == 7:
            netto_7 += float(line.net_amount)
            mwst_7 += float(line.tax_amount)
        else:
            netto_19 += float(line.net_amount)
            mwst_19 += float(line.tax_amount)

    total_paid = round(float(folio.total) - float(folio.balance_due), 2)
    payment_status = "bezahlt" if float(folio.balance_due) <= 0 else "teilweise" if total_paid > 0 else "offen"

    return {
        "rechnungs_nr": invoice.invoice_number,
        "folio": folio.folio_number,
        "reservierung_nr": reservation.booking_id,
        "datum": (invoice.issued_at or invoice.created_at).date().isoformat(),
        "gast_name": reservation.guest_name,
        "gast_anrede": reservation.anrede or "",
        "gast_strasse": "",
        "gast_plz_stadt": "",
        "gast_land": "Deutschland",
        "firma_name": invoice.recipient_name if invoice.recipient_name and invoice.recipient_name != reservation.guest_name else "",
        "firma_strasse": "",
        "firma_plz_stadt": "",
        "firma_land": "",
        "firma_ust_id": "",
        "zimmer": reservation.room or "",
        "zimmer_typ": reservation.room_type_label or "",
        "anreise": reservation.check_in.isoformat(),
        "abreise": reservation.check_out.isoformat(),
        "items": items,
        "netto_7": round(netto_7, 2),
        "mwst_7": round(mwst_7, 2),
        "netto_19": round(netto_19, 2),
        "mwst_19": round(mwst_19, 2),
        "gesamtsumme": round(float(folio.total), 2),
        "kurtaxe": 0.0,
        "anzahlung": 0.0,
        "anzahlung_label": "",
        "zahlung": round(float(folio.balance_due), 2),
        "zahlungs_methode": (reservation.zahlungs_methode or "").lower(),
        "zahlungs_status": payment_status,
        "zahlungs_datum": invoice.sent_at.date().isoformat() if invoice.sent_at else "",
    }


def _build_reservation_summary(reservation: HotelReservation, invoice: HotelInvoice, folio: HotelFolio | None) -> dict[str, object]:
    return {
        "reservation_id": reservation.id,
        "booking_id": reservation.booking_id,
        "guest_name": reservation.guest_name,
        "guest_email": reservation.guest_email,
        "guest_phone": reservation.guest_phone or reservation.phone,
        "room": reservation.room,
        "room_type_label": reservation.room_type_label,
        "check_in": reservation.check_in,
        "check_out": reservation.check_out,
        "payment_status": _derive_payment_status(folio, invoice),
        "invoice_status": _derive_invoice_display_status(invoice, reservation=reservation, folio=folio),
    }


def _build_cash_master_row(invoice: HotelInvoice) -> dict[str, object]:
    reservation = invoice.reservation
    folio = invoice.folio
    display_status = _derive_invoice_display_status(invoice, reservation=reservation, folio=folio)
    paid_amount = _invoice_paid_amount(folio, invoice)
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "guest_or_company": invoice.recipient_name or (reservation.guest_name if reservation is not None else "Guest"),
        "guest_name": reservation.guest_name if reservation is not None else None,
        "company_name": invoice.recipient_name if reservation is None or invoice.recipient_name != reservation.guest_name else None,
        "reservation_id": invoice.reservation_id,
        "booking_id": reservation.booking_id if reservation is not None else None,
        "room_number": reservation.room if reservation is not None else None,
        "invoice_date": invoice.issued_at or invoice.created_at,
        "status": display_status,
        "invoice_status": invoice.status,
        "payment_status": _derive_payment_status(folio, invoice),
        "total_amount": _invoice_total(folio, invoice),
        "paid_amount": paid_amount,
        "balance_due": _invoice_balance_due(folio, invoice),
        "payment_method": _display_payment_method(folio, reservation),
        "currency": invoice.currency,
        "document_id": invoice.document_id,
        "folio_id": invoice.folio_id,
        "recipient_email": invoice.recipient_email,
    }


def _apply_cash_master_status_filter(query, *, invoice_status: str | None, payment_status: str | None):
    normalized_invoice_status = (invoice_status or "").strip().lower()
    if normalized_invoice_status in {"paid"}:
        query = query.where(HotelFolio.total > 0, HotelFolio.balance_due <= 0, HotelInvoice.status.notin_(DISPLAY_CANCELLED_STATUSES))
    elif normalized_invoice_status in {"partially_paid", "partial"}:
        query = query.where(
            HotelFolio.balance_due > 0,
            HotelFolio.balance_due < HotelFolio.total,
            HotelInvoice.status.notin_(DISPLAY_CANCELLED_STATUSES),
        )
    elif normalized_invoice_status == "overdue":
        query = query.where(
            HotelFolio.balance_due > 0,
            HotelReservation.check_out < date.today(),
            HotelInvoice.status.notin_(DISPLAY_CANCELLED_STATUSES),
        )
    elif normalized_invoice_status in {"cancelled", "storno"}:
        query = query.where(HotelInvoice.status.in_(DISPLAY_CANCELLED_STATUSES))
    elif normalized_invoice_status == "open":
        query = query.where(
            HotelFolio.balance_due == HotelFolio.total,
            HotelInvoice.status.notin_(DISPLAY_CANCELLED_STATUSES),
        )

    normalized_payment_status = (payment_status or "").strip().lower()
    if normalized_payment_status == "paid":
        query = query.where(HotelFolio.total > 0, HotelFolio.balance_due <= 0)
    elif normalized_payment_status in {"partial", "partially_paid"}:
        query = query.where(HotelFolio.balance_due > 0, HotelFolio.balance_due < HotelFolio.total)
    elif normalized_payment_status in {"outstanding", "open"}:
        query = query.where(HotelFolio.balance_due > 0)
    return query


def _apply_cash_master_sort(query, *, sort_by: str, sort_dir: str):
    sort_key = (sort_by or "invoice_date").strip().lower()
    descending = (sort_dir or "desc").strip().lower() != "asc"
    sort_columns = {
        "invoice_date": func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at),
        "invoice_number": HotelInvoice.invoice_number,
        "guest": func.coalesce(HotelInvoice.recipient_name, HotelReservation.guest_name),
        "room": HotelReservation.room,
        "status": HotelInvoice.status,
        "total_amount": HotelFolio.total,
        "paid_amount": HotelFolio.total - HotelFolio.balance_due,
        "balance_due": HotelFolio.balance_due,
        "payment_method": HotelReservation.zahlungs_methode,
    }
    column = sort_columns.get(sort_key, sort_columns["invoice_date"])
    return query.order_by(column.desc() if descending else column.asc(), HotelInvoice.id.desc())


async def _build_invoice_audit_timeline(
    db: AsyncSession,
    *,
    invoice: HotelInvoice,
    folio: HotelFolio | None,
) -> list[object]:
    events = []
    events.extend(await get_audit_timeline(db, entity_type="hotel_invoice", entity_id=invoice.id, limit=20))
    if folio is not None:
        events.extend(await get_audit_timeline(db, entity_type="hotel_folio", entity_id=folio.id, limit=20))

    deduped: dict[str, object] = {}
    for event in events:
        deduped[event.id] = event
    return sorted(deduped.values(), key=lambda event: event.created_at, reverse=True)[:20]


async def ensure_invoice_for_reservation(
    db: AsyncSession,
    *,
    reservation_id: int,
    hotel_access: HotelAccessContext,
) -> HotelInvoice:
    reservation = await _get_reservation_scoped(
        db,
        reservation_id=reservation_id,
        hotel_access=hotel_access,
    )
    folio = await ensure_folio_for_reservation(
        db,
        reservation_id=reservation.id,
        hotel_access=hotel_access,
    )

    result = await db.execute(
        select(HotelInvoice).where(HotelInvoice.reservation_id == reservation.id)
    )
    invoice = result.scalar_one_or_none()
    created_invoice = False
    if invoice is None:
        stay = (
            await db.execute(select(HotelStay).where(HotelStay.reservation_id == reservation.id))
        ).scalar_one_or_none()
        invoice = HotelInvoice(
            property_id=reservation.property_id,
            reservation_id=reservation.id,
            stay_id=stay.id if stay is not None else None,
            folio_id=folio.id,
            invoice_number=await _next_invoice_number(db, property_id=reservation.property_id),
            status="draft",
            currency=folio.currency,
            recipient_name=reservation.guest_name,
            recipient_email=reservation.guest_email,
            metadata_json={"reservation_booking_id": reservation.booking_id},
        )
        db.add(invoice)
        await db.flush()
        created_invoice = True
    else:
        invoice.stay_id = folio.stay_id
        invoice.folio_id = folio.id
        invoice.currency = folio.currency
        invoice.recipient_name = invoice.recipient_name or reservation.guest_name
        invoice.recipient_email = invoice.recipient_email or reservation.guest_email

    if (invoice.status or "draft").strip().lower() in LOCKED_INVOICE_STATUSES:
        return await _load_invoice_detail(db, invoice.id)

    await _sync_invoice_lines(db, invoice=invoice, folio=folio)
    await _ensure_invoice_document(
        db,
        invoice=invoice,
        reservation=reservation,
        hotel_access=hotel_access,
    )
    await log_human_action(
        db,
        action="hotel_invoice_created" if created_invoice else "hotel_invoice_refreshed",
        detail=f"{'Created' if created_invoice else 'Refreshed'} invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
        metadata_json={"reservation_id": reservation.id, "folio_id": folio.id},
    )
    await db.commit()
    return await _load_invoice_detail(db, invoice.id)


async def list_invoices(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
    reservation_id: int | None = None,
    limit: int = 100,
) -> list[HotelInvoice]:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")

    query = select(HotelInvoice).options(*_invoice_query_options())
    if resolved_property_id is not None:
        query = query.where(HotelInvoice.property_id == resolved_property_id)
    else:
        query = query.where(HotelInvoice.property_id.in_(hotel_access.property_ids))
    if reservation_id is not None:
        query = query.where(HotelInvoice.reservation_id == reservation_id)
    result = await db.execute(
        query.order_by(HotelInvoice.created_at.desc(), HotelInvoice.id.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def search_cash_master_invoices(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None = None,
    search: str | None = None,
    invoice_status: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    room: str | None = None,
    guest_company: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "invoice_date",
    sort_dir: str = "desc",
) -> dict[str, object]:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")

    base_query = (
        select(HotelInvoice)
        .options(*_invoice_query_options())
        .join(HotelReservation, HotelReservation.id == HotelInvoice.reservation_id)
        .join(HotelFolio, HotelFolio.id == HotelInvoice.folio_id)
    )
    aggregate_query = (
        select(
            func.count(HotelInvoice.id),
            func.coalesce(func.sum(HotelFolio.total), 0),
            func.coalesce(func.sum(HotelFolio.total - HotelFolio.balance_due), 0),
            func.coalesce(func.sum(HotelFolio.balance_due), 0),
        )
        .join(HotelReservation, HotelReservation.id == HotelInvoice.reservation_id)
        .join(HotelFolio, HotelFolio.id == HotelInvoice.folio_id)
    )

    if resolved_property_id is not None:
        base_query = base_query.where(HotelInvoice.property_id == resolved_property_id)
        aggregate_query = aggregate_query.where(HotelInvoice.property_id == resolved_property_id)
    else:
        base_query = base_query.where(HotelInvoice.property_id.in_(hotel_access.property_ids))
        aggregate_query = aggregate_query.where(HotelInvoice.property_id.in_(hotel_access.property_ids))

    search_value = (search or "").strip()
    if search_value:
        search_pattern = f"%{search_value}%"
        predicate = or_(
            HotelInvoice.invoice_number.ilike(search_pattern),
            HotelInvoice.recipient_name.ilike(search_pattern),
            HotelReservation.guest_name.ilike(search_pattern),
            HotelReservation.booking_id.ilike(search_pattern),
            HotelReservation.room.ilike(search_pattern),
            HotelReservation.guest_email.ilike(search_pattern),
        )
        base_query = base_query.where(predicate)
        aggregate_query = aggregate_query.where(predicate)

    guest_company_value = (guest_company or "").strip()
    if guest_company_value:
        guest_pattern = f"%{guest_company_value}%"
        predicate = or_(
            HotelInvoice.recipient_name.ilike(guest_pattern),
            HotelReservation.guest_name.ilike(guest_pattern),
            HotelReservation.guest_email.ilike(guest_pattern),
        )
        base_query = base_query.where(predicate)
        aggregate_query = aggregate_query.where(predicate)

    room_value = (room or "").strip()
    if room_value:
        room_pattern = f"%{room_value}%"
        base_query = base_query.where(HotelReservation.room.ilike(room_pattern))
        aggregate_query = aggregate_query.where(HotelReservation.room.ilike(room_pattern))

    if date_from is not None:
        base_query = base_query.where(func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)) >= date_from)
        aggregate_query = aggregate_query.where(func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)) >= date_from)
    if date_to is not None:
        base_query = base_query.where(func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)) <= date_to)
        aggregate_query = aggregate_query.where(func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)) <= date_to)

    base_query = _apply_cash_master_status_filter(base_query, invoice_status=invoice_status, payment_status=payment_status)
    aggregate_query = _apply_cash_master_status_filter(aggregate_query, invoice_status=invoice_status, payment_status=payment_status)

    payment_method_value = (payment_method or "").strip().lower()
    if payment_method_value:
        payment_exists = exists().where(
            HotelFolioPayment.folio_id == HotelInvoice.folio_id,
            HotelFolioPayment.status == "completed",
            func.lower(HotelFolioPayment.method) == payment_method_value,
        )
        reservation_method_match = func.lower(func.coalesce(HotelReservation.zahlungs_methode, "")) == payment_method_value
        predicate = or_(payment_exists, reservation_method_match)
        base_query = base_query.where(predicate)
        aggregate_query = aggregate_query.where(predicate)

    aggregate_result = await db.execute(aggregate_query)
    total_count, total_invoiced, total_paid, total_outstanding = aggregate_result.one()

    base_query = _apply_cash_master_sort(base_query, sort_by=sort_by, sort_dir=sort_dir)
    base_query = base_query.limit(page_size).offset(max(page - 1, 0) * page_size)
    rows_result = await db.execute(base_query)
    invoices = list(rows_result.scalars().all())

    return {
        "items": [_build_cash_master_row(invoice) for invoice in invoices],
        "totals": {
            "currency": invoices[0].currency if invoices else "EUR",
            "invoice_count": int(total_count or 0),
            "total_invoiced": round(float(total_invoiced or 0), 2),
            "total_paid": round(float(total_paid or 0), 2),
            "total_outstanding": round(float(total_outstanding or 0), 2),
        },
        "page": page,
        "page_size": page_size,
        "total_count": int(total_count or 0),
    }


async def get_invoice(
    db: AsyncSession,
    *,
    invoice_id: int,
    hotel_access: HotelAccessContext,
) -> HotelInvoice:
    return await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)


async def get_invoice_preview(
    db: AsyncSession,
    *,
    invoice_id: int,
    hotel_access: HotelAccessContext,
) -> dict[str, object]:
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    reservation = await _get_reservation_scoped(
        db,
        reservation_id=invoice.reservation_id,
        hotel_access=hotel_access,
    )
    folio = await ensure_folio_for_reservation(
        db,
        reservation_id=reservation.id,
        hotel_access=hotel_access,
    )
    if invoice.status in {"draft", "issued"}:
        await _sync_invoice_lines(db, invoice=invoice, folio=folio)
        await db.commit()
        invoice = await _load_invoice_detail(db, invoice.id)

    document = None
    if invoice.document_id is not None:
        try:
            document = await get_document(db, document_id=invoice.document_id, hotel_access=hotel_access)
        except HTTPException:
            document = None

    return {
        "invoice": invoice,
        "document": document,
        "preview_data": _build_preview_data(invoice, reservation, folio),
    }


async def get_invoice_detail(
    db: AsyncSession,
    *,
    invoice_id: int,
    hotel_access: HotelAccessContext,
) -> dict[str, object]:
    preview_payload = await get_invoice_preview(db, invoice_id=invoice_id, hotel_access=hotel_access)
    invoice: HotelInvoice = preview_payload["invoice"]
    folio = await get_folio(db, folio_id=invoice.folio_id, hotel_access=hotel_access)
    reservation = await _get_reservation_scoped(db, reservation_id=invoice.reservation_id, hotel_access=hotel_access)
    audit_timeline = await _build_invoice_audit_timeline(db, invoice=invoice, folio=folio)

    return {
        "invoice": invoice,
        "folio": folio,
        "reservation": _build_reservation_summary(reservation, invoice, folio),
        "document": preview_payload["document"],
        "preview_data": preview_payload["preview_data"],
        "status_label": _derive_invoice_display_status(invoice, reservation=reservation, folio=folio),
        "payment_status": _derive_payment_status(folio, invoice),
        "paid_amount": _invoice_paid_amount(folio, invoice),
        "balance_due": _invoice_balance_due(folio, invoice),
        "payment_method": _display_payment_method(folio, reservation),
        "allowed_actions": _build_allowed_actions(invoice, reservation=reservation, folio=folio),
        "audit_timeline": audit_timeline,
    }


async def send_invoice(
    db: AsyncSession,
    *,
    invoice_id: int,
    payload: HotelInvoiceSendRequest,
    hotel_access: HotelAccessContext,
) -> HotelInvoice:
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    reservation = await _get_reservation_scoped(
        db,
        reservation_id=invoice.reservation_id,
        hotel_access=hotel_access,
    )
    document_id = await _ensure_invoice_document(
        db,
        invoice=invoice,
        reservation=reservation,
        hotel_access=hotel_access,
    )
    document = await get_document(db, document_id=document_id, hotel_access=hotel_access)

    normalized_channel = (payload.channel or "email").strip().lower()
    if normalized_channel not in {"email", "pdf"}:
        raise HTTPException(status_code=400, detail="Unsupported invoice delivery channel")

    delivery = HotelInvoiceDelivery(
        invoice_id=invoice.id,
        document_id=document.id,
        channel=normalized_channel,
        status="sent",
        recipient_email=payload.recipient_email or reservation.guest_email,
        subject=payload.subject or document.subject or f"Invoice {invoice.invoice_number}",
        message=payload.message or document.body_text,
        sent_at=datetime.now(timezone.utc),
        metadata_json={
            "document_number": document.document_number,
            "invoice_number": invoice.invoice_number,
        },
    )

    if normalized_channel == "email":
        if not delivery.recipient_email:
            raise HTTPException(status_code=400, detail="Invoice email delivery requires a recipient email")
        await notifications.send_email(
            delivery.recipient_email,
            delivery.subject or f"Invoice {invoice.invoice_number}",
            delivery.message or document.body_text,
        )
        invoice.status = "sent"
        invoice.sent_at = delivery.sent_at
        invoice.recipient_email = delivery.recipient_email
    elif (invoice.status or "draft").strip().lower() not in LOCKED_INVOICE_STATUSES:
        invoice.status = "finalized"

    db.add(delivery)
    await log_human_action(
        db,
        action="hotel_invoice_sent" if normalized_channel == "email" else "hotel_invoice_pdf_recorded",
        detail=f"Recorded {normalized_channel} delivery for invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
        metadata_json={"document_id": document.id, "channel": normalized_channel},
    )
    await db.commit()
    return await _load_invoice_detail(db, invoice.id)


async def finalize_invoice(
    db: AsyncSession,
    *,
    invoice_id: int,
    hotel_access: HotelAccessContext,
) -> dict[str, object]:
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    if not _can_finalize_invoice(invoice):
        raise HTTPException(status_code=409, detail="Invoice is already finalized or locked")
    reservation = await _get_reservation_scoped(db, reservation_id=invoice.reservation_id, hotel_access=hotel_access)
    await _ensure_invoice_document(db, invoice=invoice, reservation=reservation, hotel_access=hotel_access)
    invoice.status = "finalized"
    await log_human_action(
        db,
        action="hotel_invoice_finalized",
        detail=f"Finalized invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
    )
    await db.commit()
    return await get_invoice_detail(db, invoice_id=invoice.id, hotel_access=hotel_access)


async def add_invoice_line_item(
    db: AsyncSession,
    *,
    invoice_id: int,
    payload: HotelFolioLineCreate,
    hotel_access: HotelAccessContext,
) -> dict[str, object]:
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    _require_invoice_editable(invoice)
    folio = await add_folio_line(
        db,
        folio_id=invoice.folio_id,
        payload=payload,
        hotel_access=hotel_access,
    )
    invoice = await _load_invoice_detail(db, invoice.id)
    await _sync_invoice_lines(db, invoice=invoice, folio=folio)
    await log_human_action(
        db,
        action="hotel_invoice_line_item_added",
        detail=f"Added line item to invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
        metadata_json={"folio_id": folio.id, "description": payload.description},
    )
    await db.commit()
    return await get_invoice_detail(db, invoice_id=invoice.id, hotel_access=hotel_access)


async def void_invoice_line_item(
    db: AsyncSession,
    *,
    invoice_id: int,
    line_id: int,
    hotel_access: HotelAccessContext,
) -> dict[str, object]:
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    _require_invoice_editable(invoice)
    target_line = next(
        (
            line for line in invoice.lines
            if line.id == line_id or (line.folio_line_id is not None and line.folio_line_id == line_id)
        ),
        None,
    )
    if target_line is None or target_line.folio_line_id is None:
        raise HTTPException(status_code=404, detail="Invoice line item not found")

    folio = await void_folio_line(
        db,
        folio_id=invoice.folio_id,
        line_id=target_line.folio_line_id,
        hotel_access=hotel_access,
    )
    invoice = await _load_invoice_detail(db, invoice.id)
    await _sync_invoice_lines(db, invoice=invoice, folio=folio)
    await log_human_action(
        db,
        action="hotel_invoice_line_item_voided",
        detail=f"Voided line item on invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
        metadata_json={"folio_id": folio.id, "invoice_line_id": target_line.id},
    )
    await db.commit()
    return await get_invoice_detail(db, invoice_id=invoice.id, hotel_access=hotel_access)


async def post_invoice_payment(
    db: AsyncSession,
    *,
    invoice_id: int,
    payload: HotelFolioPaymentCreate,
    hotel_access: HotelAccessContext,
) -> dict[str, object]:
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    folio = await post_folio_payment(
        db,
        folio_id=invoice.folio_id,
        payload=payload,
        hotel_access=hotel_access,
    )
    if float(folio.balance_due) <= 0 and (invoice.status or "").strip().lower() not in DISPLAY_CANCELLED_STATUSES:
        invoice.status = "paid"
    await log_human_action(
        db,
        action="hotel_invoice_payment_posted",
        detail=f"Posted payment to invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
        metadata_json={"amount": payload.amount, "method": payload.method},
    )
    await db.commit()
    return await get_invoice_detail(db, invoice_id=invoice.id, hotel_access=hotel_access)


async def generate_invoice_document_action(
    db: AsyncSession,
    *,
    invoice_id: int,
    document_kind: str,
    hotel_access: HotelAccessContext,
):
    invoice = await _get_invoice_scoped(db, invoice_id=invoice_id, hotel_access=hotel_access)
    reservation = await _get_reservation_scoped(db, reservation_id=invoice.reservation_id, hotel_access=hotel_access)
    folio = await get_folio(db, folio_id=invoice.folio_id, hotel_access=hotel_access)
    normalized_kind = (document_kind or "").strip().lower()
    if normalized_kind not in {"invoice", "receipt", "debit_note", "storno"}:
        raise HTTPException(status_code=400, detail="Unsupported invoice document action")

    if normalized_kind == "receipt" and _invoice_paid_amount(folio, invoice) <= 0:
        raise HTTPException(status_code=400, detail="A receipt requires at least one completed payment")
    if normalized_kind == "debit_note" and _invoice_balance_due(folio, invoice) <= 0:
        raise HTTPException(status_code=400, detail="A debit note requires an outstanding balance")

    document = await generate_document(
        db,
        payload=HotelDocumentGenerateRequest(
            reservation_id=reservation.id,
            document_kind=normalized_kind,
        ),
        hotel_access=hotel_access,
        property_id=reservation.property_id,
    )
    document.metadata_json = {
        **(document.metadata_json or {}),
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "folio_id": invoice.folio_id,
    }
    if normalized_kind == "invoice":
        invoice.document_id = document.id
        invoice.issued_at = invoice.issued_at or datetime.now(timezone.utc)
    if normalized_kind == "storno":
        invoice.status = "storno"

    await log_human_action(
        db,
        action=f"hotel_invoice_{normalized_kind}_generated",
        detail=f"Generated {normalized_kind.replace('_', ' ')} for invoice #{invoice.invoice_number}",
        entity_type="hotel_invoice",
        entity_id=invoice.id,
        source_module="hms",
        actor_user_id=getattr(hotel_access.user, "id", None),
        actor_name=getattr(hotel_access.user, "full_name", None) or getattr(hotel_access.user, "email", None) or "Authenticated User",
        metadata_json={"document_id": document.id, "document_kind": normalized_kind},
    )
    await db.commit()
    await db.refresh(document)
    return document
