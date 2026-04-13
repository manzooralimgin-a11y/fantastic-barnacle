from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import date, timedelta
from xml.etree.ElementTree import Element, SubElement, tostring

from fastapi import HTTPException
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.guests.models import GuestProfile
from app.hms.housekeeping_service import list_housekeeping_rooms, list_housekeeping_tasks
from app.hms.invoice_service import LOCKED_INVOICE_STATUSES, search_cash_master_invoices
from app.hms.models import (
    HotelDocument,
    HotelFolio,
    HotelFolioLine,
    HotelFolioPayment,
    HotelInvoice,
    HotelInvoiceLine,
    HotelReservation,
    HotelStay,
    Room,
    RoomDailyNote,
    StayOccupant,
    RoomType,
)
from app.hms.pms.schemas.reports import PmsReportType
from app.hms.pms.services.reservations_service import get_cockpit_read_model
from app.hms.reporting_service import get_reporting_daily, get_reporting_summary


@dataclass(slots=True)
class ReportDownloadPayload:
    filename: str
    media_type: str
    content: bytes


def _normalize_range(
    *,
    start_date: date | None,
    end_date: date | None,
) -> tuple[date, date]:
    if start_date is None and end_date is None:
        end_date = date.today()
        start_date = end_date - timedelta(days=29)
    elif start_date is None:
        start_date = end_date - timedelta(days=29)
    elif end_date is None:
        end_date = start_date + timedelta(days=29)

    if end_date < start_date:
        raise HTTPException(status_code=400, detail="Report end date must be on or after the start date")
    if (end_date - start_date).days > 366:
        raise HTTPException(status_code=400, detail="Report date range cannot exceed 367 days")
    return start_date, end_date


def _days_in_range(start_date: date, end_date: date) -> int:
    return (end_date - start_date).days + 1


def _format_cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.2f}"
    if isinstance(value, bool):
        return "Ja" if value else "Nein"
    return str(value)


def _coerce_record(value) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    return {}


def _custom_field_lookup(record: dict[str, object], *keys: str) -> object | None:
    for key in keys:
        if key in record and record[key] not in (None, ""):
            return record[key]
    return None


def _split_name(full_name: str | None) -> tuple[str, str]:
    parts = [part for part in (full_name or "").strip().split(" ") if part]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return " ".join(parts[:-1]), parts[-1]


def _business_travel_tax_exempt(guest: GuestProfile | None) -> str:
    custom_fields = _coerce_record(getattr(guest, "custom_fields_json", None))
    value = _custom_field_lookup(
        custom_fields,
        "business_travel_tax_exempt",
        "business_travel_exempt",
        "city_tax_exempt",
        "bettensteuer_befreit",
    )
    if isinstance(value, bool):
        return "Ja" if value else "Nein"
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"yes", "ja", "true", "1", "business", "geschäftlich"}:
            return "Ja"
        if normalized in {"no", "nein", "false", "0"}:
            return "Nein"
        return value
    return ""


def _guest_identity_number(guest: GuestProfile | None) -> str:
    custom_fields = _coerce_record(getattr(guest, "custom_fields_json", None))
    value = _custom_field_lookup(
        custom_fields,
        "passport_number",
        "passport_id",
        "id_number",
        "identity_document_number",
        "document_number",
    )
    return str(value) if value is not None else ""


def _guest_home_address(guest: GuestProfile | None) -> str:
    custom_fields = _coerce_record(getattr(guest, "custom_fields_json", None))
    direct_value = _custom_field_lookup(
        custom_fields,
        "home_address",
        "address",
        "street_address",
    )
    if isinstance(direct_value, str):
        return direct_value

    address_record = _coerce_record(_custom_field_lookup(custom_fields, "address_json", "address_fields"))
    street = _custom_field_lookup(address_record, "street", "line1")
    line2 = _custom_field_lookup(address_record, "line2")
    postal_code = _custom_field_lookup(address_record, "postal_code", "zip", "zip_code")
    city = _custom_field_lookup(address_record, "city")
    country = _custom_field_lookup(address_record, "country", "country_name")
    return ", ".join(
        str(part)
        for part in [street, line2, " ".join(str(part) for part in [postal_code, city] if part), country]
        if part
    )


def _closed_invoice_statuses() -> tuple[str, ...]:
    return tuple(sorted(status for status in LOCKED_INVOICE_STATUSES if status not in {"storno", "cancelled"}))


def _is_city_tax_line(charge_type: str | None, description: str | None, metadata_json: dict | None) -> bool:
    normalized_type = (charge_type or "").strip().lower()
    normalized_description = (description or "").strip().lower()
    metadata = _coerce_record(metadata_json)
    service_key = str(metadata.get("service_key") or metadata.get("extra_key") or "").strip().lower()
    extra_name = str(metadata.get("extra_name") or "").strip().lower()
    return (
        normalized_type in {"city_tax", "citytax", "bettensteuer", "tourism_tax", "tourist_tax"}
        or "city tax" in normalized_description
        or "tourism tax" in normalized_description
        or "bettensteuer" in normalized_description
        or service_key in {"city_tax", "tourism_tax", "bettensteuer"}
        or "city tax" in extra_name
        or "bettensteuer" in extra_name
    )


