from datetime import date, datetime

from pydantic import BaseModel, Field

from app.dashboard.schemas import AuditTimelineEvent
from app.hms.schemas import (
    HotelDocumentRead,
    HotelFolioLineCreate,
    HotelFolioPaymentCreate,
    HotelFolioRead,
    HotelInvoicePreviewRead,
    HotelInvoiceRead,
    HotelInvoiceSendRequest,
)


class PmsFolioRead(HotelFolioRead):
    pass


class PmsReservationChargeCreate(BaseModel):
    description: str = Field(min_length=2, max_length=255)
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(gt=0)
    service_date: date | None = None
    charge_type: str = Field(default="service", min_length=2, max_length=50)
    metadata_json: dict | None = None


class PmsInvoiceRead(HotelInvoiceRead):
    pass


class PmsInvoicePreviewRead(HotelInvoicePreviewRead):
    pass


class PmsInvoiceSendRequest(HotelInvoiceSendRequest):
    pass


class PmsInvoiceLineItemCreate(HotelFolioLineCreate):
    pass


class PmsInvoicePaymentCreate(HotelFolioPaymentCreate):
    pass


class PmsInvoiceDocumentActionRequest(BaseModel):
    document_kind: str = Field(min_length=3, max_length=50)


class PmsCashMasterRowRead(BaseModel):
    invoice_id: int
    invoice_number: str
    guest_or_company: str
    guest_name: str | None = None
    company_name: str | None = None
    reservation_id: int
    booking_id: str | None = None
    room_number: str | None = None
    invoice_date: datetime
    status: str
    invoice_status: str
    payment_status: str
    total_amount: float
    paid_amount: float
    balance_due: float
    payment_method: str | None = None
    currency: str
    document_id: int | None = None
    folio_id: int
    recipient_email: str | None = None


class PmsCashMasterTotalsRead(BaseModel):
    currency: str = "EUR"
    invoice_count: int = 0
    total_invoiced: float = 0
    total_paid: float = 0
    total_outstanding: float = 0


class PmsCashMasterRead(BaseModel):
    items: list[PmsCashMasterRowRead] = Field(default_factory=list)
    totals: PmsCashMasterTotalsRead = Field(default_factory=PmsCashMasterTotalsRead)
    page: int = 1
    page_size: int = 50
    total_count: int = 0


class PmsInvoiceReservationRead(BaseModel):
    reservation_id: int
    booking_id: str
    guest_name: str
    guest_email: str | None = None
    guest_phone: str | None = None
    room: str | None = None
    room_type_label: str | None = None
    check_in: date
    check_out: date
    payment_status: str
    invoice_status: str


class PmsInvoiceAllowedActionsRead(BaseModel):
    can_edit: bool
    can_add_payment: bool
    can_finalize: bool
    can_generate_invoice: bool
    can_generate_receipt: bool
    can_generate_debit_note: bool
    can_generate_storno: bool


class PmsInvoiceDetailRead(BaseModel):
    invoice: PmsInvoiceRead
    folio: PmsFolioRead
    reservation: PmsInvoiceReservationRead
    document: HotelDocumentRead | None = None
    preview_data: dict[str, object] = Field(default_factory=dict)
    status_label: str
    payment_status: str
    paid_amount: float = 0
    balance_due: float = 0
    payment_method: str | None = None
    allowed_actions: PmsInvoiceAllowedActionsRead
    audit_timeline: list[AuditTimelineEvent] = Field(default_factory=list)
