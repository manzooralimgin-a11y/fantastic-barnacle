from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

EmailCategory = Literal["pending", "reservation", "spam", "other"]
EmailThreadStatus = Literal["pending", "processed", "ignored"]
EmailIntent = Literal["hotel", "restaurant"]
EmailReplyMode = Literal["generate_only", "auto_send", "manual_approval"]


class NormalizedEmailPayload(BaseModel):
    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    id: str = Field(min_length=1, max_length=255)
    sender: str = Field(alias="from", min_length=3, max_length=255)
    subject: str = Field(default="", max_length=500)
    body: str = Field(min_length=1, max_length=50_000)
    received_at: datetime


class EmailClassification(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    category: Literal["reservation", "spam", "other"]
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str | None = Field(default=None, max_length=500)


class ExtractedBookingData(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    guest_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    check_in: date | None = None
    check_out: date | None = None
    reservation_date: date | None = None
    start_time: time | None = None
    guests: int | None = Field(default=None, ge=1, le=50)
    room_type: str | None = Field(default=None, max_length=100)
    intent: EmailIntent | None = None
    summary: str | None = Field(default=None, max_length=500)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr | None) -> str | None:
        return str(value).lower() if value else None


class EmailReplyDraft(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    content: str = Field(min_length=1, max_length=20_000)
    safe_to_send: bool = True
    reasoning: str | None = Field(default=None, max_length=500)


class EmailThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    external_email_id: str
    sender: str
    subject: str | None
    body: str
    received_at: datetime
    category: str
    classification_confidence: float | None
    extracted_data: dict[str, Any] | None
    summary: str | None
    reply_generated: bool
    reply_sent: bool
    reply_content: str | None
    reply_generated_at: datetime | None
    reply_sent_at: datetime | None
    replied_by_user_id: int | None
    status: str
    reply_mode: str
    processing_error: str | None
    reply_error: str | None
    reply_badge: str


class EmailInboxListResponse(BaseModel):
    items: list[EmailThreadRead]
    total: int
    pending: int
    auto_replied: int
    manually_replied: int


class EmailIngestResponse(BaseModel):
    thread_id: int
    status: str
    duplicate: bool = False


class GenerateReplyResponse(BaseModel):
    ok: bool = True
    thread: EmailThreadRead


class SendReplyRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    reply_content: str | None = Field(default=None, min_length=1, max_length=20_000)


class EmailThreadUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    reply_content: str | None = Field(default=None, min_length=1, max_length=20_000)
    status: EmailThreadStatus | None = None


class EmailInboxStats(BaseModel):
    total_emails: int
    filtered_emails: int
    reply_generated: int
    reply_sent: int

