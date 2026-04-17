from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.service import schedule_ai_snapshot_invalidation
from app.dependencies import HotelAccessContext
from app.hms.models import (
    HotelFolio,
    HotelFolioLine,
    HotelInvoice,
    HotelFolioPayment,
    HotelReservation,
    HotelStay,
    Room,
)
from app.hms.schemas import (
    HotelFolioLineCreate,
    HotelFolioPaymentCreate,
)
from app.shared.audit import log_human_action


async def _get_room_for_reservation(db: AsyncSession, reservation: HotelReservation) -> Room | None:
    if not reservation.room:
        return None
    result = await db.execute(
        select(Room).where(
            Room.property_id == reservation.property_id,
            Room.room_number == reservation.room,
        )
    )
    return result.scalar_one_or_none()


def _reservation_to_stay_status(reservation_status: str | None) -> str:
    normalized = (reservation_status or "confirmed").replace("-", "_").lower()
    if normalized == "checked_in":
        return "checked_in"
    if normalized == "checked_out":
        return "checked_out"
    if normalized == "cancelled":
        return "cancelled"
    return "booked"


async def _ensure_stay_for_reservation(
    db: AsyncSession,
    reservation: HotelReservation,
) -> HotelStay:
    result = await db.execute(
        select(HotelStay).where(HotelStay.reservation_id == reservation.id)
    )
    stay = result.scalar_one_or_none()
    room = await _get_room_for_reservation(db, reservation)
    stay_status = _reservation_to_stay_status(reservation.status)

    if stay is None:
        stay = HotelStay(
            property_id=reservation.property_id,
            reservation_id=reservation.id,
            room_id=room.id if room is not None else None,
            status=stay_status,
            planned_check_in=reservation.check_in,
            planned_check_out=reservation.check_out,
        )
        if stay_status == "checked_in":
            stay.actual_check_in_at = datetime.now(timezone.utc)
        if stay_status == "checked_out":
            now = datetime.now(timezone.utc)
            stay.actual_check_in_at = now
            stay.actual_check_out_at = now
        db.add(stay)
        await db.flush()
        return stay

    stay.property_id = reservation.property_id
    stay.room_id = room.id if room is not None else None
    stay.status = stay_status
    stay.planned_check_in = reservation.check_in
    stay.planned_check_out = reservation.check_out
    if stay_status == "checked_in" and stay.actual_check_in_at is None:
        stay.actual_check_in_at = datetime.now(timezone.utc)
    if stay_status == "checked_out" and stay.actual_check_out_at is None:
        now = datetime.now(timezone.utc)
        if stay.actual_check_in_at is None:
            stay.actual_check_in_at = now
        stay.actual_check_out_at = now
    await db.flush()
    return stay


async def _next_folio_number(
    db: AsyncSession,
    property_id: int,
    *,
    year: int | None = None,
) -> str:
    folio_year = year or datetime.now(timezone.utc).year
    prefix = f"FOL-{folio_year}-"
    suffix_start = len(prefix) + 1
    result = await db.execute(
        select(
            func.max(
                cast(func.substr(HotelFolio.folio_number, suffix_start), Integer)
            )
        ).where(
            HotelFolio.property_id == property_id,
            HotelFolio.folio_number.like(f"{prefix}%"),
        )
    )
    next_sequence = (result.scalar() or 0) + 1
    return f"{prefix}{next_sequence:04d}"


async def _recalculate_folio_totals(
    db: AsyncSession,
    folio: HotelFolio,
) -> HotelFolio:
    lines_result = await db.execute(
        select(HotelFolioLine).where(
            HotelFolioLine.folio_id == folio.id,
            HotelFolioLine.status != "void",
        )
    )
    lines = list(lines_result.scalars().all())
    subtotal = round(sum(float(line.total_price) for line in lines), 2)

    payments_result = await db.execute(
        select(HotelFolioPayment).where(
            HotelFolioPayment.folio_id == folio.id,
            HotelFolioPayment.status == "completed",
        )
    )
    payments = list(payments_result.scalars().all())
    total_paid = round(sum(float(payment.amount) for payment in payments), 2)

    folio.subtotal = subtotal
    folio.tax_amount = 0
    folio.total = round(subtotal - float(folio.discount_amount), 2)
    folio.balance_due = round(max(float(folio.total) - total_paid, 0), 2)

    if float(folio.total) > 0 and folio.balance_due <= 0:
        folio.status = "paid"
        folio.paid_at = folio.paid_at or datetime.now(timezone.utc)
    elif total_paid > 0:
        folio.status = "partially_paid"
        folio.paid_at = None
    else:
        folio.status = "open"
        folio.paid_at = None

    await db.flush()
    return folio


