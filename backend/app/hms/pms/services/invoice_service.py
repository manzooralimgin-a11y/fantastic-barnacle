from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.invoice_service import (
    add_invoice_line_item,
    ensure_invoice_for_reservation,
    finalize_invoice,
    generate_invoice_document_action,
    get_invoice,
    get_invoice_detail,
    get_invoice_preview,
    list_invoices,
    post_invoice_payment,
    search_cash_master_invoices,
    send_invoice,
    void_invoice_line_item,
)
from app.hms.schemas import HotelFolioLineCreate, HotelFolioPaymentCreate, HotelInvoiceSendRequest


async def ensure_pms_invoice(db: AsyncSession, *, reservation_id: int, hotel_access):
    return await ensure_invoice_for_reservation(
        db,
        reservation_id=reservation_id,
        hotel_access=hotel_access,
    )


async def list_pms_invoices(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
    reservation_id: int | None = None,
    limit: int = 100,
):
    return await list_invoices(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        reservation_id=reservation_id,
        limit=limit,
    )


async def search_pms_cash_master(
    db: AsyncSession,
    *,
    hotel_access,
    property_id: int | None = None,
    search: str | None = None,
    invoice_status: str | None = None,
    payment_status: str | None = None,
    payment_method: str | None = None,
    room: str | None = None,
    guest_company: str | None = None,
    date_from=None,
    date_to=None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "invoice_date",
    sort_dir: str = "desc",
):
    return await search_cash_master_invoices(
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


async def get_pms_invoice(db: AsyncSession, *, invoice_id: int, hotel_access):
    return await get_invoice(db, invoice_id=invoice_id, hotel_access=hotel_access)


async def get_pms_invoice_detail(db: AsyncSession, *, invoice_id: int, hotel_access):
    return await get_invoice_detail(db, invoice_id=invoice_id, hotel_access=hotel_access)


async def get_pms_invoice_preview(db: AsyncSession, *, invoice_id: int, hotel_access):
    return await get_invoice_preview(db, invoice_id=invoice_id, hotel_access=hotel_access)


async def send_pms_invoice(
    db: AsyncSession,
    *,
    invoice_id: int,
    payload: HotelInvoiceSendRequest,
    hotel_access,
):
    return await send_invoice(
        db,
        invoice_id=invoice_id,
        payload=payload,
        hotel_access=hotel_access,
    )


async def finalize_pms_invoice(db: AsyncSession, *, invoice_id: int, hotel_access):
    return await finalize_invoice(
        db,
        invoice_id=invoice_id,
        hotel_access=hotel_access,
    )


async def add_pms_invoice_line_item(
    db: AsyncSession,
    *,
    invoice_id: int,
    payload: HotelFolioLineCreate,
    hotel_access,
):
    return await add_invoice_line_item(
        db,
        invoice_id=invoice_id,
        payload=payload,
        hotel_access=hotel_access,
    )


async def void_pms_invoice_line_item(
    db: AsyncSession,
    *,
    invoice_id: int,
    line_id: int,
    hotel_access,
):
    return await void_invoice_line_item(
        db,
        invoice_id=invoice_id,
        line_id=line_id,
        hotel_access=hotel_access,
    )


async def post_pms_invoice_payment(
    db: AsyncSession,
    *,
    invoice_id: int,
    payload: HotelFolioPaymentCreate,
    hotel_access,
):
    return await post_invoice_payment(
        db,
        invoice_id=invoice_id,
        payload=payload,
        hotel_access=hotel_access,
    )


async def generate_pms_invoice_document(
    db: AsyncSession,
    *,
    invoice_id: int,
    document_kind: str,
    hotel_access,
):
    return await generate_invoice_document_action(
        db,
        invoice_id=invoice_id,
        document_kind=document_kind,
        hotel_access=hotel_access,
    )