def _build_csv_payload(
    *,
    report_type: PmsReportType,
    start_date: date,
    end_date: date,
    columns: list[tuple[str, str]],
    rows: list[dict[str, object]],
) -> ReportDownloadPayload:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([label for label, _ in columns])
    for row in rows:
        writer.writerow([_format_cell(row.get(key)) for _, key in columns])

    filename = f"{report_type.value}_{start_date.isoformat()}_{end_date.isoformat()}.csv"
    return ReportDownloadPayload(
        filename=filename,
        media_type="text/csv; charset=utf-8",
        content=buffer.getvalue().encode("utf-8"),
    )


def _build_xml_payload(
    *,
    report_type: PmsReportType,
    start_date: date,
    end_date: date,
    xml_root: Element,
) -> ReportDownloadPayload:
    filename = f"{report_type.value}_{start_date.isoformat()}_{end_date.isoformat()}.xml"
    return ReportDownloadPayload(
        filename=filename,
        media_type="application/xml; charset=utf-8",
        content=tostring(xml_root, encoding="utf-8", xml_declaration=True),
    )


async def _cash_master_rows(
    db: AsyncSession,
    *,
    property_id: int,
    hotel_access,
    start_date: date,
    end_date: date,
    invoice_status: str | None = None,
    payment_status: str | None = None,
) -> list[dict[str, object]]:
    payload = await search_cash_master_invoices(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        date_from=start_date,
        date_to=end_date,
        invoice_status=invoice_status,
        payment_status=payment_status,
        page=1,
        page_size=5000,
        sort_by="invoice_date",
        sort_dir="desc",
    )
    return list(payload["items"])


async def _payments_rows(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
    deposit_only: bool = False,
) -> list[dict[str, object]]:
    paid_date = func.date(func.coalesce(HotelFolioPayment.paid_at, HotelFolioPayment.created_at))
    query = (
        select(
            HotelFolioPayment.amount,
            HotelFolioPayment.method,
            HotelFolioPayment.reference,
            HotelFolioPayment.status,
            HotelFolioPayment.paid_at,
            HotelReservation.id.label("reservation_id"),
            HotelReservation.booking_id,
            HotelReservation.guest_name,
            HotelReservation.room,
            HotelReservation.check_in,
            HotelFolio.folio_number,
        )
        .select_from(HotelFolioPayment)
        .join(HotelFolio, HotelFolio.id == HotelFolioPayment.folio_id)
        .join(HotelReservation, HotelReservation.id == HotelFolio.reservation_id)
        .where(
            HotelFolio.property_id == property_id,
            paid_date >= start_date,
            paid_date <= end_date,
        )
        .order_by(HotelFolioPayment.paid_at.desc(), HotelFolioPayment.id.desc())
    )
    rows = []
    for payment in (await db.execute(query)).all():
        if deposit_only and payment.check_in and payment.paid_at and payment.paid_at.date() >= payment.check_in:
            continue
        rows.append(
            {
                "payment_date": payment.paid_at.date().isoformat() if payment.paid_at else "",
                "folio_number": payment.folio_number,
                "reservation_id": payment.reservation_id,
                "booking_id": payment.booking_id,
                "guest_name": payment.guest_name,
                "room_number": payment.room,
                "check_in": payment.check_in,
                "payment_method": payment.method,
                "reference": payment.reference,
                "status": payment.status,
                "amount": float(payment.amount or 0),
            }
        )
    return rows


async def _housekeeping_note_map(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> dict[int, RoomDailyNote]:
    result = await db.execute(
        select(RoomDailyNote)
        .where(
            RoomDailyNote.property_id == property_id,
            RoomDailyNote.note_date >= start_date,
            RoomDailyNote.note_date <= end_date,
        )
        .order_by(RoomDailyNote.room_id.asc(), RoomDailyNote.note_date.desc(), RoomDailyNote.id.desc())
    )
    latest: dict[int, RoomDailyNote] = {}
    for row in result.scalars().all():
        latest.setdefault(row.room_id, row)
    return latest


async def _build_cockpitliste_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
) -> ReportDownloadPayload:
    cockpit = await get_cockpit_read_model(db, property_id=property_id, focus_date=start_date)
    rows: list[dict[str, object]] = []
    for bucket, items in (
        ("Arrivals", cockpit.arrivals),
        ("In House", cockpit.in_house),
        ("Departures", cockpit.departures),
        ("Reservations", cockpit.reservations),
        ("Live Log", cockpit.live_log),
    ):
        for item in items:
            rows.append(
                {
                    "bucket": bucket,
                    "reservation_id": item.reservation_id,
                    "booking_id": item.booking_id,
                    "guest_name": item.guest_name,
                    "status": item.status,
                    "room": item.room,
                    "room_type": item.room_type_label,
                    "check_in": item.check_in,
                    "check_out": item.check_out,
                    "adults": item.adults,
                    "children": item.children,
                    "payment_status": item.payment_status,
                    "folio_status": item.folio_status,
                }
            )
    return _build_csv_payload(
        report_type=PmsReportType.COCKPITLISTE,
        start_date=start_date,
        end_date=start_date,
        columns=[
            ("Bereich", "bucket"),
            ("Reservierung", "reservation_id"),
            ("Buchungsnr.", "booking_id"),
            ("Gast", "guest_name"),
            ("Status", "status"),
            ("Zimmer", "room"),
            ("Zimmerkategorie", "room_type"),
            ("Anreise", "check_in"),
            ("Abreise", "check_out"),
            ("Erwachsene", "adults"),
            ("Kinder", "children"),
            ("Zahlungsstatus", "payment_status"),
            ("Folio-Status", "folio_status"),
        ],
        rows=rows,
    )