async def _sync_reservation_payment_status(
    db: AsyncSession,
    reservation: HotelReservation,
    folio: HotelFolio,
) -> None:
    if folio.status == "paid":
        reservation.payment_status = "paid"
        reservation.zahlungs_status = "bezahlt"
    elif folio.status == "partially_paid":
        reservation.payment_status = "partially_paid"
        reservation.zahlungs_status = "teilweise_bezahlt"
    else:
        reservation.payment_status = "pending"
        reservation.zahlungs_status = "offen"
    await db.flush()


async def _get_reservation_for_folio(
    db: AsyncSession,
    reservation_id: int,
    hotel_access: HotelAccessContext,
) -> HotelReservation:
    reservation = await db.get(HotelReservation, reservation_id)
    if reservation is None:
        raise HTTPException(status_code=404, detail="Hotel reservation not found")
    if reservation.property_id not in hotel_access.property_ids:
        raise HTTPException(
            status_code=403,
            detail="User does not have access to this reservation's hotel property",
        )
    return reservation


def _folio_detail_query() -> list:
    return [
        selectinload(HotelFolio.stay),
        selectinload(HotelFolio.lines),
        selectinload(HotelFolio.payments),
    ]


async def _assert_folio_lines_editable(db: AsyncSession, folio: HotelFolio) -> None:
    result = await db.execute(
        select(HotelInvoice).where(HotelInvoice.folio_id == folio.id)
    )
    invoices = list(result.scalars().all())
    locked_statuses = {"finalized", "sent", "storno", "cancelled", "paid"}
    if any((invoice.status or "draft").strip().lower() in locked_statuses for invoice in invoices):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This bill is locked. Use storno or reversal flow instead of editing posted line items.",
        )


async def _load_folio_detail(db: AsyncSession, folio_id: int) -> HotelFolio:
    result = await db.execute(
        select(HotelFolio)
        .execution_options(populate_existing=True)
        .options(*_folio_detail_query())
        .where(HotelFolio.id == folio_id)
    )
    folio = result.scalar_one_or_none()
    if folio is None:
        raise HTTPException(status_code=404, detail="Hotel folio not found")
    return folio


async def _get_folio_scoped(
    db: AsyncSession,
    folio_id: int,
    hotel_access: HotelAccessContext,
) -> HotelFolio:
    result = await db.execute(
        select(HotelFolio)
        .execution_options(populate_existing=True)
        .options(*_folio_detail_query())
        .where(HotelFolio.id == folio_id)
    )
    folio = result.scalar_one_or_none()
    if folio is None:
        raise HTTPException(status_code=404, detail="Hotel folio not found")
    if folio.property_id not in hotel_access.property_ids:
        raise HTTPException(
            status_code=403,
            detail="User does not have access to this hotel's folio",
        )
    return folio


async def ensure_folio_for_reservation(
    db: AsyncSession,
    reservation_id: int,
    hotel_access: HotelAccessContext,
) -> HotelFolio:
    reservation = await _get_reservation_for_folio(db, reservation_id, hotel_access)
    return await ensure_folio_for_reservation_record(db, reservation)


