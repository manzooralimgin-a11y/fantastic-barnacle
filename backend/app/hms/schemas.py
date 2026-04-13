from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class HotelPropertyAccessRead(BaseModel):
    property_id: int
    property_name: str
    role_codes: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class HotelSessionContextRead(BaseModel):
    active_property_id: int | None = None
    active_property_name: str | None = None
    hotel_roles: list[str] = Field(default_factory=list)
    hotel_permissions: list[str] = Field(default_factory=list)
    hotel_properties: list[HotelPropertyAccessRead] = Field(default_factory=list)


class HotelCrmGuestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    salutation: str | None = None
    birthday: date | None = None
    country_code: str | None = None
    country_name: str | None = None
    custom_fields_json: dict | None = None
    reservation_count: int = 0
    last_stay_date: date | None = None
    created_at: datetime
    updated_at: datetime


class HotelCrmGuestUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    salutation: str | None = Field(default=None, max_length=20)
    birthday: date | None = None
    country_code: str | None = Field(default=None, max_length=10)
    country_name: str | None = Field(default=None, max_length=100)
    custom_fields_json: dict | None = None


class HotelReportSummaryRead(BaseModel):
    property_id: int
    currency: str
    start_date: date
    end_date: date
    days: int = Field(ge=1)
    room_count: int = Field(ge=0)
    occupied_room_nights: int = Field(ge=0)
    available_room_nights: int = Field(ge=0)
    occupancy_pct: float = Field(ge=0)
    arrivals: int = Field(ge=0)
    departures: int = Field(ge=0)
    turnover_total: float = Field(ge=0)


class HotelReportDailyPointRead(BaseModel):
    report_date: date
    occupied_rooms: int = Field(ge=0)
    occupancy_pct: float = Field(ge=0)
    arrivals: int = Field(ge=0)
    departures: int = Field(ge=0)
    turnover: float = Field(ge=0)


class HotelReportDailyRead(BaseModel):
    property_id: int
    currency: str
    start_date: date
    end_date: date
    days: int = Field(ge=1)
    room_count: int = Field(ge=0)
    items: list[HotelReportDailyPointRead] = Field(default_factory=list)


class HotelPropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    address: str
    city: str
    country: str
    timezone: str
    currency: str
    settings_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class DocumentBlueprintRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    document_kind: str
    name: str
    description: str | None = None
    default_title_template: str
    default_subject_template: str | None = None
    default_body_template: str
    metadata_json: dict | None = None
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DocumentTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int | None = None
    blueprint_id: int
    code: str
    name: str
    language: str
    subject_template: str | None = None
    title_template: str
    body_template: str
    metadata_json: dict | None = None
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class HotelDocumentGenerateRequest(BaseModel):
    reservation_id: int
    document_kind: str = Field(min_length=2, max_length=50)
    template_id: int | None = None
    template_code: str | None = Field(default=None, max_length=100)


class HotelDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_id: int | None = None
    stay_id: int | None = None
    folio_id: int | None = None
    blueprint_id: int | None = None
    template_id: int | None = None
    document_kind: str
    document_number: str
    status: str
    subject: str | None = None
    title: str
    body_text: str
    payload_json: dict | None = None
    metadata_json: dict | None = None
    issued_at: datetime | None = None
    created_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime


class HotelInvoiceLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    folio_line_id: int | None = None
    line_number: int
    charge_type: str
    description: str
    quantity: float
    unit_price: float
    net_amount: float
    tax_rate: float
    tax_amount: float
    gross_amount: float
    service_date: date | None = None
    created_at: datetime
    updated_at: datetime


class HotelInvoiceDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: int
    document_id: int | None = None
    channel: str
    status: str
    recipient_email: str | None = None
    subject: str | None = None
    message: str | None = None
    sent_at: datetime | None = None
    error_message: str | None = None
    metadata_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class HotelInvoiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_id: int
    stay_id: int | None = None
    folio_id: int
    document_id: int | None = None
    invoice_number: str
    status: str
    currency: str
    recipient_name: str | None = None
    recipient_email: str | None = None
    issued_at: datetime | None = None
    sent_at: datetime | None = None
    metadata_json: dict | None = None
    created_at: datetime
    updated_at: datetime
    lines: list[HotelInvoiceLineRead] = Field(default_factory=list)
    deliveries: list[HotelInvoiceDeliveryRead] = Field(default_factory=list)


class HotelInvoiceSendRequest(BaseModel):
    channel: str = Field(default="email", min_length=3, max_length=20)
    recipient_email: str | None = Field(default=None, max_length=255)
    subject: str | None = Field(default=None, max_length=255)
    message: str | None = Field(default=None, max_length=5000)


class HotelInvoicePreviewRead(BaseModel):
    invoice: HotelInvoiceRead
    document: HotelDocumentRead | None = None
    preview_data: dict[str, object] = Field(default_factory=dict)


class HotelMessageTemplateCreate(BaseModel):
    code: str = Field(min_length=2, max_length=100)
    name: str = Field(min_length=2, max_length=255)
    channel: str = Field(default="email", min_length=3, max_length=20)
    category: str = Field(default="guest_message", min_length=3, max_length=50)
    subject_template: str | None = Field(default=None, max_length=255)
    body_template: str = Field(min_length=2, max_length=5000)
    is_default: bool = False
    is_active: bool = True
    metadata_json: dict | None = None


class HotelMessageTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    channel: str | None = Field(default=None, min_length=3, max_length=20)
    category: str | None = Field(default=None, min_length=3, max_length=50)
    subject_template: str | None = Field(default=None, max_length=255)
    body_template: str | None = Field(default=None, min_length=2, max_length=5000)
    is_default: bool | None = None
    is_active: bool | None = None
    metadata_json: dict | None = None


class HotelMessageTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int | None = None
    code: str
    name: str
    channel: str
    category: str
    subject_template: str | None = None
    body_template: str
    metadata_json: dict | None = None
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


class HotelMessageEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    thread_id: int
    template_id: int | None = None
    template_name: str | None = None
    direction: str
    channel: str
    subject: str | None = None
    body_text: str
    sender_email: str | None = None
    recipient_email: str | None = None
    status: str
    sent_at: datetime | None = None
    error_message: str | None = None
    metadata_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class HotelMessageThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_id: int | None = None
    guest_id: int | None = None
    channel: str
    status: str
    subject: str | None = None
    guest_name: str | None = None
    guest_email: str | None = None
    last_message_at: datetime | None = None
    last_direction: str | None = None
    created_at: datetime
    updated_at: datetime
    events: list[HotelMessageEventRead] = Field(default_factory=list)


class HotelMessageSendRequest(BaseModel):
    thread_id: int | None = None
    template_id: int | None = None
    template_code: str | None = Field(default=None, max_length=100)
    recipient_email: str | None = Field(default=None, max_length=255)
    subject: str | None = Field(default=None, max_length=255)
    body_text: str | None = Field(default=None, max_length=5000)
    metadata_json: dict | None = None


class HotelRateSeasonCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    start_date: date
    end_date: date
    color_hex: str | None = Field(default=None, max_length=20)
    is_active: bool = True


class HotelRateSeasonRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    name: str
    start_date: date
    end_date: date
    color_hex: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class HotelRatePlanCreate(BaseModel):
    room_type_id: int
    code: str = Field(min_length=2, max_length=80)
    name: str = Field(min_length=2, max_length=255)
    currency: str = Field(default="EUR", min_length=3, max_length=10)
    base_price: float | None = Field(default=None, ge=0)
    is_active: bool = True


class HotelRatePlanRead(BaseModel):
    id: int
    property_id: int
    room_type_id: int
    room_type_name: str | None = None
    code: str
    name: str
    currency: str
    base_price: float
    is_active: bool
    created_at: datetime
    updated_at: datetime


class HotelRateMatrixEntryWrite(BaseModel):
    rate_date: date
    price: float = Field(ge=0)
    closed: bool = False
    closed_to_arrival: bool = False
    closed_to_departure: bool = False
    min_stay: int | None = Field(default=None, ge=1)
    max_stay: int | None = Field(default=None, ge=1)
    notes: str | None = Field(default=None, max_length=500)


class HotelRateMatrixUpdate(BaseModel):
    items: list[HotelRateMatrixEntryWrite] = Field(default_factory=list)


class HotelRateMatrixEntryRead(BaseModel):
    rate_date: date
    price: float
    season_id: int | None = None
    season_name: str | None = None
    closed: bool = False
    closed_to_arrival: bool = False
    closed_to_departure: bool = False
    min_stay: int | None = None
    max_stay: int | None = None
    notes: str | None = None


class HotelRateMatrixRead(BaseModel):
    property_id: int
    plan: HotelRatePlanRead
    start_date: date
    days: int = Field(ge=1)
    items: list[HotelRateMatrixEntryRead] = Field(default_factory=list)


class HotelStayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    reservation_id: int
    room_id: int | None = None
    status: str
    planned_check_in: date
    planned_check_out: date
    actual_check_in_at: datetime | None = None
    actual_check_out_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class StayMoveRequest(BaseModel):
    room_id: int
    notes: str | None = Field(default=None, max_length=500)


class StayResizeRequest(BaseModel):
    check_in: date
    check_out: date
    notes: str | None = Field(default=None, max_length=500)


class HotelStayOperationRead(BaseModel):
    stay: HotelStayRead
    reservation_id: int
    room_id: int | None = None
    room_number: str | None = None
    room_type_name: str | None = None


class HotelFolioLineCreate(BaseModel):
    charge_type: str = "service"
    description: str = Field(min_length=2, max_length=255)
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(gt=0)
    service_date: date | None = None
    metadata_json: dict | None = None


class HotelFolioLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folio_id: int
    charge_type: str
    description: str
    quantity: float
    unit_price: float
    total_price: float
    service_date: date | None = None
    status: str
    metadata_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class HotelFolioPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    method: str = Field(min_length=2, max_length=30)
    reference: str | None = Field(default=None, max_length=255)
    processing_fee: float = 0
    gateway_reference: str | None = Field(default=None, max_length=255)
    card_last_four: str | None = Field(default=None, min_length=4, max_length=4)
    card_brand: str | None = Field(default=None, max_length=30)
    wallet_type: str | None = Field(default=None, max_length=30)


class HotelFolioPaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folio_id: int
    amount: float
    method: str
    reference: str | None = None
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


class HotelFolioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    stay_id: int
    reservation_id: int
    folio_number: str
    currency: str
    status: str
    subtotal: float
    tax_amount: float
    discount_amount: float
    total: float
    balance_due: float
    paid_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    stay: HotelStayRead
    lines: list[HotelFolioLineRead] = Field(default_factory=list)
    payments: list[HotelFolioPaymentRead] = Field(default_factory=list)


class HotelRoomBoardBlockRead(BaseModel):
    kind: str = "stay"
    reservation_id: int | None = None
    stay_id: int | None = None
    booking_id: str | None = None
    guest_name: str | None = None
    status: str
    room_id: int | None = None
    room_number: str | None = None
    room_type_name: str | None = None
    check_in: date
    check_out: date
    board_start_date: date
    board_end_date_exclusive: date
    start_offset: int = Field(ge=0)
    span_days: int = Field(ge=1)
    adults: int = Field(default=0, ge=0)
    children: int = Field(default=0, ge=0)
    payment_status: str | None = None
    zahlungs_status: str | None = None
    booking_source: str | None = None
    color_tag: str | None = None
    starts_before_window: bool = False
    ends_after_window: bool = False
    blocking_id: int | None = None
    reason: str | None = None


class HotelRoomBoardRowRead(BaseModel):
    room_id: int | None = None
    room_number: str
    room_type_name: str | None = None
    status: str | None = None
    floor: int | None = None
    is_virtual: bool = False
    blocks: list[HotelRoomBoardBlockRead] = Field(default_factory=list)
    blockings: list[HotelRoomBoardBlockRead] = Field(default_factory=list)


class HotelRoomBoardRead(BaseModel):
    property_id: int
    start_date: date
    end_date: date
    end_date_exclusive: date
    days: int = Field(ge=1)
    dates: list[date] = Field(default_factory=list)
    rooms: list[HotelRoomBoardRowRead] = Field(default_factory=list)
    unassigned_blocks: list[HotelRoomBoardBlockRead] = Field(default_factory=list)


class HousekeepingRoomStatusUpdate(BaseModel):
    status: str = Field(min_length=2, max_length=30)
    reason: str | None = Field(default=None, max_length=255)
    task_id: int | None = None


class HousekeepingTaskCreate(BaseModel):
    room_id: int
    task_type: str = Field(min_length=2, max_length=30)
    title: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=1000)
    priority: str = Field(default="normal", min_length=2, max_length=20)
    assigned_user_id: int | None = None
    assigned_to_name: str | None = Field(default=None, max_length=255)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    task_source: str = Field(default="staff", max_length=30)
    guest_booking_ref: str | None = Field(default=None, max_length=50)


class HousekeepingTaskUpdate(BaseModel):
    status: str | None = Field(default=None, min_length=2, max_length=20)
    priority: str | None = Field(default=None, min_length=2, max_length=20)
    assigned_user_id: int | None = None
    assigned_to_name: str | None = Field(default=None, max_length=255)
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)


class HousekeepingRoomNoteUpdate(BaseModel):
    note_date: date
    housekeeping_note: str | None = Field(default=None, max_length=2000)
    maintenance_note: str | None = Field(default=None, max_length=2000)
    maintenance_required: bool = False


class HousekeepingTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    room_id: int
    room_number: str
    room_type_name: str | None = None
    task_type: str
    title: str
    description: str | None = None
    priority: str
    status: str
    assigned_user_id: int | None = None
    assigned_to_name: str | None = None
    due_date: date | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    notes: str | None = None
    task_source: str = "staff"
    guest_booking_ref: str | None = None
    created_at: datetime
    updated_at: datetime


class HousekeepingRoomNoteRead(BaseModel):
    id: int | None = None
    property_id: int
    room_id: int
    room_number: str
    room_type_name: str | None = None
    note_date: date
    housekeeping_note: str | None = None
    maintenance_note: str | None = None
    maintenance_required: bool = False
    created_by_user_id: int | None = None
    updated_by_user_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class HousekeepingRoomRead(BaseModel):
    room_id: int
    room_number: str
    room_type_name: str | None = None
    operational_status: str
    housekeeping_status: str
    floor: int | None = None
    last_status_changed_at: datetime | None = None
    open_task_count: int = 0


class HousekeepingOverviewRead(BaseModel):
    property_id: int
    rooms: list[HousekeepingRoomRead] = Field(default_factory=list)
    tasks: list[HousekeepingTaskRead] = Field(default_factory=list)


class RoomBlockingCreate(BaseModel):
    room_id: int
    start_date: date
    end_date: date
    reason: str = Field(min_length=2, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)


class RoomBlockingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    property_id: int
    room_id: int
    room_number: str
    room_type_name: str | None = None
    start_date: date
    end_date: date
    status: str
    reason: str
    notes: str | None = None
    blocked_by_user_id: int | None = None
    released_by_user_id: int | None = None
    released_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
