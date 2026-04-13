from datetime import date

from pydantic import BaseModel, Field


# ── Availability ─────────────────────────────────────────────────────────────

class AvailabilityRequest(BaseModel):
    check_in: date
    check_out: date
    pax: int = Field(default=1, ge=1, le=20)
    property_id: int = Field(gt=0)


class AvailableRoomRead(BaseModel):
    room_id: int
    room_number: str
    room_type_id: int
    room_type_name: str
    max_occupancy: int
    floor: int | None = None
    status: str


class AvailabilityRead(BaseModel):
    check_in: date
    check_out: date
    nights: int
    pax: int
    rooms: list[AvailableRoomRead] = Field(default_factory=list)


# ── Pricing quote ─────────────────────────────────────────────────────────────

class PricingQuoteRequest(BaseModel):
    check_in: date
    check_out: date
    room_type_id: int = Field(gt=0)
    property_id: int = Field(gt=0)


class RatePlanQuoteRead(BaseModel):
    plan_id: int
    plan_code: str
    plan_name: str
    avg_nightly_rate: float
    total_price: float
    nights: int
    currency: str = "EUR"


class PricingQuoteRead(BaseModel):
    check_in: date
    check_out: date
    nights: int
    room_type_id: int
    rate_plans: list[RatePlanQuoteRead] = Field(default_factory=list)


# ── Hotel Extras ─────────────────────────────────────────────────────────────

class HotelExtraRead(BaseModel):
    id: int
    property_id: int
    name: str
    unit_price: float
    per_person: bool
    daily: bool
    is_active: bool
    sort_order: int


class HotelExtraCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    unit_price: float = Field(ge=0)
    per_person: bool = False
    daily: bool = False
    sort_order: int = 0


class HotelExtraUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    unit_price: float | None = Field(default=None, ge=0)
    per_person: bool | None = None
    daily: bool | None = None
    is_active: bool | None = None
    sort_order: int | None = None


# ── Stay Occupant ─────────────────────────────────────────────────────────────

class StayOccupantRead(BaseModel):
    guest_profile_id: int
    is_primary: bool
    guest_name: str | None = None
    guest_email: str | None = None


class StayOccupantUpsert(BaseModel):
    """Used when saving the Gäste block: replaces all occupants for a stay."""
    occupants: list[int] = Field(
        default_factory=list,
        description="Ordered list of guest_profile_id values. First entry is primary.",
    )