async def ensure_folio_for_reservation_record(
    db: AsyncSession,
    reservation: HotelReservation,
) -> HotelFolio:
    stay = await _ensure_stay_for_reservation(db, reservation)

    existing_result = await db.execute(
        select(HotelFolio)
        .execution_options(populate_existing=True)
        .options(*_folio_detail_query())
        .where(HotelFolio.reservation_id == reservation.id)
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        await _recalculate_folio_totals(db, existing)
        await _sync_reservation_payment_status(db, reservation, existing)
        return await _load_folio_detail(db, existing.id)

    nights = max((reservation.check_out - reservation.check_in).days, 1)
    total_amount = round(float(reservation.total_amount or 0), 2)
    nightly_rate = round(total_amount / nights, 2) if total_amount > 0 else 0

    folio = HotelFolio(
        property_id=reservation.property_id,
        stay_id=stay.id,
        reservation_id=reservation.id,
        folio_number=await _next_folio_number(db, reservation.property_id),
        currency=reservation.currency or "EUR",
        status="open",
    )
    db.add(folio)
    await db.flush()

    room_label = reservation.room_type_label or "Zimmer"
    room_line = HotelFolioLine(
        folio_id=folio.id,
        charge_type="room",
        description=f"Room charge · {room_label}",
        quantity=float(nights),
        unit_price=nightly_rate if nightly_rate > 0 else total_amount,
        total_price=total_amount,
        service_date=reservation.check_in,
        metadata_json={
            "reservation_id": reservation.id,
            "booking_id": reservation.booking_id,
            "room": reservation.room,
            "nights": nights,
        },
    )
    db.add(room_line)
    await db.flush()

    await _recalculate_folio_totals(db, folio)
    await _sync_reservation_payment_status(db, reservation, folio)
    schedule_ai_snapshot_invalidation(
        db,
        property_id=folio.property_id,
        reason="folio_created",
    )
    await log_human_action(
        db,
        action="hotel_folio_created",
        detail=f"Created hotel folio #{folio.folio_number} for reservation #{reservation.id}",
        entity_type="hotel_folio",
        entity_id=folio.id,
        source_module="hms",
        restaurant_id=None,
    )
    return await _load_folio_detail(db, folio.id)


async def sync_folio_for_reservation_record(
    db: AsyncSession,
    reservation: HotelReservation,
) -> None:
    stay = await _ensure_stay_for_reservation(db, reservation)
    result = await db.execute(
        select(HotelFolio).where(HotelFolio.reservation_id == reservation.id)
    )
    folio = result.scalar_one_or_none()
    if folio is None:
        return
    folio.property_id = reservation.property_id
    folio.stay_id = stay.id
    folio.currency = reservation.currency or folio.currency

    lines_result = await db.execute(
        select(HotelFolioLine).where(
            HotelFolioLine.folio_id == folio.id,
            HotelFolioLine.charge_type == "room",
        )
    )
    room_line = lines_result.scalars().first()
    if room_line is not None:
        nights = max((reservation.check_out - reservation.check_in).days, 1)
        total_amount = round(float(reservation.total_amount or 0), 2)
        room_line.description = f"Room charge · {reservation.room_type_label or 'Zimmer'}"
        room_line.quantity = float(nights)
        room_line.unit_price = round(total_amount / nights, 2) if total_amount > 0 else total_amount
        room_line.total_price = total_amount
        room_line.service_date = reservation.check_in
        room_line.metadata_json = {
            "reservation_id": reservation.id,
            "booking_id": reservation.booking_id,
            "room": reservation.room,
            "nights": nights,
        }

    await _recalculate_folio_totals(db, folio)
    await _sync_reservation_payment_status(db, reservation, folio)
    schedule_ai_snapshot_invalidation(
        db,
        property_id=folio.property_id,
        reason="folio_synced",
    )


async def list_folios(
    db: AsyncSession,
    hotel_access: HotelAccessContext,
    *,
    property_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
) -> list[HotelFolio]:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
        raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")

    query = select(HotelFolio).execution_options(populate_existing=True).options(*_folio_detail_query())
    if resolved_property_id is not None:
        query = query.where(HotelFolio.property_id == resolved_property_id)
    else:
        query = query.where(HotelFolio.property_id.in_(hotel_access.property_ids))
    if status:
        query = query.where(HotelFolio.status == status.replace("-", "_"))
    result = await db.execute(
        query.order_by(HotelFolio.created_at.desc(), HotelFolio.id.desc()).limit(limit)
    )
    return list(result.scalars().all())


async def get_folio(
    db: AsyncSession,
    folio_id: int,
    hotel_access: HotelAccessContext,
) -> HotelFolio:
    return await _get_folio_scoped(db, folio_id, hotel_access)


async def add_folio_line(
    db: AsyncSession,
    folio_id: int,
    payload: HotelFolioLineCreate,
    hotel_access: HotelAccessContext,
) -> HotelFolio:
    folio = await _get_folio_scoped(db, folio_id, hotel_access)
    await _assert_folio_lines_editable(db, folio)
    line = HotelFolioLine(
        folio_id=folio.id,
        charge_type=payload.charge_type,
        description=payload.description,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        total_price=round(payload.quantity * payload.unit_price, 2),
        service_date=payload.service_date,
        metadata_json=payload.metadata_json,
    )
    db.add(line)
    await db.flush()
    folio = await _recalculate_folio_totals(db, folio)
    reservation = await db.get(HotelReservation, folio.reservation_id)
    if reservation is not None:
        await _sync_reservation_payment_status(db, reservation, folio)
    schedule_ai_snapshot_invalidation(
        db,
        property_id=folio.property_id,
        reason="folio_line_added",
    )
    actor_restaurant_id = getattr(hotel_access.user, "restaurant_id", None) or None
    await log_human_action(
        db,
        action="hotel_folio_line_added",
        detail=f"Added {payload.charge_type} line to hotel folio #{folio.folio_number}",
        entity_type="hotel_folio",
        entity_id=folio.id,
        source_module="hms",
        restaurant_id=actor_restaurant_id,
    )
    return await _load_folio_detail(db, folio.id)


async def void_folio_line(
    db: AsyncSession,
    folio_id: int,
    line_id: int,
    hotel_access: HotelAccessContext,
) -> HotelFolio:
    folio = await _get_folio_scoped(db, folio_id, hotel_access)
    await _assert_folio_lines_editable(db, folio)
    line_result = await db.execute(
        select(HotelFolioLine).where(
            HotelFolioLine.id == line_id,
            HotelFolioLine.folio_id == folio.id,
        )
    )
    line = line_result.scalar_one_or_none()
    if line is None:
        raise HTTPException(status_code=404, detail="Hotel folio line not found")
    if (line.charge_type or "").lower() == "room":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Room charges cannot be removed from the folio",
        )
    if (line.status or "posted").lower() == "void":
        return await _load_folio_detail(db, folio.id)

    line.status = "void"
    await db.flush()

    folio = await _recalculate_folio_totals(db, folio)
    reservation = await db.get(HotelReservation, folio.reservation_id)
    if reservation is not None:
        await _sync_reservation_payment_status(db, reservation, folio)
    schedule_ai_snapshot_invalidation(
        db,
        property_id=folio.property_id,
        reason="folio_line_voided",
    )

    actor_restaurant_id = getattr(hotel_access.user, "restaurant_id", None) or None
    await log_human_action(
        db,
        action="hotel_folio_line_voided",
        detail=f"Voided folio line #{line.id} on hotel folio #{folio.folio_number}",
        entity_type="hotel_folio",
        entity_id=folio.id,
        source_module="hms",
        restaurant_id=actor_restaurant_id,
    )
    return await _load_folio_detail(db, folio.id)