async def _build_housekeepingliste_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    rooms = await list_housekeeping_rooms(db, property_id=property_id)
    tasks = await list_housekeeping_tasks(db, property_id=property_id, status=None)
    latest_notes = await _housekeeping_note_map(db, property_id=property_id, start_date=start_date, end_date=end_date)

    open_tasks_by_room: dict[int, list[dict]] = {}
    for task in tasks:
        open_tasks_by_room.setdefault(task["room_id"], []).append(task)

    rows = []
    for room in rooms:
        room_tasks = open_tasks_by_room.get(room["room_id"], [])
        latest_note = latest_notes.get(room["room_id"])
        rows.append(
            {
                "room_number": room["room_number"],
                "room_type": room["room_type_name"],
                "floor": room["floor"],
                "operational_status": room["operational_status"],
                "housekeeping_status": room["housekeeping_status"],
                "open_tasks": room["open_task_count"],
                "latest_task": room_tasks[0]["title"] if room_tasks else "",
                "latest_task_priority": room_tasks[0]["priority"] if room_tasks else "",
                "housekeeping_note": latest_note.housekeeping_note if latest_note else "",
                "maintenance_required": bool(latest_note.maintenance_required) if latest_note else False,
            }
        )

    return _build_csv_payload(
        report_type=PmsReportType.HOUSEKEEPINGLISTE,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Zimmer", "room_number"),
            ("Kategorie", "room_type"),
            ("Etage", "floor"),
            ("Betriebsstatus", "operational_status"),
            ("Housekeeping", "housekeeping_status"),
            ("Offene Aufgaben", "open_tasks"),
            ("Letzte Aufgabe", "latest_task"),
            ("Priorität", "latest_task_priority"),
            ("Housekeeping Notiz", "housekeeping_note"),
            ("Wartung nötig", "maintenance_required"),
        ],
        rows=rows,
    )


async def _build_haus_status_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    rooms = await list_housekeeping_rooms(db, property_id=property_id)
    rows = [
        {
            "room_number": room["room_number"],
            "room_type": room["room_type_name"],
            "floor": room["floor"],
            "operational_status": room["operational_status"],
            "housekeeping_status": room["housekeeping_status"],
            "open_tasks": room["open_task_count"],
            "last_change": room["last_status_changed_at"],
        }
        for room in rooms
    ]
    return _build_csv_payload(
        report_type=PmsReportType.HAUS_STATUS,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Zimmer", "room_number"),
            ("Kategorie", "room_type"),
            ("Etage", "floor"),
            ("Betriebsstatus", "operational_status"),
            ("Housekeeping", "housekeeping_status"),
            ("Offene Aufgaben", "open_tasks"),
            ("Letzte Änderung", "last_change"),
        ],
        rows=rows,
    )


async def _build_fb_verpflegungsbericht_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    service_date = func.coalesce(HotelFolioLine.service_date, HotelReservation.check_in)
    query = (
        select(
            HotelFolioLine.description,
            HotelFolioLine.charge_type,
            HotelFolioLine.quantity,
            HotelFolioLine.total_price,
            HotelReservation.guest_name,
            HotelReservation.room,
            service_date.label("service_date"),
        )
        .select_from(HotelFolioLine)
        .join(HotelFolio, HotelFolio.id == HotelFolioLine.folio_id)
        .join(HotelReservation, HotelReservation.id == HotelFolio.reservation_id)
        .where(
            HotelFolio.property_id == property_id,
            service_date >= start_date,
            service_date <= end_date,
            or_(
                func.lower(HotelFolioLine.charge_type).in_(["food", "beverage", "breakfast"]),
                func.lower(HotelFolioLine.description).like("%breakfast%"),
                func.lower(HotelFolioLine.description).like("%minibar%"),
                func.lower(HotelFolioLine.description).like("%restaurant%"),
                func.lower(HotelFolioLine.description).like("%bar%"),
            ),
        )
        .order_by(service_date.asc(), HotelFolioLine.id.asc())
    )
    rows = [
        {
            "service_date": item.service_date,
            "guest_name": item.guest_name,
            "room_number": item.room,
            "charge_type": item.charge_type,
            "description": item.description,
            "quantity": float(item.quantity or 0),
            "amount": float(item.total_price or 0),
        }
        for item in (await db.execute(query)).all()
    ]
    return _build_csv_payload(
        report_type=PmsReportType.FB_VERPFLEGUNGSBERICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Leistungsdatum", "service_date"),
            ("Gast", "guest_name"),
            ("Zimmer", "room_number"),
            ("Gruppe", "charge_type"),
            ("Leistung", "description"),
            ("Menge", "quantity"),
            ("Betrag", "amount"),
        ],
        rows=rows,
    )


