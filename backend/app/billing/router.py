from datetime import date

from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.billing.schemas import (
    BillCreate,
    BillRead,
    BillSplitUpdate,
    CashShiftClose,
    CashShiftOpen,
    CashShiftRead,
    KDSStationCreate,
    KDSStationRead,
    KDSStationUpdate,
    OrderItemCreate,
    OrderItemRead,
    OrderItemUpdate,
    PaymentCreate,
    PaymentRead,
    RefundCreate,
    SendReceiptRequest,
    TableOrderCreate,
    TableOrderRead,
    TableOrderUpdate,
)
from app.billing.service import (
    add_order_item,
    bump_order,
    close_cash_shift,
    close_order,
    create_kds_station,
    create_order,
    create_payment,
    delete_kds_station,
    generate_bill,
    get_active_orders,
    get_active_orders_with_info,
    get_bill_by_id,
    get_bill_by_order,
    get_cash_shifts,
    get_current_cash_shift,
    get_daily_summary,
    get_kds_orders,
    get_kds_stations,
    get_order_by_id,
    get_order_items,
    get_receipt_by_token,
    get_receipt_data,
    mark_item_ready,
    mark_item_served,
    open_cash_shift,
    recall_item,
    refund_payment,
    remove_order_item,
    send_receipt,
    send_to_kitchen,
    update_bill_split,
    update_kds_station,
    update_order,
    update_order_item,
)

router = APIRouter()
public_router = APIRouter()


# ── Orders ──

@router.get("/orders", response_model=list[TableOrderRead])
async def list_active_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_active_orders(db, current_user.restaurant_id)


@router.get("/orders/live")
async def live_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    """Active orders with table info and elapsed time."""
    return await get_active_orders_with_info(db, current_user.restaurant_id)


