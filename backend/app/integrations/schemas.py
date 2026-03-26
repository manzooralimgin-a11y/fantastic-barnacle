from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

class VoiceBookerEvent(BaseModel):
    event_id: str
    event_type: str
    timestamp: datetime
    payload: dict[str, Any]

class WebhookResponse(BaseModel):
    status: str
    event_id: str


class GastronomyReservationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    type: Literal["restaurant"] = "restaurant"
    restaurant_id: int = Field(gt=0)
    guest_name: str = Field(min_length=1, max_length=255)
    guest_email: EmailStr | None = None
    guest_phone: str | None = Field(default=None, min_length=3, max_length=50)
    party_size: int = Field(ge=1, le=100)
    reservation_date: date
    start_time: time
    table_id: int | None = Field(default=None, gt=0)
    duration_min: int = Field(default=90, ge=1, le=1440)
    special_requests: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=1000)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=128)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    intent_source: str | None = Field(default=None, max_length=100)

    def to_unified_payload(self) -> dict[str, Any]:
        payload = self.model_dump(
            exclude_none=True,
            exclude={"idempotency_key", "confidence", "intent_source"},
        )
        payload["kind"] = payload.pop("type")
        payload["source"] = "mcp"
        return payload


class HotelReservationInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    type: Literal["hotel"] = "hotel"
    property_id: int = Field(gt=0)
    room_type_id: int | None = Field(default=None, gt=0)
    room_type_label: str | None = Field(default=None, min_length=1, max_length=100)
    guest_name: str = Field(min_length=1, max_length=255)
    guest_email: EmailStr | None = None
    guest_phone: str | None = Field(default=None, min_length=3, max_length=50)
    check_in: date
    check_out: date
    adults: int = Field(default=1, ge=1, le=10)
    children: int = Field(default=0, ge=0, le=10)
    anrede: str | None = Field(default=None, max_length=20)
    room: str | None = Field(default=None, max_length=20)
    zahlungs_methode: str | None = Field(default=None, max_length=50)
    zahlungs_status: str | None = Field(default="offen", max_length=50)
    special_requests: str | None = Field(default=None, max_length=1000)
    notes: str | None = Field(default=None, max_length=1000)
    create_payment_intent: bool = False
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=128)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    intent_source: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def require_room_type(self):
        if self.room_type_id is None and self.room_type_label is None:
            raise ValueError("room_type_id or room_type_label is required")
        return self

    def to_unified_payload(self) -> dict[str, Any]:
        payload = self.model_dump(
            exclude_none=True,
            exclude={"idempotency_key", "confidence", "intent_source"},
        )
        payload["kind"] = payload.pop("type")
        payload["source"] = "mcp"
        return payload


class RestaurantAvailabilityInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    restaurant_id: int = Field(gt=0)
    date: date
    party_size: int = Field(ge=1, le=100)

    def to_service_kwargs(self) -> dict[str, Any]:
        return self.model_dump()


class HotelAvailabilityInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    property_id: int = Field(gt=0)
    check_in: date
    check_out: date
    adults: int = Field(default=1, ge=1, le=10)
    children: int = Field(default=0, ge=0, le=10)

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        return self

    def to_service_kwargs(self) -> dict[str, Any]:
        return self.model_dump()


class FilteredEmailsInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    limit: int = Field(default=20, ge=1, le=100)


class GenerateEmailReplyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    thread_id: int = Field(gt=0)


class SendEmailReplyInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    thread_id: int = Field(gt=0)
    reply_content: str | None = Field(default=None, min_length=1, max_length=20_000)