async def post_folio_payment(
    db: AsyncSession,
    folio_id: int,
    payload: HotelFolioPaymentCreate,
    hotel_access: HotelAccessContext,
) -> HotelFolio:
    folio = await _get_folio_scoped(db, folio_id, hotel_access)
    payment = HotelFolioPayment(
        folio_id=folio.id,
        amount=payload.amount,
        method=payload.method,
        reference=payload.reference,
        status="completed",
        paid_at=datetime.now(timezone.utc),
        processing_fee=payload.processing_fee,
        gateway_reference=payload.gateway_reference,
        card_last_four=payload.card_last_four,
        card_brand=payload.card_brand,
        wallet_type=payload.wallet_type,
    )
    db.add(payment)
    await db.flush()

    folio = await _recalculate_folio_totals(db, folio)
    reservation = await db.get(HotelReservation, folio.reservation_id)
    if reservation is not None:
        reservation.zahlungs_methode = payload.method
        await _sync_reservation_payment_status(db, reservation, folio)
    schedule_ai_snapshot_invalidation(
        db,
        property_id=folio.property_id,
        reason="folio_payment_posted",
    )

    actor_restaurant_id = getattr(hotel_access.user, "restaurant_id", None) or None
    await log_human_action(
        db,
        action="hotel_folio_payment_posted",
        detail=f"Posted {payload.method} payment to hotel folio #{folio.folio_number}",
        entity_type="hotel_folio",
        entity_id=folio.id,
        source_module="hms",
        restaurant_id=actor_restaurant_id,
    )
    return await _load_folio_detail(db, folio.id)