async def _build_kassenbuch_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    rows = await _payments_rows(db, property_id=property_id, start_date=start_date, end_date=end_date)
    return _build_csv_payload(
        report_type=PmsReportType.KASSENBUCH,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Zahlungsdatum", "payment_date"),
            ("Folio", "folio_number"),
            ("Reservierung", "reservation_id"),
            ("Buchungsnr.", "booking_id"),
            ("Gast", "guest_name"),
            ("Zimmer", "room_number"),
            ("Methode", "payment_method"),
            ("Referenz", "reference"),
            ("Status", "status"),
            ("Betrag", "amount"),
        ],
        rows=rows,
    )


async def _build_anzahlungsliste_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    rows = await _payments_rows(
        db,
        property_id=property_id,
        start_date=start_date,
        end_date=end_date,
        deposit_only=True,
    )
    return _build_csv_payload(
        report_type=PmsReportType.ANZAHLUNGSLISTE,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Zahlungsdatum", "payment_date"),
            ("Anreise", "check_in"),
            ("Folio", "folio_number"),
            ("Reservierung", "reservation_id"),
            ("Buchungsnr.", "booking_id"),
            ("Gast", "guest_name"),
            ("Zimmer", "room_number"),
            ("Methode", "payment_method"),
            ("Referenz", "reference"),
            ("Betrag", "amount"),
        ],
        rows=rows,
    )


async def _build_einnahmebericht_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
    hotel_access,
) -> ReportDownloadPayload:
    rows = await _cash_master_rows(
        db,
        property_id=property_id,
        hotel_access=hotel_access,
        start_date=start_date,
        end_date=end_date,
    )
    export_rows = [
        {
            "invoice_number": row["invoice_number"],
            "invoice_date": row["invoice_date"],
            "guest_company": row["guest_or_company"],
            "reservation_id": row["reservation_id"],
            "booking_id": row["booking_id"],
            "room_number": row["room_number"],
            "status": row["status"],
            "payment_status": row["payment_status"],
            "payment_method": row["payment_method"],
            "total_amount": row["total_amount"],
            "paid_amount": row["paid_amount"],
            "balance_due": row["balance_due"],
        }
        for row in rows
    ]
    return _build_csv_payload(
        report_type=PmsReportType.EINNAHMEBERICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Rechnungsnr.", "invoice_number"),
            ("Rechnungsdatum", "invoice_date"),
            ("Gast / Firma", "guest_company"),
            ("Reservierung", "reservation_id"),
            ("Buchungsnr.", "booking_id"),
            ("Zimmer", "room_number"),
            ("Status", "status"),
            ("Zahlungsstatus", "payment_status"),
            ("Zahlart", "payment_method"),
            ("Rechnungsbetrag", "total_amount"),
            ("Bezahlt", "paid_amount"),
            ("Offen", "balance_due"),
        ],
        rows=export_rows,
    )


async def _build_finanzkonten_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    paid_date = func.date(func.coalesce(HotelFolioPayment.paid_at, HotelFolioPayment.created_at))
    query = (
        select(
            func.lower(HotelFolioPayment.method).label("payment_method"),
            func.count(HotelFolioPayment.id).label("payment_count"),
            func.coalesce(func.sum(HotelFolioPayment.amount), 0).label("amount_total"),
            func.coalesce(func.sum(HotelFolioPayment.processing_fee), 0).label("fees_total"),
        )
        .select_from(HotelFolioPayment)
        .join(HotelFolio, HotelFolio.id == HotelFolioPayment.folio_id)
        .where(
            HotelFolio.property_id == property_id,
            paid_date >= start_date,
            paid_date <= end_date,
        )
        .group_by(func.lower(HotelFolioPayment.method))
        .order_by(func.lower(HotelFolioPayment.method).asc())
    )
    rows = [
        {
            "payment_method": item.payment_method or "unknown",
            "payment_count": item.payment_count,
            "amount_total": float(item.amount_total or 0),
            "fees_total": float(item.fees_total or 0),
        }
        for item in (await db.execute(query)).all()
    ]
    return _build_csv_payload(
        report_type=PmsReportType.FINANZKONTEN_UEBERSICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Zahlart", "payment_method"),
            ("Buchungen", "payment_count"),
            ("Umsatz", "amount_total"),
            ("Gebühren", "fees_total"),
        ],
        rows=rows,
    )