@router.post("/orders", response_model=TableOrderRead, status_code=201)
async def new_order(
    payload: TableOrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_order(db, current_user.restaurant_id, payload)


@router.get("/orders/{order_id}", response_model=TableOrderRead)
async def order_detail(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_order_by_id(db, current_user.restaurant_id, order_id)


@router.put("/orders/{order_id}", response_model=TableOrderRead)
async def edit_order(
    order_id: int,
    payload: TableOrderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_order(db, current_user.restaurant_id, order_id, payload)


@router.post("/orders/{order_id}/close", response_model=TableOrderRead)
async def close(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await close_order(db, current_user.restaurant_id, order_id)


@router.post("/orders/{order_id}/send-to-kitchen", response_model=TableOrderRead)
async def kitchen_send(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await send_to_kitchen(db, current_user.restaurant_id, order_id)


# ── Order Items ──

@router.get("/orders/{order_id}/items", response_model=list[OrderItemRead])
async def list_order_items(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_order_items(db, current_user.restaurant_id, order_id)


@router.post("/orders/{order_id}/items", response_model=OrderItemRead, status_code=201)
async def add_item(
    order_id: int,
    payload: OrderItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await add_order_item(db, current_user.restaurant_id, order_id, payload)


@router.put("/items/{item_id}", response_model=OrderItemRead)
async def edit_item(
    item_id: int,
    payload: OrderItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_order_item(db, current_user.restaurant_id, item_id, payload)


@router.delete("/items/{item_id}", status_code=204)
async def remove_item(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    await remove_order_item(db, current_user.restaurant_id, item_id)


# ── Bills ──

@router.post("/bills", response_model=BillRead, status_code=201)
async def create_bill(
    payload: BillCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await generate_bill(db, current_user.restaurant_id, payload)


@router.get("/bills/{bill_id}", response_model=BillRead)
async def bill_detail(
    bill_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_bill_by_id(db, current_user.restaurant_id, bill_id)


@router.get("/bills/by-order/{order_id}", response_model=BillRead)
async def bill_by_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    bill = await get_bill_by_order(db, current_user.restaurant_id, order_id)
    if bill is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No bill for this order")
    return bill


@router.put("/bills/{bill_id}/split", response_model=BillRead)
async def split_bill(
    bill_id: int,
    payload: BillSplitUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_bill_split(db, current_user.restaurant_id, bill_id, payload)


@router.get("/bills/{bill_id}/receipt")
async def receipt(
    bill_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_receipt_data(db, current_user.restaurant_id, bill_id)


@router.get("/bills/{bill_id}/digital-receipt")
async def digital_receipt(
    bill_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_receipt_data(db, current_user.restaurant_id, bill_id)


@router.post("/bills/{bill_id}/send-receipt")
async def send_receipt_endpoint(
    bill_id: int,
    payload: SendReceiptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await send_receipt(db, current_user.restaurant_id, bill_id, payload)


@public_router.get("/receipt/{token}")
async def public_receipt(
    token: str = Path(min_length=8, max_length=255),
    db: AsyncSession = Depends(get_db),
):
    """Public receipt view (no auth required)."""
    return await get_receipt_by_token(db, token)


# ── Payments ──

@router.post("/payments", response_model=PaymentRead, status_code=201)
async def make_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_payment(db, current_user.restaurant_id, payload)


@router.post("/payments/{payment_id}/refund", response_model=PaymentRead)
async def refund(
    payment_id: int,
    payload: RefundCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await refund_payment(db, current_user.restaurant_id, payment_id, payload)


# ── Cash Shifts ──

@router.post("/cash-shifts/open", response_model=CashShiftRead, status_code=201)
async def open_shift(
    payload: CashShiftOpen,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await open_cash_shift(db, current_user.restaurant_id, payload)


@router.post("/cash-shifts/{shift_id}/close", response_model=CashShiftRead)
async def close_shift(
    shift_id: int,
    payload: CashShiftClose,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await close_cash_shift(db, current_user.restaurant_id, shift_id, payload)


@router.get("/cash-shifts/current")
async def current_shift(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    shift = await get_current_cash_shift(db, current_user.restaurant_id)
    if shift is None:
        return {"status": "no_open_shift"}
    return shift


@router.get("/cash-shifts", response_model=list[CashShiftRead])
async def list_shifts(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_cash_shifts(db, current_user.restaurant_id, limit)


# ── KDS Stations ──

@router.get("/kds/stations", response_model=list[KDSStationRead])
async def list_kds_stations(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_kds_stations(db, current_user.restaurant_id, active_only)


@router.post("/kds/stations", response_model=KDSStationRead, status_code=201)
async def add_kds_station(
    payload: KDSStationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_kds_station(db, current_user.restaurant_id, payload)


@router.put("/kds/stations/{station_id}", response_model=KDSStationRead)
async def edit_kds_station(
    station_id: int,
    payload: KDSStationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await update_kds_station(db, current_user.restaurant_id, station_id, payload)


@router.delete("/kds/stations/{station_id}", status_code=204)
async def remove_kds_station(
    station_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    await delete_kds_station(db, current_user.restaurant_id, station_id)


# ── KDS Orders ──

@router.get("/kds/orders")
async def kds_orders(
    station: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_kds_orders(db, current_user.restaurant_id, station)


@router.post("/kds/items/{item_id}/ready", response_model=OrderItemRead)
async def kds_item_ready(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await mark_item_ready(db, current_user.restaurant_id, item_id)


@router.post("/kds/items/{item_id}/served", response_model=OrderItemRead)
async def kds_item_served(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await mark_item_served(db, current_user.restaurant_id, item_id)


@router.post("/kds/items/{item_id}/recall", response_model=OrderItemRead)
async def kds_item_recall(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await recall_item(db, current_user.restaurant_id, item_id)


@router.post("/kds/orders/{order_id}/bump")
async def kds_bump_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await bump_order(db, current_user.restaurant_id, order_id)


# ── Daily Summary ──

@router.get("/daily-summary")
async def daily_summary(
    target_date: date | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_daily_summary(db, current_user.restaurant_id, target_date)
