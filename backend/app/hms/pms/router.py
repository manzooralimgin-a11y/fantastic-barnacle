from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import HotelAccessContext, require_hotel_permissions
from app.hms.document_service import list_document_blueprints
from app.hms.models import HotelProperty
from app.hms.pms.schemas import (
    AvailabilityRead,
    AvailabilityRequest,
    HotelExtraCreate,
    HotelExtraRead,
    HotelExtraUpdate,
    PmsBoardRead,
    PmsCashMasterRead,
    PmsCockpitRead,
    PmsContactRead,
    PmsFolioRead,
    PmsInvoiceDetailRead,
    PmsInvoiceDocumentActionRequest,
    PmsInvoiceLineItemCreate,
    PmsInvoicePaymentCreate,
    PmsInvoicePreviewRead,
    PmsInvoiceRead,
    PmsInvoiceSendRequest,
    PmsMessageSendRequest,
    PmsMessageTemplateCreate,
    PmsMessageTemplateRead,
    PmsMessageTemplateUpdate,
    PmsMessageThreadRead,
    PmsRateMatrixRead,
    PmsRateMatrixUpdate,
    PmsRatePlanCreate,
    PmsRatePlanRead,
    PmsRateSeasonCreate,
    PmsRateSeasonRead,
    PmsReservationChargeCreate,
    PmsReportDailyRead,
    PmsReportDownloadQuery,
    PmsReportSummaryRead,
    PmsReportType,
    PmsReservationSummaryRead,
    PmsReservationWorkspaceQuery,
    PmsReservationWorkspaceRead,
    PricingQuoteRead,
    PricingQuoteRequest,
    StayOccupantRead,
    StayOccupantUpsert,
    PmsTaskRead,
)
from app.hms.pms.services.billing_service import (
    add_reservation_charge,
    get_pms_folio,
    list_pms_folios,
    list_reservation_folios,
)
from app.hms.pms.services.board_service import get_board_read_model
from app.hms.pms.services.contacts_service import get_pms_contact, list_pms_contacts, patch_pms_contact
from app.hms.pms.services.comms_service import (
    create_pms_message_template,
    list_pms_message_templates,
    list_pms_message_threads,
    send_pms_reservation_message,
    update_pms_message_template,
)
from app.hms.pms.services.documents_service import (
    create_pms_document,
    get_pms_document,
    list_pms_documents,
    list_pms_templates,
)
from app.hms.pms.services.invoice_service import (
    add_pms_invoice_line_item,
    ensure_pms_invoice,
    finalize_pms_invoice,
    generate_pms_invoice_document,
    get_pms_invoice,
    get_pms_invoice_detail,
    get_pms_invoice_preview,
    list_pms_invoices,
    post_pms_invoice_payment,
    search_pms_cash_master,
    send_pms_invoice,
    void_pms_invoice_line_item,
)
from app.hms.pms.services.reports_service import (
    build_pms_report_download,
    get_pms_reporting_daily,
    get_pms_reporting_summary,
)
from app.hms.pms.services.revenue_service import (
    create_pms_rate_plan,
    create_pms_rate_season,
    get_pms_rate_matrix,
    list_pms_rate_plans,
    list_pms_rate_seasons,
    update_pms_rate_matrix,
)
from app.hms.pms.services.reservations_service import (
    get_cockpit_read_model,
    get_reservation_summary,
    get_reservation_workspace,
)
from app.hms.pms.services.inventory_service import (
    check_availability,
    create_hotel_extra,
    list_hotel_extras,
    list_stay_occupants,
    update_hotel_extra,
    upsert_stay_occupants,
)
from app.hms.pms.services.pricing_service import get_pricing_quote
from app.hms.pms.services.tasks_service import get_pms_task_overview, list_pms_tasks
from app.hms.rbac import (
    HOTEL_PERMISSION_COMMS,
    HOTEL_PERMISSION_CRM,
    HOTEL_PERMISSION_DOCUMENTS,
    HOTEL_PERMISSION_FOLIO,
    HOTEL_PERMISSION_FRONT_DESK,
    HOTEL_PERMISSION_HOUSEKEEPING,
    HOTEL_PERMISSION_RATE_MANAGEMENT,
    HOTEL_PERMISSION_REPORTS,
    HOTEL_PERMISSION_RESERVATIONS,
)
from app.hms.schemas import (
    DocumentBlueprintRead,
    DocumentTemplateRead,
    HotelCrmGuestUpdate,
    HotelDocumentGenerateRequest,
    HotelDocumentRead,
    HousekeepingOverviewRead,
)

