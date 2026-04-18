from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.schemas import LoginRequest, RefreshRequest
from app.auth.service import authenticate_user, refresh_tokens
from app.auth.utils import verify_password
from app.billing.models import Bill, OrderItem, TableOrder
from app.billing.schemas import BillCreate, OrderItemCreate, PaymentCreate, TableOrderCreate
from app.billing.service import (
    add_order_item,
    create_order as create_billing_order,
    create_payment,
    generate_bill,
    get_active_orders_with_info,
    get_order_by_id,
    send_to_kitchen,
)
from app.config import settings
from app.database import get_db, mark_session_commit_managed
from app.dependencies import get_current_tenant_user
from app.middleware.request_id import reset_idempotency_key, set_idempotency_key
from app.menu.models import MenuItem, MenuItemModifier, MenuModifier
from app.menu.service import get_categories as get_menu_categories
from app.menu.service import get_items as get_menu_items
from app.reservations.models import FloorSection, Reservation, Table, TableSession
from app.waiter.idempotency import (
    IdempotencyClaim,
    IdempotencyReplay,
    WaiterOrderIdempotencyService,
)

router = APIRouter()


class WaiterLoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    device_id: str | None = Field(default=None, max_length=255)


class WaiterAuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    waiter_id: str


class WaiterRefreshResponse(BaseModel):
    access_token: str
    expires_in: int


class WaiterLogoutResponse(BaseModel):
    ok: bool = True


class WaiterTableResponse(BaseModel):
    id: str
    number: str
    seats: int
    minimum_party_size: int
    status: str
    section_id: str
    section_name: str
    shape: str
    position_x: int
    position_y: int
    rotation: float
    width: float
    height: float
    current_order_id: str | None = None
    occupied_since: str | None = None
    current_total: float = 0
    guest_count: int = 0
    item_count: int = 0
    elapsed_minutes: int = 0
    item_status_counts: dict[str, int] = Field(default_factory=dict)
    reservation: dict[str, Any] | None = None


class WaiterMenuModifierResponse(BaseModel):
    id: str
    name: str
    group_name: str
    price_adjustment: float
    is_default: bool


class WaiterMenuItemResponse(BaseModel):
    id: str
    category_id: str
    name: str
    description: str
    price: float
    available: bool
    is_available: bool
    featured: bool
    is_featured: bool
    image_url: str | None = None
    prep_time_min: int
    allergens: list[str] = Field(default_factory=list)
    dietary_tags: list[str] = Field(default_factory=list)
    modifiers: list[WaiterMenuModifierResponse] = Field(default_factory=list)


class WaiterMenuCategoryResponse(BaseModel):
    id: str
    name: str
    sort_order: int
    icon: str | None = None
    color: str | None = None
    items: list[WaiterMenuItemResponse] = Field(default_factory=list)


class WaiterMenuResponse(BaseModel):
    categories: list[WaiterMenuCategoryResponse] = Field(default_factory=list)
    items: list[WaiterMenuItemResponse] = Field(default_factory=list)


class WaiterOrderItemRequest(BaseModel):
    menu_item_id: str
    quantity: int = Field(default=1, ge=1, le=99)
    notes: str | None = Field(default=None, max_length=500)
    modifier_ids: list[str] = Field(default_factory=list)


class WaiterOrderCreateRequest(BaseModel):
    table_id: str
    waiter_id: str | None = None
    guest_count: int | None = Field(default=None, ge=1, le=30)
    items: list[WaiterOrderItemRequest] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=500)


class WaiterOrderCreateResponse(BaseModel):
    order_id: str
    status: str
    created_at: str


class WaiterRepeatOrderItemResponse(BaseModel):
    menu_item_id: str
    item_name: str
    quantity: int
    notes: str | None = None
    modifier_ids: list[str] = Field(default_factory=list)


class WaiterTableLastOrderResponse(BaseModel):
    order_id: str
    status: str
    created_at: str
    notes: str | None = None
    items: list[WaiterRepeatOrderItemResponse] = Field(default_factory=list)


