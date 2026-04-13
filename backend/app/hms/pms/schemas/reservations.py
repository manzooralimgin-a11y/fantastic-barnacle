from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class PmsCockpitItemRead(BaseModel):
    reservation_id: int
    booking_id: str
    guest_name: str
    status: str
    room: str | None = None
    room_type_label: str | None = None
    check_in: date
    check_out: date
    adults: int = 0
    children: int = 0
    total_amount: float = 0
    payment_status: str | None = None
    folio_status: str | None = None
    stay_status: str | None = None


class PmsCockpitRead(BaseModel):
    property_id: int
    focus_date: date
    arrivals: list[PmsCockpitItemRead] = Field(default_factory=list)
    in_house: list[PmsCockpitItemRead] = Field(default_factory=list)
    departures: list[PmsCockpitItemRead] = Field(default_factory=list)
    reservations: list[PmsCockpitItemRead] = Field(default_factory=list)
    live_log: list[PmsCockpitItemRead] = Field(default_factory=list)


class PmsReservationSummaryRead(BaseModel):
    reservation_id: int
    property_id: int
    booking_id: str
    guest_name: str
    guest_email: str | None = None
    guest_phone: str | None = None
    guest_id: int | None = None
    anrede: str | None = None
    status: str
    room: str | None = None
    room_type_label: str | None = None
    check_in: date
    check_out: date
    adults: int = 0
    children: int = 0
    total_amount: float = 0
    currency: str = "EUR"
    payment_status: str | None = None
    invoice_state: str | None = None
    folio_id: int | None = None
    folio_number: str | None = None
    folio_balance_due: float | None = None
    stay_id: int | None = None
    stay_status: str | None = None
    booking_source: str | None = None
    color_tag: str | None = None
    special_requests: str | None = None
    zahlungs_methode: str | None = None
    zahlungs_status: str | None = None
    quick_actions: list[str] = Field(default_factory=list)


class PmsReservationWorkspaceQuery(BaseModel):
    property_id: int | None = Field(default=None, gt=0)


class PmsReservationWorkspaceReservationRead(BaseModel):
    model_config = ConfigDict(extra="allow")


class PmsReservationWorkspaceStayRead(BaseModel):
    model_config = ConfigDict(extra="allow")


class PmsReservationWorkspaceGuestRead(BaseModel):
    model_config = ConfigDict(extra="allow")


class PmsReservationWorkspaceFolioSummaryRead(BaseModel):
    model_config = ConfigDict(extra="allow")


class PmsReservationWorkspaceTaskRead(BaseModel):
    model_config = ConfigDict(extra="allow")


class PmsReservationWorkspaceDocumentRead(BaseModel):
    model_config = ConfigDict(extra="allow")


class PmsReservationWorkspaceRead(BaseModel):
    reservation: PmsReservationWorkspaceReservationRead = Field(default_factory=PmsReservationWorkspaceReservationRead)
    stay: PmsReservationWorkspaceStayRead = Field(default_factory=PmsReservationWorkspaceStayRead)
    guests: list[PmsReservationWorkspaceGuestRead] = Field(default_factory=list)
    folio_summary: PmsReservationWorkspaceFolioSummaryRead = Field(default_factory=PmsReservationWorkspaceFolioSummaryRead)
    tasks: list[PmsReservationWorkspaceTaskRead] = Field(default_factory=list)
    documents: list[PmsReservationWorkspaceDocumentRead] = Field(default_factory=list)
