from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr

from app.hms.models import HotelReservation as HotelReservationRecord
from app.reservations.models import Reservation as RestaurantReservationRecord
from app.reservations.schemas import UnifiedReservationCreate


class Reservation(BaseModel):
    """Canonical reservation domain model for both restaurant and hotel flows."""

    model_config = ConfigDict(str_strip_whitespace=True)

    id: int | None = None
    type: Literal["restaurant", "hotel"]

    restaurant_id: int | None = None
    property_id: int | None = None
    guest_id: int | None = None
    guest_name: str
    guest_email: EmailStr | str | None = None
    guest_phone: str | None = None
    phone: str | None = None
    status: str = "confirmed"
    source: str = "phone"
    special_requests: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    table_id: int | None = None
    party_size: int | None = None
    reservation_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    duration_min: int = 90

    check_in: date | None = None
    check_out: date | None = None
    room_type_id: int | None = None
    room_type_label: str | None = None
    room: str | None = None
    adults: int | None = None
    children: int | None = None
    total_amount: float | None = None
    currency: str | None = None
    booking_id: str | None = None
    anrede: str | None = None
    zahlungs_methode: str | None = None
    zahlungs_status: str | None = None
    payment_status: str | None = None
    stripe_payment_intent_id: str | None = None
    create_payment_intent: bool = False
    booking_id_prefix: str = "BK"

    @classmethod
    def from_create_payload(cls, payload: UnifiedReservationCreate) -> "Reservation":
        return cls(
            type=payload.kind,
            restaurant_id=payload.restaurant_id,
            property_id=payload.property_id,
            guest_id=payload.guest_id,
            guest_name=payload.guest_name,
            guest_email=str(payload.guest_email) if payload.guest_email else None,
            guest_phone=payload.guest_phone,
            phone=payload.phone or payload.guest_phone,
            status=payload.status or "confirmed",
            source=payload.source,
            special_requests=payload.special_requests,
            notes=payload.notes,
            table_id=payload.table_id,
            party_size=payload.party_size,
            reservation_date=payload.reservation_date,
            start_time=payload.start_time,
            end_time=payload.end_time,
            duration_min=payload.duration_min,
            check_in=payload.check_in,
            check_out=payload.check_out,
            room_type_id=payload.room_type_id,
            room_type_label=payload.room_type_label,
            room=payload.room,
            adults=payload.adults,
            children=payload.children,
            anrede=payload.anrede,
            zahlungs_methode=payload.zahlungs_methode,
            zahlungs_status=payload.zahlungs_status,
            create_payment_intent=payload.create_payment_intent,
            booking_id_prefix=payload.booking_id_prefix,
        )

    @classmethod
    def from_restaurant_record(cls, record: RestaurantReservationRecord) -> "Reservation":
        return cls(
            id=record.id,
            type="restaurant",
            restaurant_id=record.restaurant_id,
            guest_id=record.guest_id,
            guest_name=record.guest_name,
            guest_email=record.guest_email,
            guest_phone=record.guest_phone,
            phone=record.guest_phone,
            status=record.status,
            source=record.source,
            special_requests=record.special_requests,
            notes=record.notes,
            created_at=record.created_at,
            updated_at=record.updated_at,
            table_id=record.table_id,
            party_size=record.party_size,
            reservation_date=record.reservation_date,
            start_time=record.start_time,
            end_time=record.end_time,
            duration_min=record.duration_min,
            payment_status=record.payment_status,
            stripe_payment_intent_id=record.stripe_payment_intent_id,
        )

    @classmethod
    def from_hotel_record(
        cls,
        record: HotelReservationRecord,
        *,
        source: str = "hotel",
    ) -> "Reservation":
        canonical_phone = record.guest_phone or record.phone
        return cls(
            id=record.id,
            type="hotel",
            property_id=record.property_id,
            guest_id=record.guest_id,
            guest_name=record.guest_name,
            guest_email=record.guest_email,
            guest_phone=canonical_phone,
            phone=canonical_phone,
            status=record.status,
            source=source,
            special_requests=record.special_requests,
            notes=record.notes,
            created_at=record.created_at,
            updated_at=record.updated_at,
            check_in=record.check_in,
            check_out=record.check_out,
            room_type_id=record.room_type_id,
            room_type_label=record.room_type_label,
            room=record.room,
            adults=record.adults,
            children=record.children,
            total_amount=float(record.total_amount) if record.total_amount is not None else None,
            currency=record.currency,
            booking_id=record.booking_id,
            anrede=record.anrede,
            zahlungs_methode=record.zahlungs_methode,
            zahlungs_status=record.zahlungs_status,
            payment_status=record.payment_status,
            stripe_payment_intent_id=record.stripe_payment_intent_id,
        )

    def copy_with(self, **changes: Any) -> "Reservation":
        return self.model_copy(update=changes)

    def to_restaurant_response(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "guest_id": self.guest_id,
            "guest_name": self.guest_name,
            "guest_phone": self.guest_phone,
            "guest_email": self.guest_email,
            "table_id": self.table_id,
            "party_size": self.party_size,
            "reservation_date": self.reservation_date,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_min": self.duration_min,
            "status": self.status,
            "special_requests": self.special_requests,
            "notes": self.notes,
            "source": self.source,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    def to_hotel_response(self, *, client_secret: str | None = None) -> dict[str, Any]:
        nights = 1
        if self.check_in and self.check_out:
            nights = max(1, (self.check_out - self.check_in).days)
        payload = {
            "id": f"R-{self.id}",
            "anrede": self.anrede or "",
            "guest_name": self.guest_name,
            "email": self.guest_email or "",
            "phone": self.guest_phone or self.phone or "",
            "room_type": self.room_type_label or "Komfort",
            "check_in": self.check_in.isoformat() if self.check_in else "",
            "check_out": self.check_out.isoformat() if self.check_out else "",
            "nights": nights,
            "adults": self.adults or 1,
            "children": self.children or 0,
            "status": (self.status or "confirmed").replace("_", "-"),
            "special_requests": self.special_requests or "",
            "room": self.room or "",
            "zahlungs_methode": self.zahlungs_methode or "",
            "zahlungs_status": self.zahlungs_status or "offen",
            "total_amount": float(self.total_amount) if self.total_amount else 0.0,
            "notes": self.notes or "",
            "booking_id": self.booking_id,
        }
        if client_secret is not None:
            payload["client_secret"] = client_secret
        return payload
