from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ── Table Order ──

class TableOrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int | None = None
    table_id: int | None = None
    server_id: int | None = None
    status: str
    order_type: str
    subtotal: float
    tax_amount: float
    discount_amount: float
    discount_reason: str | None = None
    tip_amount: float
    total: float
    notes: str | None = None
    guest_name: str | None = None
    created_at: datetime
    updated_at: datetime


class TableOrderCreate(BaseModel):
    session_id: int | None = None
    table_id: int | None = None
    server_id: int | None = None
    order_type: str = "dine_in"
    notes: str | None = None
    guest_name: str | None = None


class TableOrderUpdate(BaseModel):
    status: str | None = None
    discount_amount: float | None = None
    discount_reason: str | None = None
    tip_amount: float | None = None
    notes: str | None = None


# ── Order Item ──

class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    menu_item_id: int
    item_name: str
    quantity: int
    unit_price: float
    total_price: float
    modifiers_json: dict | None = None
    status: str
    notes: str | None = None
    sent_to_kitchen_at: datetime | None = None
    served_at: datetime | None = None
    station: str | None = None
    course_number: int = 1
    created_at: datetime
    updated_at: datetime


class OrderItemCreate(BaseModel):
    menu_item_id: int
    item_name: str
    quantity: int = 1
    unit_price: float
    modifiers_json: dict | None = None
    notes: str | None = None


class OrderItemUpdate(BaseModel):
    quantity: int | None = None
    status: str | None = None
    notes: str | None = None


# ── Bill ──

class BillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_id: int
    bill_number: str
    subtotal: float
    tax_rate: float
    tax_amount: float
    service_charge: float
    discount_amount: float
    tip_amount: float
    total: float
    split_type: str
    split_count: int
    status: str
    paid_at: datetime | None = None
    tip_suggestions_json: dict | None = None
    receipt_email: str | None = None
    receipt_phone: str | None = None
    receipt_token: str | None = None
    created_at: datetime
    updated_at: datetime


class BillCreate(BaseModel):
    order_id: int
    tax_rate: float = 0.10
    service_charge: float = 0
    split_type: str = "none"
    split_count: int = 1
    receipt_email: str | None = None
    receipt_phone: str | None = None


class BillSplitUpdate(BaseModel):
    split_type: str
    split_count: int = 1


# ── Payment ──

class PaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bill_id: int
    amount: float
    method: str
    reference: str | None = None
    tip_amount: float
    status: str
    paid_at: datetime | None = None
    processing_fee: float = 0
    gateway_reference: str | None = None
    card_last_four: str | None = None
    card_brand: str | None = None
    wallet_type: str | None = None
    refund_of_id: int | None = None
    created_at: datetime
    updated_at: datetime


class PaymentCreate(BaseModel):
    bill_id: int
    amount: float
    method: str
    reference: str | None = None
    tip_amount: float = 0
    card_last_four: str | None = None
    card_brand: str | None = None
    wallet_type: str | None = None


class RefundCreate(BaseModel):
    reason: str | None = None
    amount: float | None = None  # partial refund; None = full refund


# ── Cash Shift ──

class CashShiftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    opened_by: int | None = None
    closed_by: int | None = None
    opening_amount: float
    closing_amount: float | None = None
    expected_amount: float | None = None
    variance: float | None = None
    status: str
    opened_at: datetime
    closed_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class CashShiftOpen(BaseModel):
    opened_by: int | None = None
    opening_amount: float
    notes: str | None = None


class CashShiftClose(BaseModel):
    closed_by: int | None = None
    closing_amount: float
    notes: str | None = None


# ── KDS Station Config ──

class KDSStationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    display_name: str
    color: str
    category_ids_json: dict | None = None
    sort_order: int
    is_active: bool
    alert_sound: str | None = None
    created_at: datetime
    updated_at: datetime


class KDSStationCreate(BaseModel):
    name: str
    display_name: str
    color: str = "#3b82f6"
    category_ids_json: dict | None = None
    sort_order: int = 0
    is_active: bool = True
    alert_sound: str | None = None


class KDSStationUpdate(BaseModel):
    display_name: str | None = None
    color: str | None = None
    category_ids_json: dict | None = None
    sort_order: int | None = None
    is_active: bool | None = None
    alert_sound: str | None = None


# ── Receipt / Summary ──

class ReceiptData(BaseModel):
    bill_number: str
    order_id: int
    items: list[OrderItemRead]
    subtotal: float
    tax_rate: float
    tax_amount: float
    service_charge: float
    discount_amount: float
    tip_amount: float
    total: float
    payments: list[PaymentRead]
    paid_at: datetime | None = None
    receipt_token: str | None = None


class SendReceiptRequest(BaseModel):
    email: str | None = None
    phone: str | None = None


class DailySummary(BaseModel):
    date: str
    total_orders: int
    total_revenue: float
    total_tax: float
    total_tips: float
    total_discounts: float
    payment_breakdown: dict
    avg_order_value: float


class ActiveOrderSummary(BaseModel):
    id: int
    table_id: int | None = None
    table_number: str | None = None
    order_type: str
    status: str
    item_count: int
    total: float
    created_at: datetime
    elapsed_minutes: int
