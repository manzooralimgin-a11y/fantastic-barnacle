import secrets
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import Bill, CashShift, KDSStationConfig, OrderItem, Payment, TableOrder
from app.billing.schemas import (
    BillCreate,
    BillSplitUpdate,
    CashShiftClose,
    CashShiftOpen,
    KDSStationCreate,
    KDSStationUpdate,
    OrderItemCreate,
    OrderItemUpdate,
    PaymentCreate,
    RefundCreate,
    SendReceiptRequest,
    TableOrderCreate,
    TableOrderUpdate,
)
from app.reservations.models import Table
from app.shared.audit import log_human_action


# ── Table Orders ──

async def get_active_orders(db: AsyncSession, restaurant_id: int) -> list[TableOrder]:
    result = await db.execute(
        select(TableOrder)
        .where(
            TableOrder.restaurant_id == restaurant_id,
            TableOrder.status.in_(["open", "submitted", "preparing", "served"]),
        )
        .order_by(TableOrder.created_at.desc())
    )
    return list(result.scalars().all())


async def get_order_by_id(db: AsyncSession, restaurant_id: int, order_id: int) -> TableOrder:
    result = await db.execute(
        select(TableOrder).where(
            TableOrder.id == order_id,
            TableOrder.restaurant_id == restaurant_id,
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


async def create_order(db: AsyncSession, restaurant_id: int, payload: TableOrderCreate) -> TableOrder:
    order = TableOrder(**payload.model_dump(), restaurant_id=restaurant_id)
    db.add(order)
    await db.flush()
    await log_human_action(
        db,
        action="table_order_created",
        detail=f"Created table order #{order.id}",
        entity_type="billing",
        entity_id=order.id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(order)
    return order


async def update_order(
    db: AsyncSession, restaurant_id: int, order_id: int, payload: TableOrderUpdate
) -> TableOrder:
    order = await get_order_by_id(db, restaurant_id, order_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(order, k, v)
    await db.flush()
    await db.refresh(order)
    return order


async def close_order(db: AsyncSession, restaurant_id: int, order_id: int) -> TableOrder:
    order = await get_order_by_id(db, restaurant_id, order_id)
    order.status = "closed"
    await db.flush()
    await db.refresh(order)
    return order


async def _recalculate_order_totals(db: AsyncSession, restaurant_id: int, order_id: int) -> TableOrder:
    """Recalculate subtotal, tax, total from line items."""
    order = await get_order_by_id(db, restaurant_id, order_id)
    items_result = await db.execute(
        select(OrderItem).where(
            OrderItem.order_id == order_id,
            OrderItem.restaurant_id == restaurant_id,
            OrderItem.status != "cancelled",
        )
    )
    items = list(items_result.scalars().all())
    subtotal_gross = sum(float(i.total_price) for i in items)
    tax_rate = 0.19  # 19% default for Germany
    tax_amount = round(subtotal_gross * tax_rate / (1 + tax_rate), 2)
    subtotal_net = round(subtotal_gross - tax_amount, 2)
    order.subtotal = subtotal_net
    order.tax_amount = tax_amount
    order.total = round(subtotal_gross - float(order.discount_amount) + float(order.tip_amount), 2)
    await db.flush()
    await db.refresh(order)
    return order


# ── Order Items ──

async def get_order_items(db: AsyncSession, restaurant_id: int, order_id: int) -> list[OrderItem]:
    result = await db.execute(
        select(OrderItem)
        .where(OrderItem.order_id == order_id, OrderItem.restaurant_id == restaurant_id)
        .order_by(OrderItem.created_at)
    )
    return list(result.scalars().all())


async def add_order_item(
    db: AsyncSession, restaurant_id: int, order_id: int, payload: OrderItemCreate
) -> OrderItem:
    await get_order_by_id(db, restaurant_id, order_id)
    item = OrderItem(
        restaurant_id=restaurant_id,
        order_id=order_id,
        **payload.model_dump(),
        total_price=round(payload.unit_price * payload.quantity, 2),
    )
    db.add(item)
    await db.flush()
    await _recalculate_order_totals(db, restaurant_id, order_id)
    await log_human_action(
        db,
        action="order_item_added",
        detail=f"Added item '{item.item_name}' to order #{order_id}",
        entity_type="billing",
        entity_id=order_id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(item)
    return item


async def update_order_item(
    db: AsyncSession, restaurant_id: int, item_id: int, payload: OrderItemUpdate
) -> OrderItem:
    result = await db.execute(
        select(OrderItem).where(
            OrderItem.id == item_id,
            OrderItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order item not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)

    if payload.quantity is not None:
        item.total_price = round(float(item.unit_price) * item.quantity, 2)

    await db.flush()
    await _recalculate_order_totals(db, restaurant_id, item.order_id)
    await db.refresh(item)
    return item


async def remove_order_item(db: AsyncSession, restaurant_id: int, item_id: int) -> None:
    result = await db.execute(
        select(OrderItem).where(
            OrderItem.id == item_id,
            OrderItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order item not found")
    order_id = item.order_id
    await db.delete(item)
    await db.flush()
    await _recalculate_order_totals(db, restaurant_id, order_id)


async def send_to_kitchen(db: AsyncSession, restaurant_id: int, order_id: int) -> TableOrder:
    """Mark all pending items as preparing and set sent_to_kitchen_at."""
    items_result = await db.execute(
        select(OrderItem).where(
            OrderItem.order_id == order_id,
            OrderItem.restaurant_id == restaurant_id,
            OrderItem.status == "pending",
        )
    )
    items = list(items_result.scalars().all())
    now = datetime.now(timezone.utc)

    # Auto-assign station based on KDS category mapping
    stations = await get_kds_stations(db, restaurant_id, active_only=True)
    category_station_map: dict[int, str] = {}
    for station in stations:
        if station.category_ids_json:
            ids = station.category_ids_json.get("ids", [])
            for cid in ids:
                category_station_map[cid] = station.name

    for item in items:
        item.status = "preparing"
        item.sent_to_kitchen_at = now
        if not item.station and category_station_map:
            from app.menu.models import MenuItem
            mi_result = await db.execute(
                select(MenuItem.category_id).where(
                    MenuItem.id == item.menu_item_id,
                    MenuItem.restaurant_id == restaurant_id,
                )
            )
            cat_id = mi_result.scalar_one_or_none()
            if cat_id and cat_id in category_station_map:
                item.station = category_station_map[cat_id]

    order = await get_order_by_id(db, restaurant_id, order_id)
    order.status = "submitted"
    await db.flush()
    await log_human_action(
        db,
        action="order_sent_to_kitchen",
        detail=f"Sent order #{order_id} to kitchen",
        entity_type="billing",
        entity_id=order_id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(order)
    return order


# ── Bills ──

async def generate_bill(db: AsyncSession, restaurant_id: int, payload: BillCreate) -> Bill:
    order = await get_order_by_id(db, restaurant_id, payload.order_id)

    count_result = await db.execute(
        select(func.count(Bill.id)).where(Bill.restaurant_id == restaurant_id)
    )
    count = (count_result.scalar() or 0) + 1
    bill_number = f"BILL-{datetime.now().year}-{count:04d}"

    subtotal_gross = float(order.subtotal) + float(order.tax_amount)
    total = subtotal_gross + payload.service_charge - float(order.discount_amount) + float(order.tip_amount)
    # German standard: Tax is inclusive in the total price
    tax_amount = round(total * payload.tax_rate / (1 + payload.tax_rate), 2)
    subtotal_net = round(total - tax_amount, 2)

    receipt_token = secrets.token_urlsafe(32)

    bill = Bill(
        restaurant_id=restaurant_id,
        order_id=payload.order_id,
        bill_number=bill_number,
        subtotal=subtotal_net, # Net value
        tax_rate=payload.tax_rate,
        tax_amount=tax_amount,
        service_charge=payload.service_charge,
        discount_amount=float(order.discount_amount),
        tip_amount=float(order.tip_amount),
        total=total,
        split_type=payload.split_type,
        split_count=payload.split_count,
        tip_suggestions_json={"suggestions": [10, 15, 20]},
        receipt_email=payload.receipt_email,
        receipt_phone=payload.receipt_phone,
        receipt_token=receipt_token,
    )
    db.add(bill)
    await db.flush()
    await log_human_action(
        db,
        action="bill_generated",
        detail=f"Generated bill #{bill.bill_number} for order #{bill.order_id}",
        entity_type="billing",
        entity_id=bill.id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(bill)
    return bill


async def get_bill_by_id(db: AsyncSession, restaurant_id: int, bill_id: int) -> Bill:
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == restaurant_id)
    )
    bill = result.scalar_one_or_none()
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


async def get_bill_by_order(db: AsyncSession, restaurant_id: int, order_id: int) -> Bill | None:
    result = await db.execute(
        select(Bill).where(Bill.order_id == order_id, Bill.restaurant_id == restaurant_id)
    )
    return result.scalar_one_or_none()


async def get_bill_by_token(db: AsyncSession, token: str) -> Bill | None:
    result = await db.execute(select(Bill).where(Bill.receipt_token == token))
    return result.scalar_one_or_none()


async def update_bill_split(
    db: AsyncSession, restaurant_id: int, bill_id: int, payload: BillSplitUpdate
) -> Bill:
    bill = await get_bill_by_id(db, restaurant_id, bill_id)
    bill.split_type = payload.split_type
    bill.split_count = payload.split_count
    await db.flush()
    await db.refresh(bill)
    return bill


async def get_receipt_data(db: AsyncSession, restaurant_id: int, bill_id: int) -> dict:
    bill = await get_bill_by_id(db, restaurant_id, bill_id)
    items_result = await db.execute(
        select(OrderItem).where(
            OrderItem.order_id == bill.order_id,
            OrderItem.restaurant_id == restaurant_id,
        )
    )
    items = list(items_result.scalars().all())
    payments_result = await db.execute(
        select(Payment).where(Payment.bill_id == bill_id, Payment.restaurant_id == restaurant_id)
    )
    payments = list(payments_result.scalars().all())

    return {
        "bill_number": bill.bill_number,
        "order_id": bill.order_id,
        "items": items,
        "subtotal": float(bill.subtotal),
        "tax_rate": float(bill.tax_rate),
        "tax_amount": float(bill.tax_amount),
        "service_charge": float(bill.service_charge),
        "discount_amount": float(bill.discount_amount),
        "tip_amount": float(bill.tip_amount),
        "total": float(bill.total),
        "payments": payments,
        "paid_at": bill.paid_at,
        "receipt_token": bill.receipt_token,
    }


async def get_receipt_by_token(db: AsyncSession, token: str) -> dict:
    bill = await get_bill_by_token(db, token)
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return await get_receipt_data(db, bill.restaurant_id, bill.id)


async def send_receipt(
    db: AsyncSession, restaurant_id: int, bill_id: int, payload: SendReceiptRequest
) -> dict:
    bill = await get_bill_by_id(db, restaurant_id, bill_id)
    if payload.email:
        bill.receipt_email = payload.email
    if payload.phone:
        bill.receipt_phone = payload.phone
    await db.flush()
    return {"status": "sent", "email": payload.email, "phone": payload.phone}


# ── Payments ──

async def create_payment(db: AsyncSession, restaurant_id: int, payload: PaymentCreate) -> Payment:
    bill = await get_bill_by_id(db, restaurant_id, payload.bill_id)

    payment = Payment(
        restaurant_id=restaurant_id,
        **payload.model_dump(),
        paid_at=datetime.now(timezone.utc),
    )
    db.add(payment)
    await db.flush()

    paid_result = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.bill_id == bill.id,
            Payment.restaurant_id == restaurant_id,
            Payment.status == "completed",
        )
    )
    total_paid = paid_result.scalar() or 0
    if float(total_paid) >= float(bill.total):
        bill.status = "paid"
        bill.paid_at = datetime.now(timezone.utc)
        order = await get_order_by_id(db, restaurant_id, bill.order_id)
        order.status = "closed"
    else:
        bill.status = "partially_paid"

    await db.flush()
    await log_human_action(
        db,
        action="payment_created",
        detail=f"Recorded {payment.method} payment for bill #{payment.bill_id}",
        entity_type="billing",
        entity_id=payment.id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(payment)
    return payment


async def refund_payment(
    db: AsyncSession, restaurant_id: int, payment_id: int, payload: RefundCreate
) -> Payment:
    original = await db.execute(
        select(Payment).where(
            Payment.id == payment_id,
            Payment.restaurant_id == restaurant_id,
        )
    )
    original_payment = original.scalar_one_or_none()
    if original_payment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    refund_amount = payload.amount or float(original_payment.amount)
    if refund_amount > float(original_payment.amount):
        raise HTTPException(status_code=400, detail="Refund amount exceeds payment")

    refund = Payment(
        restaurant_id=restaurant_id,
        bill_id=original_payment.bill_id,
        amount=-refund_amount,
        method=original_payment.method,
        reference=f"REFUND-{original_payment.id}",
        tip_amount=0,
        status="refunded",
        paid_at=datetime.now(timezone.utc),
        refund_of_id=original_payment.id,
        card_last_four=original_payment.card_last_four,
        card_brand=original_payment.card_brand,
    )
    db.add(refund)

    bill = await get_bill_by_id(db, restaurant_id, original_payment.bill_id)
    paid_result = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.bill_id == bill.id,
            Payment.restaurant_id == restaurant_id,
        )
    )
    net_paid = float(paid_result.scalar() or 0) - refund_amount
    if net_paid <= 0:
        bill.status = "refunded"
    else:
        bill.status = "partially_paid"

    await db.flush()
    await log_human_action(
        db,
        action="payment_refunded",
        detail=f"Refunded payment #{payment_id} (amount={refund_amount})",
        entity_type="billing",
        entity_id=refund.id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(refund)
    return refund


# ── Cash Shifts ──

async def open_cash_shift(db: AsyncSession, restaurant_id: int, payload: CashShiftOpen) -> CashShift:
    existing = await db.execute(
        select(CashShift).where(CashShift.restaurant_id == restaurant_id, CashShift.status == "open")
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="A cash shift is already open")

    shift = CashShift(
        restaurant_id=restaurant_id,
        opened_by=payload.opened_by,
        opening_amount=payload.opening_amount,
        opened_at=datetime.now(timezone.utc),
        notes=payload.notes,
    )
    db.add(shift)
    await db.flush()
    await log_human_action(
        db,
        action="cash_shift_opened",
        detail=f"Opened cash shift #{shift.id}",
        entity_type="billing",
        entity_id=shift.id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(shift)
    return shift


async def close_cash_shift(
    db: AsyncSession, restaurant_id: int, shift_id: int, payload: CashShiftClose
) -> CashShift:
    result = await db.execute(
        select(CashShift).where(CashShift.id == shift_id, CashShift.restaurant_id == restaurant_id)
    )
    shift = result.scalar_one_or_none()
    if shift is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cash shift not found")
    if shift.status != "open":
        raise HTTPException(status_code=400, detail="Shift is not open")

    cash_payments_result = await db.execute(
        select(func.sum(Payment.amount)).where(
            Payment.method == "cash",
            Payment.restaurant_id == restaurant_id,
            Payment.paid_at >= shift.opened_at,
            Payment.status == "completed",
        )
    )
    cash_total = float(cash_payments_result.scalar() or 0)
    expected = float(shift.opening_amount) + cash_total

    shift.closed_by = payload.closed_by
    shift.closing_amount = payload.closing_amount
    shift.expected_amount = expected
    shift.variance = round(payload.closing_amount - expected, 2)
    shift.status = "closed"
    shift.closed_at = datetime.now(timezone.utc)
    if payload.notes:
        shift.notes = (shift.notes or "") + "\n" + payload.notes

    await db.flush()
    await log_human_action(
        db,
        action="cash_shift_closed",
        detail=f"Closed cash shift #{shift.id}",
        entity_type="billing",
        entity_id=shift.id,
        source_module="billing",
        restaurant_id=restaurant_id,
    )
    await db.refresh(shift)
    return shift


async def get_current_cash_shift(db: AsyncSession, restaurant_id: int) -> CashShift | None:
    result = await db.execute(
        select(CashShift).where(CashShift.restaurant_id == restaurant_id, CashShift.status == "open")
    )
    return result.scalar_one_or_none()


async def get_cash_shifts(db: AsyncSession, restaurant_id: int, limit: int = 50) -> list[CashShift]:
    result = await db.execute(
        select(CashShift)
        .where(CashShift.restaurant_id == restaurant_id)
        .order_by(CashShift.opened_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# ── KDS Stations ──

async def get_kds_stations(
    db: AsyncSession, restaurant_id: int, active_only: bool = False
) -> list[KDSStationConfig]:
    query = (
        select(KDSStationConfig)
        .where(KDSStationConfig.restaurant_id == restaurant_id)
        .order_by(KDSStationConfig.sort_order)
    )
    if active_only:
        query = query.where(KDSStationConfig.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_kds_station(
    db: AsyncSession, restaurant_id: int, payload: KDSStationCreate
) -> KDSStationConfig:
    station = KDSStationConfig(restaurant_id=restaurant_id, **payload.model_dump())
    db.add(station)
    await db.flush()
    await db.refresh(station)
    return station


async def update_kds_station(
    db: AsyncSession, restaurant_id: int, station_id: int, payload: KDSStationUpdate
) -> KDSStationConfig:
    result = await db.execute(
        select(KDSStationConfig).where(
            KDSStationConfig.id == station_id,
            KDSStationConfig.restaurant_id == restaurant_id,
        )
    )
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KDS station not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(station, k, v)
    await db.flush()
    await db.refresh(station)
    return station


async def delete_kds_station(db: AsyncSession, restaurant_id: int, station_id: int) -> None:
    result = await db.execute(
        select(KDSStationConfig).where(
            KDSStationConfig.id == station_id,
            KDSStationConfig.restaurant_id == restaurant_id,
        )
    )
    station = result.scalar_one_or_none()
    if station is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KDS station not found")
    await db.delete(station)
    await db.flush()


async def get_kds_orders(
    db: AsyncSession, restaurant_id: int, station: str | None = None
) -> list[dict]:
    """Get active orders for KDS display, optionally filtered by station."""
    query = select(OrderItem).where(
        OrderItem.restaurant_id == restaurant_id,
        OrderItem.status.in_(["preparing", "ready"]),
    ).order_by(OrderItem.sent_to_kitchen_at)

    if station:
        query = query.where(OrderItem.station == station)

    result = await db.execute(query)
    items = list(result.scalars().all())

    orders_map: dict[int, list] = {}
    for item in items:
        orders_map.setdefault(item.order_id, []).append(item)

    now = datetime.now(timezone.utc)
    kds_orders = []
    for order_id, order_items in orders_map.items():
        # Check if a bill has been paid for this order
        from app.billing.models import Bill
        bill_result = await db.execute(
            select(Bill.id).where(
                Bill.order_id == order_id,
                Bill.status == "paid"
            )
        )
        if bill_result.scalar_one_or_none():
            continue  # Skip orders that are already paid
        
        order = await get_order_by_id(db, restaurant_id, order_id)
        table_number = None
        if order.table_id:
            table_result = await db.execute(
                select(Table.table_number).where(
                    Table.id == order.table_id,
                    Table.restaurant_id == restaurant_id,
                )
            )
            table_number = table_result.scalar_one_or_none()

        earliest = min(
            (i.sent_to_kitchen_at for i in order_items if i.sent_to_kitchen_at),
            default=now,
        )
        elapsed = int((now - earliest).total_seconds() / 60)

        kds_orders.append({
            "order_id": order_id,
            "table_number": table_number,
            "order_type": order.order_type,
            "guest_name": order.guest_name,
            "elapsed_minutes": elapsed,
            "items": [
                {
                    "id": i.id,
                    "item_name": i.item_name,
                    "quantity": i.quantity,
                    "status": i.status,
                    "station": i.station,
                    "course_number": i.course_number,
                    "notes": i.notes,
                    "modifiers_json": i.modifiers_json,
                }
                for i in order_items
            ],
        })

    return kds_orders


async def mark_item_ready(db: AsyncSession, restaurant_id: int, item_id: int) -> OrderItem:
    result = await db.execute(
        select(OrderItem).where(
            OrderItem.id == item_id,
            OrderItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order item not found")
    item.status = "ready"
    await db.flush()
    await db.refresh(item)
    return item


async def mark_item_served(db: AsyncSession, restaurant_id: int, item_id: int) -> OrderItem:
    result = await db.execute(
        select(OrderItem).where(
            OrderItem.id == item_id,
            OrderItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order item not found")
    item.status = "served"
    item.served_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(item)
    return item


async def recall_item(db: AsyncSession, restaurant_id: int, item_id: int) -> OrderItem:
    result = await db.execute(
        select(OrderItem).where(
            OrderItem.id == item_id,
            OrderItem.restaurant_id == restaurant_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order item not found")
    item.status = "preparing"
    await db.flush()
    await db.refresh(item)
    return item


async def bump_order(db: AsyncSession, restaurant_id: int, order_id: int) -> dict:
    """Mark all items in an order as served."""
    items_result = await db.execute(
        select(OrderItem).where(
            OrderItem.order_id == order_id,
            OrderItem.restaurant_id == restaurant_id,
            OrderItem.status.in_(["preparing", "ready"]),
        )
    )
    items = list(items_result.scalars().all())
    now = datetime.now(timezone.utc)
    for item in items:
        item.status = "served"
        item.served_at = now

    order = await get_order_by_id(db, restaurant_id, order_id)
    order.status = "served"
    await db.flush()
    return {"order_id": order_id, "bumped_items": len(items)}


# ── Daily Summary ──

async def get_daily_summary(
    db: AsyncSession, restaurant_id: int, target_date: date | None = None
) -> dict:
    if target_date is None:
        target_date = date.today()

    orders_result = await db.execute(
        select(TableOrder).where(
            TableOrder.restaurant_id == restaurant_id,
            cast(TableOrder.created_at, Date) == target_date,
        )
    )
    orders = list(orders_result.scalars().all())

    total_orders = len(orders)
    total_revenue = sum(float(o.total) for o in orders)
    total_tax = sum(float(o.tax_amount) for o in orders)
    total_tips = sum(float(o.tip_amount) for o in orders)
    total_discounts = sum(float(o.discount_amount) for o in orders)

    payments_result = await db.execute(
        select(Payment.method, func.sum(Payment.amount))
        .where(
            Payment.restaurant_id == restaurant_id,
            cast(Payment.paid_at, Date) == target_date,
        )
        .group_by(Payment.method)
    )
    payment_breakdown = {row[0]: float(row[1]) for row in payments_result.all()}

    return {
        "date": target_date.isoformat(),
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "total_tax": round(total_tax, 2),
        "total_tips": round(total_tips, 2),
        "total_discounts": round(total_discounts, 2),
        "payment_breakdown": payment_breakdown,
        "avg_order_value": round(total_revenue / total_orders, 2) if total_orders else 0,
    }


# ── Active Orders with Table Info ──

async def get_active_orders_with_info(db: AsyncSession, restaurant_id: int) -> list[dict]:
    orders = await get_active_orders(db, restaurant_id)
    result = []
    now = datetime.now(timezone.utc)

    for order in orders:
        items_count = await db.execute(
            select(func.count(OrderItem.id)).where(
                OrderItem.order_id == order.id,
                OrderItem.restaurant_id == restaurant_id,
            )
        )
        item_count = items_count.scalar() or 0

        table_number = None
        if order.table_id:
            table_result = await db.execute(
                select(Table.table_number).where(
                    Table.id == order.table_id,
                    Table.restaurant_id == restaurant_id,
                )
            )
            table_number = table_result.scalar_one_or_none()

        elapsed = int((now - order.created_at).total_seconds() / 60) if order.created_at else 0

        result.append({
            "id": order.id,
            "table_id": order.table_id,
            "table_number": table_number,
            "order_type": order.order_type,
            "status": order.status,
            "item_count": item_count,
            "total": float(order.total),
            "created_at": order.created_at,
            "elapsed_minutes": elapsed,
        })

    return result
