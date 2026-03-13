from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict


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
    party_size: int
    reservation_date: date
    start_time: time
    end_time: time | None = None
    duration_min: int
    status: str
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
    party_size: int
    reservation_date: date
    start_time: time
    end_time: time | None = None
    duration_min: int = 90
    status: str = "confirmed"
    special_requests: str | None = None
    notes: str | None = None
    source: str = "phone"


class ReservationUpdate(BaseModel):
    guest_name: str | None = None
    guest_phone: str | None = None
    guest_email: str | None = None
    table_id: int | None = None
    party_size: int | None = None
    reservation_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    duration_min: int | None = None
    status: str | None = None
    special_requests: str | None = None
    notes: str | None = None


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
    party_size: int
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
    party_size: int
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