async def _build_offene_salden_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
    hotel_access,
) -> ReportDownloadPayload:
    rows = await _cash_master_rows(
        db,
        property_id=property_id,
        hotel_access=hotel_access,
        start_date=start_date,
        end_date=end_date,
    )
    export_rows = [row for row in rows if float(row["balance_due"] or 0) > 0]
    return _build_csv_payload(
        report_type=PmsReportType.OFFENE_SALDEN,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Rechnungsnr.", "invoice_number"),
            ("Gast / Firma", "guest_or_company"),
            ("Reservierung", "reservation_id"),
            ("Zimmer", "room_number"),
            ("Rechnungsdatum", "invoice_date"),
            ("Status", "status"),
            ("Bezahlt", "paid_amount"),
            ("Offen", "balance_due"),
            ("Zahlart", "payment_method"),
        ],
        rows=export_rows,
    )


async def _build_rechnungsbericht_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
    hotel_access,
) -> ReportDownloadPayload:
    rows = await _cash_master_rows(
        db,
        property_id=property_id,
        hotel_access=hotel_access,
        start_date=start_date,
        end_date=end_date,
    )
    return _build_csv_payload(
        report_type=PmsReportType.RECHNUNGSBERICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Rechnungsnr.", "invoice_number"),
            ("Gast / Firma", "guest_or_company"),
            ("Reservierung", "reservation_id"),
            ("Buchungsnr.", "booking_id"),
            ("Zimmer", "room_number"),
            ("Rechnungsdatum", "invoice_date"),
            ("Status", "status"),
            ("Rechnungsbetrag", "total_amount"),
            ("Bezahlt", "paid_amount"),
            ("Offen", "balance_due"),
        ],
        rows=rows,
    )


async def _build_warengruppenjournal_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    service_date = func.coalesce(HotelFolioLine.service_date, HotelReservation.check_in)
    query = (
        select(
            func.lower(HotelFolioLine.charge_type).label("charge_type"),
            func.count(HotelFolioLine.id).label("line_count"),
            func.coalesce(func.sum(HotelFolioLine.quantity), 0).label("quantity_total"),
            func.coalesce(func.sum(HotelFolioLine.total_price), 0).label("gross_total"),
        )
        .select_from(HotelFolioLine)
        .join(HotelFolio, HotelFolio.id == HotelFolioLine.folio_id)
        .join(HotelReservation, HotelReservation.id == HotelFolio.reservation_id)
        .where(
            HotelFolio.property_id == property_id,
            service_date >= start_date,
            service_date <= end_date,
            HotelFolioLine.status != "void",
        )
        .group_by(func.lower(HotelFolioLine.charge_type))
        .order_by(func.lower(HotelFolioLine.charge_type).asc())
    )
    rows = [
        {
            "charge_type": item.charge_type or "unknown",
            "line_count": item.line_count,
            "quantity_total": float(item.quantity_total or 0),
            "gross_total": float(item.gross_total or 0),
        }
        for item in (await db.execute(query)).all()
    ]
    return _build_csv_payload(
        report_type=PmsReportType.WARENGRUPPENJOURNAL,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Warengruppe", "charge_type"),
            ("Buchungen", "line_count"),
            ("Menge", "quantity_total"),
            ("Umsatz", "gross_total"),
        ],
        rows=rows,
    )


async def _build_belegungsuebersicht_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    daily = await get_reporting_daily(
        db,
        property_id=property_id,
        start_date=start_date,
        days=_days_in_range(start_date, end_date),
    )
    rows = [
        {
            "report_date": item["report_date"],
            "occupied_rooms": item["occupied_rooms"],
            "occupancy_pct": item["occupancy_pct"],
            "room_count": daily["room_count"],
        }
        for item in daily["items"]
    ]
    return _build_csv_payload(
        report_type=PmsReportType.BELEGUNGSUEBERSICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Datum", "report_date"),
            ("Belegte Zimmer", "occupied_rooms"),
            ("Zimmer gesamt", "room_count"),
            ("Belegung %", "occupancy_pct"),
        ],
        rows=rows,
    )


async def _build_tageszahlen_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    daily = await get_reporting_daily(
        db,
        property_id=property_id,
        start_date=start_date,
        days=_days_in_range(start_date, end_date),
    )
    rows = [
        {
            "report_date": item["report_date"],
            "arrivals": item["arrivals"],
            "departures": item["departures"],
            "occupied_rooms": item["occupied_rooms"],
            "turnover": item["turnover"],
        }
        for item in daily["items"]
    ]
    return _build_csv_payload(
        report_type=PmsReportType.TAGESZAHLEN,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Datum", "report_date"),
            ("Anreisen", "arrivals"),
            ("Abreisen", "departures"),
            ("Belegte Zimmer", "occupied_rooms"),
            ("Umsatz", "turnover"),
        ],
        rows=rows,
    )