class WaiterPaymentRequest(BaseModel):
    order_id: str
    amount: float = Field(gt=0)
    payment_method: str = Field(min_length=2, max_length=30)
    waiter_id: str | None = None


class WaiterPaymentResponse(BaseModel):
    receipt_id: str
    status: str
    amount: float
    paid_at: str


class WaiterTableStatusRequest(BaseModel):
    status: str = Field(min_length=2, max_length=30)


def _expires_in_seconds() -> int:
    return int(settings.access_token_expire_minutes) * 60


def _as_waiter_status(
    table_status: str | None,
    *,
    has_active_order: bool,
    has_billing: bool,
    has_reservation: bool,
) -> str:
    normalized = (table_status or "").strip().lower()
    if has_billing or normalized in {"billing", "checkout"}:
        return "billing"
    if has_active_order or normalized in {"occupied", "busy", "cleaning", "seated"}:
        return "occupied"
    if has_reservation or normalized in {"reserved", "booked", "arrived"}:
        return "reserved"
    return "free"


def _as_backend_table_status(waiter_status: str) -> str:
    normalized = waiter_status.strip().lower()
    if normalized == "occupied":
        return "occupied"
    if normalized == "reserved":
        return "reserved"
    return "available"


async def _resolve_waiter_user(db: AsyncSession, username: str) -> User | None:
    normalized = username.strip().lower()
    if not normalized:
        return None
    result = await db.execute(
        select(User).where(
            or_(
                func.lower(User.email) == normalized,
                func.lower(User.email).like(f"{normalized}@%"),
            )
        )
    )
    return result.scalars().first()


def _empty_item_status_counts() -> dict[str, int]:
    return {
        "preparing": 0,
        "ready": 0,
        "served": 0,
    }


def _summary_status(status_value: str | None) -> str | None:
    normalized = (status_value or "").strip().lower()
    if normalized in {"pending", "preparing"}:
        return "preparing"
    if normalized in {"ready", "served"}:
        return normalized
    return None


def _extract_modifier_ids(payload: dict[str, Any] | None) -> list[str]:
    if payload is None or not isinstance(payload, dict):
        return []
    selected = payload.get("selected")
    if not isinstance(selected, list):
        return []
    modifier_ids: list[str] = []
    for entry in selected:
        if not isinstance(entry, dict):
            continue
        modifier_id = entry.get("id")
        if modifier_id is None:
            continue
        modifier_ids.append(str(modifier_id))
    return modifier_ids


async def _load_modifier_map(
    db: AsyncSession,
    restaurant_id: int,
    item_ids: list[int],
) -> dict[int, list[WaiterMenuModifierResponse]]:
    if not item_ids:
        return {}

    modifier_rows = await db.execute(
        select(
            MenuItemModifier.item_id,
            MenuModifier.id,
            MenuModifier.name,
            MenuModifier.group_name,
            MenuModifier.price_adjustment,
            MenuModifier.is_default,
        )
        .join(MenuModifier, MenuModifier.id == MenuItemModifier.modifier_id)
        .where(
            MenuItemModifier.item_id.in_(item_ids),
            MenuModifier.restaurant_id == restaurant_id,
        )
        .order_by(MenuModifier.group_name.asc(), MenuModifier.name.asc())
    )
    modifiers_by_item: dict[int, list[WaiterMenuModifierResponse]] = {}
    for item_id, modifier_id, name, group_name, price_adjustment, is_default in modifier_rows.all():
        modifiers_by_item.setdefault(int(item_id), []).append(
            WaiterMenuModifierResponse(
                id=str(modifier_id),
                name=name,
                group_name=group_name,
                price_adjustment=float(price_adjustment or 0),
                is_default=bool(is_default),
            )
        )
    return modifiers_by_item