router = APIRouter()


async def _resolve_property_id(
    db: AsyncSession,
    *,
    hotel_access: HotelAccessContext,
    property_id: int | None,
) -> int:
    resolved_property_id = hotel_access.resolve_property_id(property_id)
    if property_id is not None and resolved_property_id is None:
      raise HTTPException(status_code=403, detail="User does not have access to the requested hotel property")
    if resolved_property_id is None:
      resolved_property_id = hotel_access.active_property_id
    if resolved_property_id is None:
      raise HTTPException(status_code=403, detail="No hotel property access configured for user")
    property_record = await db.get(HotelProperty, resolved_property_id)
    if property_record is None:
      raise HTTPException(status_code=404, detail="Hotel property not found")
    return property_record.id


@router.get("/cockpit", response_model=PmsCockpitRead)
async def get_pms_cockpit(
    focus_date: date | None = Query(default=None),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_cockpit_read_model(
        db,
        property_id=resolved_property_id,
        focus_date=focus_date or date.today(),
    )


@router.get("/board", response_model=PmsBoardRead)
async def get_pms_board(
    start_date: date | None = Query(default=None),
    days: int = Query(default=14, ge=1, le=90),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_board_read_model(
        db,
        property_id=resolved_property_id,
        start_date=start_date or date.today(),
        days=days,
    )


@router.get("/reservations/{reservation_id}/summary", response_model=PmsReservationSummaryRead)
async def get_pms_reservation_summary(
    reservation_id: int,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_reservation_summary(
        db,
        property_id=resolved_property_id,
        reservation_id=reservation_id,
    )


@router.get("/reservations/{reservation_id}/workspace", response_model=PmsReservationWorkspaceRead)
async def get_pms_reservation_workspace(
    reservation_id: int,
    params: Annotated[PmsReservationWorkspaceQuery, Depends()],
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    resolved_property_id = await _resolve_property_id(
        db,
        hotel_access=hotel_access,
        property_id=params.property_id,
    )
    return await get_reservation_workspace(
        db,
        property_id=resolved_property_id,
        reservation_id=reservation_id,
        hotel_access=hotel_access,
    )


@router.get("/contacts", response_model=list[PmsContactRead])
async def list_pms_contact_records(
    property_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_CRM)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await list_pms_contacts(db, property_id=resolved_property_id, search=search, limit=limit)


@router.get("/contacts/{guest_id}", response_model=PmsContactRead)
async def get_pms_contact_record(
    guest_id: int,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_CRM)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_pms_contact(db, property_id=resolved_property_id, guest_id=guest_id)


@router.patch("/contacts/{guest_id}", response_model=PmsContactRead)
async def patch_pms_contact_record(
    guest_id: int,
    payload: HotelCrmGuestUpdate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_CRM)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await patch_pms_contact(db, property_id=resolved_property_id, guest_id=guest_id, payload=payload)


@router.get("/billing/folios", response_model=list[PmsFolioRead])
async def list_pms_billing_folios(
    property_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await list_pms_folios(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        status=status,
        limit=limit,
    )


@router.get("/billing/reservations/{reservation_id}/folios", response_model=list[PmsFolioRead])
async def list_pms_reservation_folios(
    reservation_id: int,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await list_reservation_folios(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        reservation_id=reservation_id,
    )


@router.post("/reservations/{reservation_id}/charges", response_model=PmsFolioRead, status_code=201)
async def create_pms_reservation_charge(
    reservation_id: int,
    payload: PmsReservationChargeCreate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await add_reservation_charge(
        db,
        reservation_id=reservation_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.get("/billing/reservations/{reservation_id}/invoices", response_model=list[PmsInvoiceRead])
async def list_pms_reservation_invoices(
    reservation_id: int,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await list_pms_invoices(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        reservation_id=reservation_id,
        limit=100,
    )


@router.get("/billing/cash-master", response_model=PmsCashMasterRead)
async def get_pms_cash_master(
    property_id: int | None = Query(default=None, gt=0),
    search: str | None = Query(default=None),
    invoice_status: str | None = Query(default=None),
    payment_status: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    room: str | None = Query(default=None),
    guest_company: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    sort_by: str = Query(default="invoice_date"),
    sort_dir: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await search_pms_cash_master(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        search=search,
        invoice_status=invoice_status,
        payment_status=payment_status,
        payment_method=payment_method,
        room=room,
        guest_company=guest_company,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )


@router.post("/billing/reservations/{reservation_id}/invoices/ensure", response_model=PmsInvoiceRead, status_code=201)
async def ensure_pms_reservation_invoice(
    reservation_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await ensure_pms_invoice(
        db,
        reservation_id=reservation_id,
        hotel_access=hotel_access,
    )


@router.get("/billing/invoices/{invoice_id}", response_model=PmsInvoiceRead)
async def get_pms_billing_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await get_pms_invoice(db, invoice_id=invoice_id, hotel_access=hotel_access)


@router.get("/billing/invoices/{invoice_id}/detail", response_model=PmsInvoiceDetailRead)
async def get_pms_billing_invoice_detail(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await get_pms_invoice_detail(db, invoice_id=invoice_id, hotel_access=hotel_access)


@router.get("/billing/invoices/{invoice_id}/preview", response_model=PmsInvoicePreviewRead)
async def get_pms_billing_invoice_preview(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await get_pms_invoice_preview(db, invoice_id=invoice_id, hotel_access=hotel_access)


@router.post("/billing/invoices/{invoice_id}/send", response_model=PmsInvoiceRead)
async def send_pms_billing_invoice(
    invoice_id: int,
    payload: PmsInvoiceSendRequest,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await send_pms_invoice(
        db,
        invoice_id=invoice_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.post("/billing/invoices/{invoice_id}/finalize", response_model=PmsInvoiceDetailRead)
async def finalize_pms_billing_invoice(
    invoice_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await finalize_pms_invoice(
        db,
        invoice_id=invoice_id,
        hotel_access=hotel_access,
    )


@router.post("/billing/invoices/{invoice_id}/payments", response_model=PmsInvoiceDetailRead)
async def create_pms_invoice_payment(
    invoice_id: int,
    payload: PmsInvoicePaymentCreate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await post_pms_invoice_payment(
        db,
        invoice_id=invoice_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.post("/billing/invoices/{invoice_id}/line-items", response_model=PmsInvoiceDetailRead, status_code=201)
async def create_pms_invoice_line_item(
    invoice_id: int,
    payload: PmsInvoiceLineItemCreate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await add_pms_invoice_line_item(
        db,
        invoice_id=invoice_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.post("/billing/invoices/{invoice_id}/line-items/{line_id}/void", response_model=PmsInvoiceDetailRead)
async def void_pms_invoice_line_item_route(
    invoice_id: int,
    line_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await void_pms_invoice_line_item(
        db,
        invoice_id=invoice_id,
        line_id=line_id,
        hotel_access=hotel_access,
    )


@router.post("/billing/invoices/{invoice_id}/documents", response_model=HotelDocumentRead, status_code=201)
async def create_pms_invoice_document_route(
    invoice_id: int,
    payload: PmsInvoiceDocumentActionRequest,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await generate_pms_invoice_document(
        db,
        invoice_id=invoice_id,
        document_kind=payload.document_kind,
        hotel_access=hotel_access,
    )


@router.get("/billing/folios/{folio_id}", response_model=PmsFolioRead)
async def get_pms_billing_folio(
    folio_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FOLIO)),
):
    return await get_pms_folio(db, folio_id=folio_id, hotel_access=hotel_access)


@router.get("/tasks", response_model=list[PmsTaskRead])
async def list_pms_task_records(
    property_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await list_pms_tasks(db, property_id=resolved_property_id, status=status)


@router.get("/tasks/overview", response_model=HousekeepingOverviewRead)
async def get_pms_tasks_overview(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_HOUSEKEEPING)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_pms_task_overview(db, property_id=resolved_property_id)


@router.get("/comms/templates", response_model=list[PmsMessageTemplateRead])
async def list_pms_comms_templates(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_COMMS)),
):
    return await list_pms_message_templates(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.post("/comms/templates", response_model=PmsMessageTemplateRead, status_code=201)
async def create_pms_comms_template(
    payload: PmsMessageTemplateCreate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_COMMS)),
):
    return await create_pms_message_template(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.put("/comms/templates/{template_id}", response_model=PmsMessageTemplateRead)
async def update_pms_comms_template(
    template_id: int,
    payload: PmsMessageTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_COMMS)),
):
    return await update_pms_message_template(
        db,
        template_id=template_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.get("/comms/threads", response_model=list[PmsMessageThreadRead])
async def list_pms_comms_threads(
    property_id: int | None = Query(default=None, gt=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_COMMS)),
):
    return await list_pms_message_threads(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        limit=limit,
    )


@router.get("/comms/reservations/{reservation_id}/threads", response_model=list[PmsMessageThreadRead])
async def list_pms_reservation_threads(
    reservation_id: int,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_COMMS)),
):
    return await list_pms_message_threads(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        reservation_id=reservation_id,
        limit=100,
    )


@router.post("/comms/reservations/{reservation_id}/messages", response_model=PmsMessageThreadRead, status_code=201)
async def send_pms_reservation_comms_message(
    reservation_id: int,
    payload: PmsMessageSendRequest,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_COMMS)),
):
    return await send_pms_reservation_message(
        db,
        reservation_id=reservation_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.get("/reports/summary", response_model=PmsReportSummaryRead)
async def get_pms_reports_summary(
    start_date: date | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_REPORTS)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_pms_reporting_summary(
        db,
        property_id=resolved_property_id,
        start_date=start_date,
        days=days,
    )


@router.get("/reports/daily", response_model=PmsReportDailyRead)
async def get_pms_reports_daily(
    start_date: date | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_REPORTS)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=property_id)
    return await get_pms_reporting_daily(
        db,
        property_id=resolved_property_id,
        start_date=start_date,
        days=days,
    )


@router.get("/reports/download")
async def download_pms_report(
    params: Annotated[PmsReportDownloadQuery, Depends()],
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_REPORTS)),
):
    resolved_property_id = await _resolve_property_id(db, hotel_access=hotel_access, property_id=params.property_id)
    payload = await build_pms_report_download(
        db,
        property_id=resolved_property_id,
        report_type=PmsReportType(params.type),
        start_date=params.start,
        end_date=params.end,
        hotel_access=hotel_access,
    )
    headers = {
        "Content-Disposition": f'attachment; filename="{payload.filename}"',
        "Cache-Control": "no-store",
    }
    return StreamingResponse(iter([payload.content]), media_type=payload.media_type, headers=headers)


@router.get("/revenue/seasons", response_model=list[PmsRateSeasonRead])
async def list_pms_revenue_seasons(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    return await list_pms_rate_seasons(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.post("/revenue/seasons", response_model=PmsRateSeasonRead, status_code=201)
async def create_pms_revenue_season(
    payload: PmsRateSeasonCreate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    return await create_pms_rate_season(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.get("/revenue/plans", response_model=list[PmsRatePlanRead])
async def list_pms_revenue_plans(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    return await list_pms_rate_plans(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.post("/revenue/plans", response_model=PmsRatePlanRead, status_code=201)
async def create_pms_revenue_plan(
    payload: PmsRatePlanCreate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    return await create_pms_rate_plan(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


@router.get("/revenue/plans/{plan_id}/matrix", response_model=PmsRateMatrixRead)
async def get_pms_revenue_matrix(
    plan_id: int,
    start_date: date | None = Query(default=None),
    days: int = Query(default=14, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    return await get_pms_rate_matrix(
        db,
        plan_id=plan_id,
        hotel_access=hotel_access,
        start_date=start_date,
        days=days,
    )


@router.put("/revenue/plans/{plan_id}/matrix", response_model=PmsRateMatrixRead)
async def update_pms_revenue_matrix(
    plan_id: int,
    payload: PmsRateMatrixUpdate,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    return await update_pms_rate_matrix(
        db,
        plan_id=plan_id,
        payload=payload,
        hotel_access=hotel_access,
    )


@router.get("/documents", response_model=list[HotelDocumentRead])
async def list_pms_document_records(
    property_id: int | None = Query(default=None, gt=0),
    document_kind: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await list_pms_documents(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        document_kind=document_kind,
        limit=limit,
    )


@router.get("/documents/templates", response_model=list[DocumentTemplateRead])
async def list_pms_document_templates(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await list_pms_templates(db, hotel_access=hotel_access, property_id=property_id)


@router.get("/documents/blueprints", response_model=list[DocumentBlueprintRead])
async def list_pms_document_blueprints(
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    del hotel_access
    return await list_document_blueprints(db)


@router.get("/documents/{document_id}", response_model=HotelDocumentRead)
async def get_pms_document_record(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await get_pms_document(db, document_id=document_id, hotel_access=hotel_access)


@router.post("/documents/generate", response_model=HotelDocumentRead, status_code=201)
async def create_pms_document_record(
    payload: HotelDocumentGenerateRequest,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_DOCUMENTS)),
):
    return await create_pms_document(
        db,
        payload=payload,
        hotel_access=hotel_access,
        property_id=property_id,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EPIC 3 — Ticket 3.1: Inventory availability
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/inventory/availability", response_model=AvailabilityRead)
async def post_inventory_availability(
    payload: AvailabilityRequest,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    """
    Return rooms available for a given date window and minimum pax count.
    A room is excluded if it has an active stay or blocking that overlaps the window.
    """
    resolved_property_id = await _resolve_property_id(
        db, hotel_access=hotel_access, property_id=payload.property_id
    )
    return await check_availability(
        db,
        payload=AvailabilityRequest(
            check_in=payload.check_in,
            check_out=payload.check_out,
            pax=payload.pax,
            property_id=resolved_property_id,
        ),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EPIC 4 — Ticket 4.1: Pricing quote
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/pricing/quote", response_model=PricingQuoteRead)
async def post_pricing_quote(
    payload: PricingQuoteRequest,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    """
    Return all active rate plans for a room type with pre-calculated nightly
    averages and stay totals for the requested date window.
    """
    resolved_property_id = await _resolve_property_id(
        db, hotel_access=hotel_access, property_id=payload.property_id
    )
    return await get_pricing_quote(
        db,
        payload=PricingQuoteRequest(
            check_in=payload.check_in,
            check_out=payload.check_out,
            room_type_id=payload.room_type_id,
            property_id=resolved_property_id,
        ),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# EPIC 4 — Ticket 4.2: Hotel Extras (Produkte)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/inventory/extras", response_model=list[HotelExtraRead])
async def list_pms_extras(
    property_id: int | None = Query(default=None, gt=0),
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_FRONT_DESK)),
):
    """List all add-on extras (City Tax, Breakfast, Parking, …) for a property."""
    resolved_property_id = await _resolve_property_id(
        db, hotel_access=hotel_access, property_id=property_id
    )
    return await list_hotel_extras(
        db,
        property_id=resolved_property_id,
        include_inactive=include_inactive,
    )


@router.post("/inventory/extras", response_model=HotelExtraRead, status_code=201)
async def create_pms_extra(
    payload: HotelExtraCreate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    """Create a new add-on extra product."""
    resolved_property_id = await _resolve_property_id(
        db, hotel_access=hotel_access, property_id=property_id
    )
    extra = await create_hotel_extra(
        db, property_id=resolved_property_id, payload=payload
    )
    await db.commit()
    return extra


@router.patch("/inventory/extras/{extra_id}", response_model=HotelExtraRead)
async def update_pms_extra(
    extra_id: int,
    payload: HotelExtraUpdate,
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RATE_MANAGEMENT)),
):
    """Update name, price, flags, or active status of an extra."""
    resolved_property_id = await _resolve_property_id(
        db, hotel_access=hotel_access, property_id=property_id
    )
    extra = await update_hotel_extra(
        db,
        extra_id=extra_id,
        property_id=resolved_property_id,
        payload=payload,
    )
    await db.commit()
    return extra


# ═══════════════════════════════════════════════════════════════════════════════
# EPIC 3 — Ticket 3.2: Stay occupants (Gäste block)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/stays/{stay_id}/occupants", response_model=list[StayOccupantRead])
async def get_stay_occupants(
    stay_id: int,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    """List all physical guest occupants registered to a stay."""
    del hotel_access
    return await list_stay_occupants(db, stay_id=stay_id)


@router.put("/stays/{stay_id}/occupants", response_model=list[StayOccupantRead])
async def put_stay_occupants(
    stay_id: int,
    payload: StayOccupantUpsert,
    db: AsyncSession = Depends(get_db),
    hotel_access: HotelAccessContext = Depends(require_hotel_permissions(HOTEL_PERMISSION_RESERVATIONS)),
):
    """
    Replace all occupants for a stay.
    The first guest_profile_id in the list is treated as the primary occupant.
    """
    del hotel_access
    result = await upsert_stay_occupants(db, stay_id=stay_id, payload=payload)
    await db.commit()
    return result