async def _build_buchungsquellen_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    query = (
        select(
            func.coalesce(HotelReservation.booking_source, "Unbekannt").label("booking_source"),
            func.count(HotelReservation.id).label("reservation_count"),
            func.coalesce(func.sum(HotelReservation.total_amount), 0).label("revenue_total"),
        )
        .where(
            HotelReservation.property_id == property_id,
            HotelReservation.check_in >= start_date,
            HotelReservation.check_in <= end_date,
        )
        .group_by(func.coalesce(HotelReservation.booking_source, "Unbekannt"))
        .order_by(func.coalesce(func.sum(HotelReservation.total_amount), 0).desc())
    )
    rows = [
        {
            "booking_source": item.booking_source,
            "reservation_count": item.reservation_count,
            "revenue_total": float(item.revenue_total or 0),
        }
        for item in (await db.execute(query)).all()
    ]
    return _build_csv_payload(
        report_type=PmsReportType.BUCHUNGSQUELLENBERICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Buchungsquelle", "booking_source"),
            ("Reservierungen", "reservation_count"),
            ("Umsatz", "revenue_total"),
        ],
        rows=rows,
    )


async def _build_kennzahlen_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    summary = await get_reporting_summary(
        db,
        property_id=property_id,
        start_date=start_date,
        days=_days_in_range(start_date, end_date),
    )
    rows = [
        {
            "start_date": summary["start_date"],
            "end_date": summary["end_date"],
            "room_count": summary["room_count"],
            "occupied_room_nights": summary["occupied_room_nights"],
            "available_room_nights": summary["available_room_nights"],
            "occupancy_pct": summary["occupancy_pct"],
            "arrivals": summary["arrivals"],
            "departures": summary["departures"],
            "turnover_total": summary["turnover_total"],
        }
    ]
    return _build_csv_payload(
        report_type=PmsReportType.KENNZAHLENBERICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Von", "start_date"),
            ("Bis", "end_date"),
            ("Zimmer gesamt", "room_count"),
            ("Belegte Zimmernächte", "occupied_room_nights"),
            ("Verfügbare Zimmernächte", "available_room_nights"),
            ("Belegung %", "occupancy_pct"),
            ("Anreisen", "arrivals"),
            ("Abreisen", "departures"),
            ("Umsatz", "turnover_total"),
        ],
        rows=rows,
    )


async def _build_city_tax_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    service_date = func.coalesce(HotelFolioLine.service_date, HotelReservation.check_in)
    raw_rows = (
        await db.execute(
            select(
                service_date.label("service_date"),
                HotelReservation.id.label("reservation_id"),
                HotelReservation.guest_name,
                HotelReservation.check_in,
                HotelReservation.check_out,
                GuestProfile,
                HotelFolioLine.charge_type,
                HotelFolioLine.description,
                HotelFolioLine.metadata_json,
                HotelFolioLine.total_price,
            )
            .select_from(HotelFolioLine)
            .join(HotelFolio, HotelFolio.id == HotelFolioLine.folio_id)
            .join(HotelReservation, HotelReservation.id == HotelFolio.reservation_id)
            .outerjoin(GuestProfile, GuestProfile.id == HotelReservation.guest_id)
            .where(
                HotelFolio.property_id == property_id,
                service_date >= start_date,
                service_date <= end_date,
                HotelFolioLine.status != "void",
            )
            .order_by(service_date.asc(), HotelReservation.id.asc())
        )
    ).all()
    grouped_rows: dict[tuple[date, int], dict[str, object]] = {}
    for (
        service_day,
        reservation_id,
        guest_name,
        check_in,
        check_out,
        guest,
        charge_type,
        description,
        metadata_json,
        total_price,
    ) in raw_rows:
        if not _is_city_tax_line(charge_type, description, metadata_json):
            continue
        row_key = (service_day, reservation_id)
        current = grouped_rows.setdefault(
            row_key,
            {
                "date": service_day,
                "guest_name": guest_name,
                "number_of_nights": max((check_out - check_in).days, 0),
                "total_city_tax_amount": 0.0,
                "business_travel_tax_exempt": _business_travel_tax_exempt(guest),
            },
        )
        current["total_city_tax_amount"] = float(current["total_city_tax_amount"]) + float(total_price or 0)
    rows = list(grouped_rows.values())
    return _build_csv_payload(
        report_type=PmsReportType.CITY_TAX_BERICHT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Date", "date"),
            ("Guest_Name", "guest_name"),
            ("Number_of_Nights", "number_of_nights"),
            ("Total_City_Tax_Amount", "total_city_tax_amount"),
            ("Business_Travel_Tax_Exempt", "business_travel_tax_exempt"),
        ],
        rows=rows,
    )


