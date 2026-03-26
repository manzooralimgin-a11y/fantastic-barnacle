from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ── Vouchers ──
class VoucherRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    amount_total: float = Field(ge=0)
    amount_remaining: float = Field(ge=0)
    customer_name: str | None
    customer_email: str | None
    status: Literal["active", "used", "expired", "cancelled"]
    expiry_date: datetime | None
    notes: str | None
    created_at: datetime
    qr_code_base64: str | None = None # Field to return dynamically generated QR to frontend


class VoucherCreate(BaseModel):
    amount_total: float = Field(ge=0)
    customer_name: str | None = None
    customer_email: str | None = None
    expiry_date: datetime | None = None
    notes: str | None = None


class VoucherUpdate(BaseModel):
    status: Literal["active", "used", "expired", "cancelled"] | None = None  # manual override
    notes: str | None = None


class VoucherValidate(BaseModel):
    code: str


class VoucherValidateResponse(BaseModel):
    valid: bool
    message: str
    voucher: VoucherRead | None = None


class VoucherRedeem(BaseModel):
    code: str
    order_id: int | None = None
    deduction_amount: float = Field(ge=0)


class VoucherRedemptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    voucher_id: int
    order_id: int | None
    discount_applied: float = Field(ge=0)
    redeemed_at: datetime


# ────────────────────── CUSTOMER CARDS ──────────────────────
class CustomerCardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    guest_id: int | None
    card_number: str
    card_type: str
    points_balance: int
    tier: str | None
    stamps_count: int
    stamps_target: int
    total_spent: float
    holder_name: str | None
    is_active: bool
    created_at: datetime


class CustomerCardCreate(BaseModel):
    guest_id: int | None = None
    card_type: str = "points"
    stamps_target: int = 10
    holder_name: str | None = None


class AddPoints(BaseModel):
    points: int
    reason: str | None = None


class RedeemPoints(BaseModel):
    points: int
