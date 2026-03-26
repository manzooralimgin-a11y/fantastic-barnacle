from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


# ── Floor Section ──

class FloorSectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class FloorSectionCreate(BaseModel):
    name: str
    description: str | None = None
    sort_order: int = 0
    is_active: bool = True


class FloorSectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# ── Table ──

class TableRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    section_id: int
    table_number: str
    capacity: int
    min_capacity: int
    shape: str
    status: str
    position_x: int
    position_y: int
    rotation: float
    width: float
    height: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TableCreate(BaseModel):
    section_id: int
    table_number: str
    capacity: int
    min_capacity: int = 1
    shape: str = "square"
    status: str = "available"
    position_x: int = 0
    position_y: int = 0
    rotation: float = 0.0
    width: float = 1.0
    height: float = 1.0
    is_active: bool = True


class TableUpdate(BaseModel):
    section_id: int | None = None
    table_number: str | None = None
    capacity: int | None = None
    min_capacity: int | None = None
    shape: str | None = None
    status: str | None = None
    position_x: int | None = None
    position_y: int | None = None
    rotation: float | None = None
    width: float | None = None
    height: float | None = None
    is_active: bool | None = None


class TableStatusUpdate(BaseModel):
    status: str


# ── Reservation ──

class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_id: int | None = None
    guest_name: str
    guest_phone: str | None = None
    guest_email: str | None = None
    table_id: int | None = None
    party_size: int = Field(ge=1, le=100)
    reservation_date: date
    start_time: time
    end_time: time | None = None
    duration_min: int
    status: Literal["confirmed", "seated", "arrived", "completed", "cancelled", "no_show"]
    special_requests: str | None = None
    notes: str | None = None
    source: str
    created_at: datetime
    updated_at: datetime


class ReservationCreate(BaseModel):
    guest_id: int | None = None
    guest_name: str
    guest_phone: str | None = None
    guest_email: str | None = None
    table_id: int | None = None
    party_size: int = Field(ge=1, le=100)
    reservation_date: date
    start_time: time
    end_time: time | None = None
    duration_min: int = 90
    status: Literal["confirmed", "seated", "arrived", "completed", "cancelled", "no_show"] = "confirmed"
    special_requests: str | None = None
    notes: str | None = None
    source: str = "phone"


class ReservationUpdate(BaseModel):
    guest_name: str | None = None
    guest_phone: str | None = None
    guest_email: str | None = None
    table_id: int | None = None
    party_size: int | None = Field(default=None, ge=1, le=100)
    reservation_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    duration_min: int | None = None
    status: Literal["confirmed", "seated", "arrived", "completed", "cancelled", "no_show"] | None = None
    special_requests: str | None = None
    notes: str | None = None