async def _build_gobd_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
    hotel_access,
) -> ReportDownloadPayload:
    closed_statuses = _closed_invoice_statuses()
    query = (
        select(
            HotelInvoice.invoice_number,
            func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)).label("issue_date"),
            func.coalesce(HotelInvoice.recipient_name, HotelReservation.guest_name).label("recipient_name"),
            func.coalesce(func.sum(HotelInvoiceLine.net_amount), 0).label("net_amount"),
            func.coalesce(
                func.sum(
                    case(
                        (HotelInvoiceLine.tax_rate == 7, HotelInvoiceLine.tax_amount),
                        else_=0,
                    )
                ),
                0,
            ).label("vat_7_amount"),
            func.coalesce(
                func.sum(
                    case(
                        (HotelInvoiceLine.tax_rate == 19, HotelInvoiceLine.tax_amount),
                        else_=0,
                    )
                ),
                0,
            ).label("vat_19_amount"),
            func.coalesce(func.sum(HotelInvoiceLine.gross_amount), 0).label("gross_total"),
            func.coalesce(
                func.max(
                    case(
                        (HotelFolioPayment.status == "completed", HotelFolioPayment.method),
                        else_=HotelReservation.zahlungs_methode,
                    )
                ),
                HotelReservation.zahlungs_methode,
            ).label("payment_method"),
        )
        .select_from(HotelInvoice)
        .join(HotelReservation, HotelReservation.id == HotelInvoice.reservation_id)
        .join(HotelInvoiceLine, HotelInvoiceLine.invoice_id == HotelInvoice.id)
        .outerjoin(HotelFolio, HotelFolio.id == HotelInvoice.folio_id)
        .outerjoin(HotelFolioPayment, HotelFolioPayment.folio_id == HotelFolio.id)
        .where(
            HotelInvoice.property_id == property_id,
            HotelInvoice.status.in_(closed_statuses),
            func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)) >= start_date,
            func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)) <= end_date,
        )
        .group_by(
            HotelInvoice.id,
            HotelInvoice.invoice_number,
            func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)),
            func.coalesce(HotelInvoice.recipient_name, HotelReservation.guest_name),
            HotelReservation.zahlungs_methode,
        )
        .order_by(func.date(func.coalesce(HotelInvoice.issued_at, HotelInvoice.created_at)).asc(), HotelInvoice.invoice_number.asc())
    )
    rows = [
        {
            "invoice_number": item.invoice_number,
            "issue_date": item.issue_date,
            "recipient_name": item.recipient_name,
            "net_amount": float(item.net_amount or 0),
            "vat_7_amount": float(item.vat_7_amount or 0),
            "vat_19_amount": float(item.vat_19_amount or 0),
            "gross_total": float(item.gross_total or 0),
            "payment_method": item.payment_method,
        }
        for item in (await db.execute(query)).all()
    ]
    return _build_csv_payload(
        report_type=PmsReportType.GOBD_EXPORT,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Invoice_Number", "invoice_number"),
            ("Issue_Date", "issue_date"),
            ("Recipient_Name", "recipient_name"),
            ("Net_Amount", "net_amount"),
            ("VAT_7%_Amount", "vat_7_amount"),
            ("VAT_19%_Amount", "vat_19_amount"),
            ("Gross_Total", "gross_total"),
            ("Payment_Method", "payment_method"),
        ],
        rows=rows,
    )