def _serialize_waiter_menu_item(
    item: MenuItem,
    modifiers_by_item: dict[int, list[WaiterMenuModifierResponse]],
) -> WaiterMenuItemResponse:
    return WaiterMenuItemResponse(
        id=str(item.id),
        category_id=str(item.category_id),
        name=item.name,
        description=item.description or "",
        price=float(item.price or 0),
        available=bool(item.is_available),
        is_available=bool(item.is_available),
        featured=bool(item.is_featured),
        is_featured=bool(item.is_featured),
        image_url=item.image_url,
        prep_time_min=int(item.prep_time_min or 0),
        allergens=_extract_tags(item.allergens_json),
        dietary_tags=_extract_tags(item.dietary_tags_json),
        modifiers=modifiers_by_item.get(item.id, []),
    )


async def _load_last_table_order(
    db: AsyncSession,
    restaurant_id: int,
    table_id: int,
) -> TableOrder | None:
    return await db.scalar(
        select(TableOrder)
        .where(
            TableOrder.restaurant_id == restaurant_id,
            TableOrder.table_id == table_id,
        )
        .order_by(TableOrder.created_at.desc(), TableOrder.id.desc())
        .limit(1)
    )


async def _serialize_last_table_order(
    db: AsyncSession,
    restaurant_id: int,
    order: TableOrder,
) -> WaiterTableLastOrderResponse:
    items = list(
        (
            await db.execute(
                select(OrderItem)
                .where(
                    OrderItem.restaurant_id == restaurant_id,
                    OrderItem.order_id == order.id,
                )
                .order_by(OrderItem.course_number.asc(), OrderItem.id.asc())
            )
        ).scalars().all()
    )
    return WaiterTableLastOrderResponse(
        order_id=str(order.id),
        status=order.status,
        created_at=order.created_at.isoformat() if order.created_at else datetime.now(timezone.utc).isoformat(),
        notes=order.notes,
        items=[
            WaiterRepeatOrderItemResponse(
                menu_item_id=str(item.menu_item_id),
                item_name=item.item_name,
                quantity=int(item.quantity or 0),
                notes=item.notes,
                modifier_ids=_extract_modifier_ids(item.modifiers_json),
            )
            for item in items
        ],
    )


async def _authenticate_waiter(db: AsyncSession, payload: WaiterLoginRequest) -> WaiterAuthResponse:
    user = await _resolve_waiter_user(db, payload.username)
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid waiter credentials",
        )

    token_response = await authenticate_user(
        db,
        LoginRequest(email=user.email, password=payload.password),
    )
    return WaiterAuthResponse(
        access_token=token_response.access_token,
        refresh_token=token_response.refresh_token,
        expires_in=_expires_in_seconds(),
        waiter_id=str(user.id),
    )


async def _current_restaurant_user(
    current_user: User = Depends(get_current_tenant_user),
) -> User:
    if current_user.restaurant_id is None:
        raise HTTPException(status_code=403, detail="Restaurant context missing")
    return current_user