class UnifiedReservationCreate(BaseModel):
    """Canonical reservation creation payload for `POST /api/reservations`.

    Use `kind="restaurant"` for restaurant reservations and `kind="hotel"` for
    hotel bookings.

    Canonical endpoint expectations:
    - Restaurant reservations require `party_size`, `reservation_date`, and
      `start_time`. `restaurant_id` must be supplied unless the authenticated
      tenant context provides it.
    - Hotel reservations require `property_id`, `check_in`, and `check_out`.
      `room_type_id` is preferred; `room_type_label` is accepted for legacy
      compatibility.
    """

    model_config = ConfigDict(
        str_strip_whitespace=True,
        json_schema_extra={
            "description": (
                "Canonical reservation creation schema shared by restaurant and "
                "hotel flows. Use kind='restaurant' for dining reservations and "
                "kind='hotel' for hotel bookings."
            ),
            "examples": [
                {
                    "kind": "restaurant",
                    "restaurant_id": 1,
                    "guest_name": "Ada Lovelace",
                    "guest_email": "ada@example.com",
                    "guest_phone": "+4912345678",
                    "party_size": 4,
                    "reservation_date": "2026-04-01",
                    "start_time": "19:00:00",
                    "special_requests": "Window table",
                    "status": "confirmed",
                    "source": "online",
                },
                {
                    "kind": "hotel",
                    "property_id": 2,
                    "guest_name": "Grace Hopper",
                    "guest_email": "grace@example.com",
                    "phone": "+49111222333",
                    "room_type_id": 5,
                    "check_in": "2026-05-10",
                    "check_out": "2026-05-12",
                    "adults": 2,
                    "children": 1,
                    "status": "confirmed",
                    "source": "web",
                },
            ],
        },
    )

    kind: Literal["restaurant", "hotel"] | None = Field(
        default=None,
        description="Reservation domain. Use 'restaurant' for dining and 'hotel' for HMS bookings.",
    )

    restaurant_id: int | None = Field(
        default=None,
        gt=0,
        description="Restaurant tenant ID. Required for canonical restaurant requests unless derived from authenticated tenant context.",
    )
    property_id: int | None = Field(
        default=None,
        gt=0,
        description="Hotel property ID. Required for canonical hotel requests.",
    )

    guest_id: int | None = Field(default=None, gt=0, description="Optional shared guest profile ID.")
    guest_name: str = Field(min_length=1, max_length=255, description="Guest full name.")
    guest_email: EmailStr | None = Field(default=None, description="Guest email address.")
    guest_phone: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        description="Canonical guest phone field for both restaurant and hotel flows.",
    )
    phone: str | None = Field(
        default=None,
        min_length=3,
        max_length=50,
        description="Legacy hotel-compatible alias for guest phone. Must match guest_phone when both are provided.",
    )

    table_id: int | None = Field(default=None, gt=0, description="Optional restaurant table assignment.")
    party_size: int | None = Field(
        default=None,
        ge=1,
        le=100,
        description="Restaurant party size. Required for restaurant reservations.",
    )
    reservation_date: date | None = Field(
        default=None,
        description="Restaurant reservation date. Required for restaurant reservations.",
    )
    start_time: time | None = Field(
        default=None,
        description="Restaurant reservation start time. Required for restaurant reservations.",
    )
    end_time: time | None = Field(default=None, description="Optional restaurant reservation end time.")
    duration_min: int = Field(default=90, ge=1, le=1440, description="Reservation duration in minutes.")
    status: str | None = Field(default="confirmed", description="Initial reservation status.")
    source: str = Field(default="phone", max_length=50, description="Booking source label.")
    special_requests: str | None = Field(default=None, max_length=1000, description="Guest special requests.")
    notes: str | None = Field(default=None, max_length=1000, description="Internal notes.")

    room_type_id: int | None = Field(
        default=None,
        gt=0,
        description="Preferred hotel room type identifier.",
    )
    room_type_label: str | None = Field(
        default=None,
        max_length=100,
        description="Legacy-compatible room type label. Accepted when room_type_id is unavailable.",
    )
    check_in: date | None = Field(default=None, description="Hotel check-in date. Required for hotel bookings.")
    check_out: date | None = Field(default=None, description="Hotel check-out date. Required for hotel bookings.")
    adults: int = Field(default=1, ge=1, le=10, description="Number of adult guests for hotel stays.")
    children: int = Field(default=0, ge=0, le=10, description="Number of child guests for hotel stays.")
    anrede: str | None = Field(default=None, max_length=20, description="Optional hotel salutation.")
    room: str | None = Field(default=None, max_length=20, description="Optional room number or room label.")
    zahlungs_methode: str | None = Field(default=None, max_length=50, description="Payment method label.")
    zahlungs_status: str | None = Field(default="offen", max_length=50, description="Hotel payment status.")
    create_payment_intent: bool = False
    booking_id_prefix: str = Field(
        default="BK",
        min_length=2,
        max_length=5,
        description="Booking ID prefix used for hotel reservation references.",
    )

    @model_validator(mode="before")
    @classmethod
    def infer_kind(cls, data):
        if not isinstance(data, dict):
            return data
        if data.get("kind"):
            return data
        hotel_keys = {"check_in", "check_out", "property_id", "room_type_id", "room_type_label"}
        if any(data.get(key) is not None for key in hotel_keys):
            data["kind"] = "hotel"
        else:
            data["kind"] = "restaurant"
        return data

    @field_validator("guest_email")
    @classmethod
    def normalize_email(cls, value: EmailStr | None) -> str | None:
        if value is None:
            return None
        return str(value).lower()

    @model_validator(mode="after")
    def validate_by_kind(self):
        if self.phone and self.guest_phone and self.phone != self.guest_phone:
            raise ValueError("phone and guest_phone must match when both are provided")
        canonical_phone = self.guest_phone or self.phone
        self.guest_phone = canonical_phone
        self.phone = canonical_phone

        if self.kind == "restaurant":
            missing = []
            if self.party_size is None:
                missing.append("party_size")
            if self.reservation_date is None:
                missing.append("reservation_date")
            if self.start_time is None:
                missing.append("start_time")
            if missing:
                raise ValueError(
                    f"Restaurant reservations require: {', '.join(missing)}"
                )

        if self.kind == "hotel":
            missing = []
            if self.check_in is None:
                missing.append("check_in")
            if self.check_out is None:
                missing.append("check_out")
            if missing:
                raise ValueError(f"Hotel reservations require: {', '.join(missing)}")
            if self.check_out <= self.check_in:
                raise ValueError("check_out must be after check_in")

        return self


# ── Waitlist ──

class WaitlistEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_name: str
    guest_phone: str | None = None
    party_size: int
    estimated_wait_min: int
    status: str
    check_in_time: datetime | None = None
    seated_time: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class WaitlistEntryCreate(BaseModel):
    guest_name: str
    guest_phone: str | None = None
    party_size: int = Field(ge=1, le=100)
    estimated_wait_min: int = 15
    notes: str | None = None


class WaitlistStatusUpdate(BaseModel):
    status: str


# ── Table Session ──

class TableSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    table_id: int
    reservation_id: int | None = None
    started_at: datetime
    ended_at: datetime | None = None
    status: str
    covers: int
    created_at: datetime
    updated_at: datetime


class TableSessionCreate(BaseModel):
    table_id: int
    reservation_id: int | None = None
    started_at: datetime
    covers: int = 1


# ── Availability ──

class AvailabilityQuery(BaseModel):
    reservation_date: date
    party_size: int = Field(ge=1, le=100)
    start_time: time | None = None


class AvailableSlot(BaseModel):
    table_id: int
    table_number: str
    capacity: int
    section_name: str
    available_times: list[str]


class FloorSummary(BaseModel):
    available: int
    occupied: int
    reserved: int
    cleaning: int
    blocked: int
    total: int