async def _build_meldeschein_csv(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    query = (
        select(
            HotelReservation.check_in,
            HotelReservation.check_out,
            GuestProfile,
        )
        .select_from(StayOccupant)
        .join(HotelStay, HotelStay.id == StayOccupant.stay_id)
        .join(HotelReservation, HotelReservation.id == HotelStay.reservation_id)
        .join(GuestProfile, GuestProfile.id == StayOccupant.guest_profile_id)
        .where(
            HotelStay.property_id == property_id,
            HotelReservation.check_in >= start_date,
            HotelReservation.check_in <= end_date,
        )
        .order_by(HotelReservation.check_in.asc(), StayOccupant.is_primary.desc(), GuestProfile.id.asc())
    )
    rows = []
    for arrival_date, departure_date, guest in (await db.execute(query)).all():
        first_name, last_name = _split_name(guest.name)
        rows.append(
            {
                "arrival_date": arrival_date,
                "departure_date": departure_date,
                "first_name": first_name,
                "last_name": last_name,
                "date_of_birth": guest.birthday,
                "nationality": guest.country_name or guest.country_code or "",
                "passport_id_number": _guest_identity_number(guest),
                "home_address": _guest_home_address(guest),
            }
        )
    return _build_csv_payload(
        report_type=PmsReportType.MELDESCHEIN_DOWNLOAD,
        start_date=start_date,
        end_date=end_date,
        columns=[
            ("Arrival_Date", "arrival_date"),
            ("Departure_Date", "departure_date"),
            ("First_Name", "first_name"),
            ("Last_Name", "last_name"),
            ("Date_of_Birth", "date_of_birth"),
            ("Nationality", "nationality"),
            ("Passport/ID_Number", "passport_id_number"),
            ("Home_Address", "home_address"),
        ],
        rows=rows,
    )


async def _build_fremdenverkehr_xml(
    db: AsyncSession,
    *,
    property_id: int,
    start_date: date,
    end_date: date,
) -> ReportDownloadPayload:
    query = (
        select(
            func.coalesce(GuestProfile.country_code, "UN").label("country_code"),
            func.coalesce(GuestProfile.country_name, "Unbekannt").label("country_name"),
            func.count(HotelReservation.id).label("arrivals"),
            func.coalesce(func.sum(HotelReservation.adults), 0).label("guests"),
        )
        .select_from(HotelReservation)
        .outerjoin(GuestProfile, GuestProfile.id == HotelReservation.guest_id)
        .where(
            HotelReservation.property_id == property_id,
            HotelReservation.check_in >= start_date,
            HotelReservation.check_in <= end_date,
        )
        .group_by(
            func.coalesce(GuestProfile.country_code, "UN"),
            func.coalesce(GuestProfile.country_name, "Unbekannt"),
        )
        .order_by(func.count(HotelReservation.id).desc())
    )
    root = Element("Fremdenverkehrsstatistik")
    root.set("property_id", str(property_id))
    root.set("start", start_date.isoformat())
    root.set("end", end_date.isoformat())
    for item in (await db.execute(query)).all():
        country = SubElement(root, "Land")
        country.set("code", item.country_code)
        SubElement(country, "Name").text = item.country_name
        SubElement(country, "Anreisen").text = str(int(item.arrivals or 0))
        SubElement(country, "Gaeste").text = str(int(item.guests or 0))
    return _build_xml_payload(
        report_type=PmsReportType.FREMDENVERKEHRSSTATISTIK_XML,
        start_date=start_date,
        end_date=end_date,
        xml_root=root,
    )


async def build_pms_report_download(
    db: AsyncSession,
    *,
    property_id: int,
    report_type: PmsReportType,
    start_date: date | None,
    end_date: date | None,
    hotel_access,
) -> ReportDownloadPayload:
    window_start, window_end = _normalize_range(start_date=start_date, end_date=end_date)
    if report_type == PmsReportType.COCKPITLISTE:
        return await _build_cockpitliste_csv(db, property_id=property_id, start_date=window_start)
    if report_type == PmsReportType.HOUSEKEEPINGLISTE:
        return await _build_housekeepingliste_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.HAUS_STATUS:
        return await _build_haus_status_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.FB_VERPFLEGUNGSBERICHT:
        return await _build_fb_verpflegungsbericht_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.KASSENBUCH:
        return await _build_kassenbuch_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.ANZAHLUNGSLISTE:
        return await _build_anzahlungsliste_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.EINNAHMEBERICHT:
        return await _build_einnahmebericht_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
            hotel_access=hotel_access,
        )
    if report_type == PmsReportType.FINANZKONTEN_UEBERSICHT:
        return await _build_finanzkonten_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.OFFENE_SALDEN:
        return await _build_offene_salden_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
            hotel_access=hotel_access,
        )
    if report_type == PmsReportType.RECHNUNGSBERICHT:
        return await _build_rechnungsbericht_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
            hotel_access=hotel_access,
        )
    if report_type == PmsReportType.WARENGRUPPENJOURNAL:
        return await _build_warengruppenjournal_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.BELEGUNGSUEBERSICHT:
        return await _build_belegungsuebersicht_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.TAGESZAHLEN:
        return await _build_tageszahlen_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.BUCHUNGSQUELLENBERICHT:
        return await _build_buchungsquellen_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.KENNZAHLENBERICHT:
        return await _build_kennzahlen_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.CITY_TAX_BERICHT:
        return await _build_city_tax_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.GOBD_EXPORT:
        return await _build_gobd_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
            hotel_access=hotel_access,
        )
    if report_type == PmsReportType.MELDESCHEIN_DOWNLOAD:
        return await _build_meldeschein_csv(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    if report_type == PmsReportType.FREMDENVERKEHRSSTATISTIK_XML:
        return await _build_fremdenverkehr_xml(
            db,
            property_id=property_id,
            start_date=window_start,
            end_date=window_end,
        )
    raise HTTPException(status_code=400, detail="Unsupported report type")


async def get_pms_reporting_summary(db: AsyncSession, *, property_id: int, start_date: date | None = None, days: int = 30):
    return await get_reporting_summary(db, property_id=property_id, start_date=start_date, days=days)


async def get_pms_reporting_daily(db: AsyncSession, *, property_id: int, start_date: date | None = None, days: int = 30):
    return await get_reporting_daily(db, property_id=property_id, start_date=start_date, days=days)