@router.post("/auth/login", response_model=WaiterAuthResponse)
async def waiter_login(
    payload: WaiterLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    return await _authenticate_waiter(db, payload)


@router.post("/auth/refresh", response_model=WaiterRefreshResponse)
async def waiter_refresh(
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    token_response = await refresh_tokens(db, payload.refresh_token)
    return WaiterRefreshResponse(
        access_token=token_response.access_token,
        expires_in=_expires_in_seconds(),
    )


@router.post("/auth/logout", response_model=WaiterLogoutResponse)
async def waiter_logout(
    _current_user: User = Depends(_current_restaurant_user),
):
    return WaiterLogoutResponse()


@router.get("/tables", response_model=list[WaiterTableResponse])
async def waiter_tables(
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    table_rows = list(
        (
            await db.execute(
                select(Table)
                .where(Table.restaurant_id == restaurant_id)
                .order_by(Table.section_id.asc(), Table.position_y.asc(), Table.position_x.asc())
            )
        ).scalars().all()
    )
    section_rows = list(
        (
            await db.execute(
                select(FloorSection).where(FloorSection.restaurant_id == restaurant_id)
            )
        ).scalars().all()
    )
    session_rows = list(
        (
            await db.execute(
                select(TableSession).where(
                    TableSession.restaurant_id == restaurant_id,
                    TableSession.status == "active",
                )
            )
        ).scalars().all()
    )
    today_reservations = list(
        (
            await db.execute(
                select(Reservation)
                .where(
                    Reservation.restaurant_id == restaurant_id,
                    Reservation.reservation_date == date.today(),
                    Reservation.status.in_(["confirmed", "arrived", "seated"]),
                )
                .order_by(Reservation.start_time.asc())
            )
        ).scalars().all()
    )
    bill_rows = list(
        (
            await db.execute(select(Bill).where(Bill.restaurant_id == restaurant_id))
        ).scalars().all()
    )
    live_orders = await get_active_orders_with_info(db, restaurant_id)
    active_order_ids = [
        int(order["id"])
        for order in live_orders
        if order.get("id") is not None
    ]
    status_counts_by_order: dict[int, dict[str, int]] = {}
    if active_order_ids:
        item_status_rows = await db.execute(
            select(
                OrderItem.order_id,
                OrderItem.status,
                func.coalesce(func.sum(OrderItem.quantity), 0),
            )
            .where(
                OrderItem.restaurant_id == restaurant_id,
                OrderItem.order_id.in_(active_order_ids),
            )
            .group_by(OrderItem.order_id, OrderItem.status)
        )
        for order_id, item_status, quantity_total in item_status_rows.all():
            summary_status = _summary_status(item_status)
            if summary_status is None:
                continue
            counts = status_counts_by_order.setdefault(int(order_id), _empty_item_status_counts())
            counts[summary_status] += int(quantity_total or 0)

    section_name_by_id = {section.id: section.name for section in section_rows}
    session_by_table = {session.table_id: session for session in session_rows}
    reservation_by_table: dict[int, Reservation] = {}
    for reservation in today_reservations:
        if reservation.table_id is None or reservation.table_id in reservation_by_table:
            continue
        reservation_by_table[reservation.table_id] = reservation

    live_orders_by_table: dict[int, list[dict[str, Any]]] = {}
    for order in live_orders:
        table_id = order.get("table_id")
        if table_id is None:
            continue
        live_orders_by_table.setdefault(int(table_id), []).append(order)

    latest_bill_by_order: dict[int, Bill] = {}
    for bill in sorted(
        bill_rows,
        key=lambda current_bill: current_bill.created_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    ):
        if bill.order_id not in latest_bill_by_order:
            latest_bill_by_order[bill.order_id] = bill

    payload: list[WaiterTableResponse] = []
    for table in table_rows:
        table_live_orders = live_orders_by_table.get(table.id, [])
        latest_order = (
            max(
                table_live_orders,
                key=lambda current_order: (
                    current_order.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
                    current_order.get("id") or 0,
                ),
            )
            if table_live_orders
            else None
        )
        reservation = reservation_by_table.get(table.id)
        active_session = session_by_table.get(table.id)
        has_active_order = bool(table_live_orders)
        has_billing = any(
            str(current_order.get("status", "")).lower() == "served"
            or (
                latest_bill_by_order.get(int(current_order["id"])) is not None
                and latest_bill_by_order[int(current_order["id"])].status in {"open", "partially_paid"}
            )
            for current_order in table_live_orders
            if current_order.get("id") is not None
        )
        guest_count = 0
        if active_session is not None:
            guest_count = int(active_session.covers or 0)
        elif reservation is not None:
            guest_count = int(reservation.party_size or 0)
        current_total = sum(float(current_order.get("total", 0) or 0) for current_order in table_live_orders)
        item_count = sum(int(current_order.get("item_count", 0) or 0) for current_order in table_live_orders)
        elapsed_minutes = max(
            (int(current_order.get("elapsed_minutes", 0) or 0) for current_order in table_live_orders),
            default=0,
        )
        item_status_counts = _empty_item_status_counts()
        for current_order in table_live_orders:
            order_id = current_order.get("id")
            if order_id is None:
                continue
            for status_name, quantity in status_counts_by_order.get(int(order_id), _empty_item_status_counts()).items():
                item_status_counts[status_name] += quantity

        payload.append(
            WaiterTableResponse(
                id=str(table.id),
                number=table.table_number,
                seats=table.capacity,
                minimum_party_size=table.min_capacity,
                status=_as_waiter_status(
                    table.status,
                    has_active_order=has_active_order,
                    has_billing=has_billing,
                    has_reservation=reservation is not None,
                ),
                section_id=str(table.section_id),
                section_name=section_name_by_id.get(table.section_id, "Dining Room"),
                shape=table.shape,
                position_x=table.position_x,
                position_y=table.position_y,
                rotation=float(table.rotation or 0),
                width=float(table.width or 1),
                height=float(table.height or 1),
                current_order_id=str(latest_order["id"]) if latest_order is not None else None,
                occupied_since=(
                    latest_order["created_at"].isoformat()
                    if latest_order is not None and latest_order.get("created_at") is not None
                    else None
                ),
                current_total=current_total if has_active_order else 0,
                guest_count=guest_count,
                item_count=item_count if has_active_order else 0,
                elapsed_minutes=elapsed_minutes if has_active_order else 0,
                item_status_counts=item_status_counts if has_active_order else _empty_item_status_counts(),
                reservation=(
                    {
                        "id": str(reservation.id),
                        "guest_name": reservation.guest_name,
                        "party_size": reservation.party_size,
                        "start_time": reservation.start_time.isoformat(),
                        "status": reservation.status,
                    }
                    if reservation is not None
                    else None
                ),
            )
        )
    return payload


@router.patch("/tables/{table_id}/status", response_model=WaiterTableResponse)
async def waiter_update_table_status(
    table_id: int,
    payload: WaiterTableStatusRequest,
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    table = await db.scalar(
        select(Table).where(
            Table.id == table_id,
            Table.restaurant_id == current_user.restaurant_id,
        )
    )
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")

    table.status = _as_backend_table_status(payload.status)
    section_name = await db.scalar(
        select(FloorSection.name).where(
            FloorSection.id == table.section_id,
            FloorSection.restaurant_id == current_user.restaurant_id,
        )
    )
    return WaiterTableResponse(
        id=str(table.id),
        number=table.table_number,
        seats=table.capacity,
        minimum_party_size=table.min_capacity,
        status=_as_waiter_status(
            table.status,
            has_active_order=False,
            has_billing=False,
            has_reservation=False,
        ),
        section_id=str(table.section_id),
        section_name=section_name or "Dining Room",
        shape=table.shape,
        position_x=table.position_x,
        position_y=table.position_y,
        rotation=float(table.rotation or 0),
        width=float(table.width or 1),
        height=float(table.height or 1),
        current_order_id=None,
        occupied_since=None,
        current_total=0,
        guest_count=0,
        item_count=0,
        elapsed_minutes=0,
        item_status_counts=_empty_item_status_counts(),
        reservation=None,
    )


def _extract_tags(payload: dict[str, Any] | None) -> list[str]:
    if payload is None or not isinstance(payload, dict):
        return []
    raw = payload.get("tags")
    if isinstance(raw, list):
        return [str(value) for value in raw]
    raw = payload.get("contains")
    if isinstance(raw, list):
        return [str(value) for value in raw]
    return []


@router.get("/menu", response_model=WaiterMenuResponse)
async def waiter_menu(
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    categories = await get_menu_categories(db, restaurant_id)
    items = await get_menu_items(db, restaurant_id)
    active_categories = [category for category in categories if category.is_active]
    category_map = {category.id: category for category in active_categories}
    modifiers_by_item = await _load_modifier_map(
        db,
        restaurant_id,
        [item.id for item in items],
    )

    waiter_items: list[WaiterMenuItemResponse] = []
    items_by_category: dict[int, list[WaiterMenuItemResponse]] = {}
    for item in items:
        if item.category_id not in category_map:
            continue
        serialized_item = _serialize_waiter_menu_item(item, modifiers_by_item)
        waiter_items.append(serialized_item)
        items_by_category.setdefault(item.category_id, []).append(serialized_item)

    payload: list[WaiterMenuCategoryResponse] = []
    for category in active_categories:
        payload.append(
            WaiterMenuCategoryResponse(
                id=str(category.id),
                name=category.name,
                sort_order=category.sort_order,
                icon=category.icon,
                color=category.color,
                items=items_by_category.get(category.id, []),
            )
        )
    return WaiterMenuResponse(
        categories=[category for category in payload if category.items],
        items=waiter_items,
    )


@router.get("/quick-items", response_model=list[WaiterMenuItemResponse])
async def waiter_quick_items(
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    categories = await get_menu_categories(db, restaurant_id)
    active_category_ids = {category.id for category in categories if category.is_active}
    menu_items = [
        item
        for item in await get_menu_items(db, restaurant_id)
        if item.category_id in active_category_ids and item.is_available
    ]
    if not menu_items:
        return []

    item_ids = [item.id for item in menu_items]
    item_by_id = {item.id: item for item in menu_items}
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    top_rows = await db.execute(
        select(
            OrderItem.menu_item_id,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity_total"),
        )
        .join(TableOrder, TableOrder.id == OrderItem.order_id)
        .where(
            TableOrder.restaurant_id == restaurant_id,
            OrderItem.restaurant_id == restaurant_id,
            OrderItem.menu_item_id.in_(item_ids),
            TableOrder.created_at >= cutoff,
        )
        .group_by(OrderItem.menu_item_id)
        .order_by(func.coalesce(func.sum(OrderItem.quantity), 0).desc(), OrderItem.menu_item_id.asc())
        .limit(8)
    )

    ordered_item_ids: list[int] = []
    for menu_item_id, _quantity_total in top_rows.all():
        item_id = int(menu_item_id)
        if item_id in item_by_id and item_id not in ordered_item_ids:
            ordered_item_ids.append(item_id)

    fallback_items = sorted(
        menu_items,
        key=lambda item: (
            0 if item.is_featured else 1,
            item.name.lower(),
        ),
    )
    for item in fallback_items:
        if item.id not in ordered_item_ids:
            ordered_item_ids.append(item.id)
        if len(ordered_item_ids) >= 8:
            break

    modifiers_by_item = await _load_modifier_map(db, restaurant_id, ordered_item_ids)
    return [
        _serialize_waiter_menu_item(item_by_id[item_id], modifiers_by_item)
        for item_id in ordered_item_ids[:8]
        if item_id in item_by_id
    ]


@router.get("/menu/subcategories/{subcategory_id}/items", response_model=list[WaiterMenuItemResponse])
async def waiter_menu_items(
    subcategory_id: str,
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    raw_category_id = subcategory_id.removeprefix("sub-")
    try:
        category_id = int(raw_category_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Subcategory not found") from exc

    categories = await get_menu_categories(db, current_user.restaurant_id)
    category = next((candidate for candidate in categories if candidate.id == category_id), None)
    if category is None:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    items = [
        item
        for item in await get_menu_items(db, current_user.restaurant_id)
        if item.category_id == category_id
    ]
    modifiers_by_item = await _load_modifier_map(
        db,
        current_user.restaurant_id,
        [item.id for item in items],
    )

    return [
        _serialize_waiter_menu_item(item, modifiers_by_item)
        for item in items
    ]


@router.get("/tables/{table_id}/last-order", response_model=WaiterTableLastOrderResponse)
async def waiter_last_table_order(
    table_id: int,
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    table = await db.scalar(
        select(Table).where(
            Table.id == table_id,
            Table.restaurant_id == restaurant_id,
        )
    )
    if table is None:
        raise HTTPException(status_code=404, detail="Table not found")

    order = await _load_last_table_order(db, restaurant_id, table_id)
    if order is None:
        raise HTTPException(status_code=404, detail="No previous order for this table")

    return await _serialize_last_table_order(db, restaurant_id, order)


@router.post("/orders", response_model=WaiterOrderCreateResponse, status_code=201)
async def waiter_create_order(
    payload: WaiterOrderCreateRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    idempotency_token = set_idempotency_key(idempotency_key)
    claim: IdempotencyClaim | None = None
    restaurant_id = current_user.restaurant_id
    try:
        request_payload = payload.model_dump(mode="json", exclude_none=True)
        claim_or_replay = await WaiterOrderIdempotencyService.claim_or_replay(
            scope=f"rest:{restaurant_id}:waiter-order",
            key=idempotency_key,
            request_payload=request_payload,
            request_source="waiter",
            endpoint="/api/waiter/orders",
        )
        if isinstance(claim_or_replay, IdempotencyReplay):
            return JSONResponse(
                status_code=claim_or_replay.status_code,
                content=claim_or_replay.response,
            )
        if isinstance(claim_or_replay, IdempotencyClaim):
            claim = claim_or_replay

        table = await db.scalar(
            select(Table).where(
                Table.id == int(payload.table_id),
                Table.restaurant_id == restaurant_id,
            )
        )
        if table is None:
            raise HTTPException(status_code=404, detail="Table not found")
        if not payload.items:
            raise HTTPException(status_code=400, detail="Order must contain at least one item")

        table_reservation = await db.scalar(
            select(Reservation).where(
                Reservation.restaurant_id == restaurant_id,
                Reservation.table_id == table.id,
                Reservation.reservation_date == date.today(),
                Reservation.status.in_(["confirmed", "arrived", "seated"]),
            )
        )
        guest_count = (
            payload.guest_count
            or (table_reservation.party_size if table_reservation is not None else None)
            or max(int(table.min_capacity or 1), 1)
        )

        active_session = await db.scalar(
            select(TableSession).where(
                TableSession.restaurant_id == restaurant_id,
                TableSession.table_id == table.id,
                TableSession.status == "active",
            )
        )
        if active_session is None:
            active_session = TableSession(
                restaurant_id=restaurant_id,
                table_id=table.id,
                reservation_id=None,
                started_at=datetime.now(timezone.utc),
                ended_at=None,
                status="active",
                covers=guest_count,
            )
            db.add(active_session)
            await db.flush()
        else:
            active_session.covers = guest_count

        menu_ids = [int(item.menu_item_id) for item in payload.items]
        menu_rows = (
            await db.execute(
                select(MenuItem).where(
                    MenuItem.restaurant_id == restaurant_id,
                    MenuItem.id.in_(menu_ids),
                )
            )
        ).scalars().all()
        menu_by_id = {item.id: item for item in menu_rows}
        if len(menu_by_id) != len(set(menu_ids)):
            raise HTTPException(status_code=400, detail="One or more menu items were not found")

        modifier_ids = {
            int(modifier_id)
            for item in payload.items
            for modifier_id in item.modifier_ids
        }
        modifiers_by_item: dict[int, dict[int, MenuModifier]] = {}
        if modifier_ids:
            modifier_rows = await db.execute(
                select(MenuItemModifier.item_id, MenuModifier)
                .join(MenuModifier, MenuModifier.id == MenuItemModifier.modifier_id)
                .where(
                    MenuItemModifier.item_id.in_(list(set(menu_ids))),
                    MenuModifier.id.in_(list(modifier_ids)),
                    MenuModifier.restaurant_id == restaurant_id,
                )
            )
            for item_id, modifier in modifier_rows.all():
                modifiers_by_item.setdefault(int(item_id), {})[int(modifier.id)] = modifier

        order = await create_billing_order(
            db,
            restaurant_id,
            TableOrderCreate(
                session_id=active_session.id,
                table_id=table.id,
                order_type="dine_in",
                notes=payload.notes,
                guest_name=None,
            ),
        )

        for position, item_request in enumerate(payload.items, start=1):
            menu_item = menu_by_id[int(item_request.menu_item_id)]
            selected_modifiers: list[dict[str, Any]] = []
            modifier_total = 0.0
            for modifier_id in item_request.modifier_ids:
                resolved_modifier = modifiers_by_item.get(menu_item.id, {}).get(int(modifier_id))
                if resolved_modifier is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Modifier {modifier_id} is not valid for menu item {menu_item.id}",
                    )
                modifier_price = float(resolved_modifier.price_adjustment or 0)
                modifier_total += modifier_price
                selected_modifiers.append(
                    {
                        "id": resolved_modifier.id,
                        "name": resolved_modifier.name,
                        "group_name": resolved_modifier.group_name,
                        "price_adjustment": modifier_price,
                    }
                )

            created_item = await add_order_item(
                db,
                restaurant_id,
                order.id,
                OrderItemCreate(
                    menu_item_id=menu_item.id,
                    item_name=menu_item.name,
                    quantity=item_request.quantity,
                    unit_price=round(float(menu_item.price or 0) + modifier_total, 2),
                    modifiers_json={"selected": selected_modifiers} if selected_modifiers else None,
                    notes=item_request.notes,
                ),
            )
            created_item.course_number = position

        order = await send_to_kitchen(db, restaurant_id, order.id)
        table.status = "occupied"

        response_payload = WaiterOrderCreateResponse(
            order_id=str(order.id),
            status="sent_to_kitchen",
            created_at=(
                order.created_at.isoformat()
                if order.created_at
                else datetime.now(timezone.utc).isoformat()
            ),
        ).model_dump(mode="json")

        if claim is None:
            return response_payload

        mark_session_commit_managed(db)
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            await WaiterOrderIdempotencyService.release(
                claim=claim,
                request_source="waiter",
                endpoint="/api/waiter/orders",
                error="waiter_order_commit_failed",
            )
            claim = None
            raise
        await WaiterOrderIdempotencyService.complete_or_log(
            claim=claim,
            response=response_payload,
            status_code=201,
            request_source="waiter",
            endpoint="/api/waiter/orders",
        )
        claim = None
        return JSONResponse(status_code=201, content=response_payload)
    except Exception:
        if claim is not None:
            await WaiterOrderIdempotencyService.release(
                claim=claim,
                request_source="waiter",
                endpoint="/api/waiter/orders",
                error="waiter_order_create_failed",
            )
        raise
    finally:
        reset_idempotency_key(idempotency_token)


@router.post("/orders/{order_id}/payment", response_model=WaiterPaymentResponse)
async def waiter_complete_payment(
    order_id: int,
    payload: WaiterPaymentRequest,
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    order = await get_order_by_id(db, restaurant_id, order_id)

    bill = await db.scalar(
        select(Bill).where(
            Bill.order_id == order.id,
            Bill.restaurant_id == restaurant_id,
        )
    )
    if bill is None:
        bill = await generate_bill(
            db,
            restaurant_id,
            BillCreate(order_id=order.id, tax_rate=0, service_charge=0),
        )

    payment = await create_payment(
        db,
        restaurant_id,
        PaymentCreate(
            bill_id=bill.id,
            amount=payload.amount,
            method=payload.payment_method,
            reference=f"WTR-PAY-{order.id:05d}",
            card_last_four="4242" if payload.payment_method == "card" else None,
            card_brand="visa" if payload.payment_method == "card" else None,
        ),
    )
    await db.refresh(bill)

    if bill.status == "paid":
        if order.table_id is not None:
            table = await db.scalar(
                select(Table).where(
                    Table.id == order.table_id,
                    Table.restaurant_id == restaurant_id,
                )
            )
            if table is not None:
                table.status = "available"

        if order.session_id is not None:
            active_session = await db.scalar(
                select(TableSession).where(
                    TableSession.id == order.session_id,
                    TableSession.restaurant_id == restaurant_id,
                )
            )
            if active_session is not None:
                active_session.status = "closed"
                active_session.ended_at = payment.paid_at

    return WaiterPaymentResponse(
        receipt_id=bill.bill_number,
        status=bill.status,
        amount=payload.amount,
        paid_at=(payment.paid_at or datetime.now(timezone.utc)).isoformat(),
    )
