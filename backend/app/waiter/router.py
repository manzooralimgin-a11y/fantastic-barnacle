from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.auth.schemas import LoginRequest, RefreshRequest
from app.auth.service import authenticate_user, refresh_tokens
from app.auth.utils import verify_password
from app.billing.models import Bill, OrderItem, Payment, TableOrder
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.menu.models import MenuCategory, MenuItem
from app.reservations.models import Table, TableSession

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
    status: str
    current_order_id: str | None = None
    occupied_since: str | None = None


class WaiterMenuItemResponse(BaseModel):
    id: str
    name: str
    description: str
    price: float
    emoji: str
    is_available: bool
    is_popular: bool
    allergens: list[str] = Field(default_factory=list)


class WaiterMenuSubcategoryResponse(BaseModel):
    id: str
    name: str
    emoji: str
    items: list[WaiterMenuItemResponse] = Field(default_factory=list)


class WaiterMenuCategoryResponse(BaseModel):
    id: str
    name: str
    emoji: str
    color_hex: str
    subcategories: list[WaiterMenuSubcategoryResponse] = Field(default_factory=list)


class WaiterOrderItemRequest(BaseModel):
    menu_item_id: str
    quantity: int = Field(default=1, ge=1, le=99)
    notes: str | None = Field(default=None, max_length=500)


class WaiterOrderCreateRequest(BaseModel):
    table_id: str
    waiter_id: str | None = None
    items: list[WaiterOrderItemRequest] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=500)


class WaiterOrderCreateResponse(BaseModel):
    order_id: str
    status: str
    created_at: str


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


CATEGORY_STYLES: dict[str, tuple[str, str]] = {
    "starters": ("🥗", "#C8A951"),
    "mains": ("🍽️", "#2F7D62"),
    "desserts": ("🍰", "#A76F4E"),
    "drinks": ("🍷", "#4B6CB7"),
}


def _expires_in_seconds() -> int:
    return int(settings.access_token_expire_minutes) * 60


def _as_waiter_status(table_status: str | None, has_active_order: bool) -> str:
    normalized = (table_status or "").strip().lower()
    if has_active_order or normalized in {"occupied", "busy"}:
        return "occupied"
    if normalized in {"reserved", "booked"}:
        return "reserved"
    return "free"


def _as_backend_table_status(waiter_status: str) -> str:
    normalized = waiter_status.strip().lower()
    if normalized == "occupied":
        return "occupied"
    if normalized == "reserved":
        return "reserved"
    return "available"


def _category_style(name: str) -> tuple[str, str]:
    key = "".join(char for char in name.lower() if char.isalnum())
    for candidate, style in CATEGORY_STYLES.items():
        if candidate in key:
            return style
    return "🍽️", "#6B7280"


def _item_emoji(category_name: str, item_name: str) -> str:
    lowered = f"{category_name} {item_name}".lower()
    if "water" in lowered:
        return "💧"
    if "spritz" in lowered or "wine" in lowered:
        return "🍷"
    if "cheese" in lowered or "cake" in lowered or "torte" in lowered:
        return "🍰"
    if "fish" in lowered:
        return "🐟"
    if "risotto" in lowered:
        return "🍄"
    if "sandwich" in lowered:
        return "🥪"
    if "carpaccio" in lowered or "burrata" in lowered:
        return "🥗"
    return _category_style(category_name)[0]


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
    table_rows = (
        await db.execute(
            select(Table)
            .where(Table.restaurant_id == restaurant_id)
            .order_by(Table.table_number.asc())
        )
    ).scalars().all()

    order_rows = (
        await db.execute(
            select(TableOrder)
            .where(
                TableOrder.restaurant_id == restaurant_id,
                TableOrder.table_id.is_not(None),
            )
            .order_by(TableOrder.created_at.desc())
        )
    ).scalars().all()

    latest_order_by_table: dict[int, TableOrder] = {}
    for order in order_rows:
        if order.table_id is None or order.table_id in latest_order_by_table:
            continue
        latest_order_by_table[order.table_id] = order

    payload: list[WaiterTableResponse] = []
    for table in table_rows:
        latest_order = latest_order_by_table.get(table.id)
        has_active_order = latest_order is not None and latest_order.status not in {"paid", "cancelled", "closed"}
        payload.append(
            WaiterTableResponse(
                id=str(table.id),
                number=table.table_number,
                seats=table.capacity,
                status=_as_waiter_status(table.status, has_active_order),
                current_order_id=str(latest_order.id) if has_active_order else None,
                occupied_since=latest_order.created_at.isoformat() if has_active_order and latest_order.created_at else None,
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
    return WaiterTableResponse(
        id=str(table.id),
        number=table.table_number,
        seats=table.capacity,
        status=_as_waiter_status(table.status, False),
        current_order_id=None,
        occupied_since=None,
    )


@router.get("/menu", response_model=list[WaiterMenuCategoryResponse])
async def waiter_menu(
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    categories = (
        await db.execute(
            select(MenuCategory)
            .where(
                MenuCategory.restaurant_id == restaurant_id,
                MenuCategory.is_active.is_(True),
            )
            .order_by(MenuCategory.sort_order.asc(), MenuCategory.id.asc())
        )
    ).scalars().all()

    items = (
        await db.execute(
            select(MenuItem)
            .where(MenuItem.restaurant_id == restaurant_id)
            .order_by(MenuItem.sort_order.asc(), MenuItem.id.asc())
        )
    ).scalars().all()

    items_by_category: dict[int, list[MenuItem]] = {}
    for item in items:
        items_by_category.setdefault(item.category_id, []).append(item)

    payload: list[WaiterMenuCategoryResponse] = []
    for category in categories:
        category_emoji, fallback_color = _category_style(category.name)
        category_items = items_by_category.get(category.id, [])
        subcategory_id = f"sub-{category.id}"
        payload.append(
            WaiterMenuCategoryResponse(
                id=str(category.id),
                name=category.name,
                emoji=category.icon or category_emoji,
                color_hex=category.color or fallback_color,
                subcategories=[
                    WaiterMenuSubcategoryResponse(
                        id=subcategory_id,
                        name=category.name,
                        emoji=category.icon or category_emoji,
                        items=[
                            WaiterMenuItemResponse(
                                id=str(item.id),
                                name=item.name,
                                description=item.description or "",
                                price=float(item.price or 0),
                                emoji=_item_emoji(category.name, item.name),
                                is_available=bool(item.is_available),
                                is_popular=bool(item.is_featured),
                                allergens=list((item.allergens_json or {}).get("contains", [])),
                            )
                            for item in category_items
                        ],
                    )
                ],
            )
        )
    return payload


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

    category = await db.scalar(
        select(MenuCategory).where(
            MenuCategory.id == category_id,
            MenuCategory.restaurant_id == current_user.restaurant_id,
        )
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Subcategory not found")

    items = (
        await db.execute(
            select(MenuItem)
            .where(
                MenuItem.restaurant_id == current_user.restaurant_id,
                MenuItem.category_id == category_id,
            )
            .order_by(MenuItem.sort_order.asc(), MenuItem.id.asc())
        )
    ).scalars().all()

    return [
        WaiterMenuItemResponse(
            id=str(item.id),
            name=item.name,
            description=item.description or "",
            price=float(item.price or 0),
            emoji=_item_emoji(category.name, item.name),
            is_available=bool(item.is_available),
            is_popular=bool(item.is_featured),
            allergens=list((item.allergens_json or {}).get("contains", [])),
        )
        for item in items
    ]


@router.post("/orders", response_model=WaiterOrderCreateResponse, status_code=201)
async def waiter_create_order(
    payload: WaiterOrderCreateRequest,
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
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
            covers=max(len(payload.items), 1),
        )
        db.add(active_session)
        await db.flush()

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
    if len(menu_by_id) != len(menu_ids):
        raise HTTPException(status_code=400, detail="One or more menu items were not found")

    subtotal = 0.0
    order = TableOrder(
        restaurant_id=restaurant_id,
        session_id=active_session.id,
        table_id=table.id,
        server_id=None,
        status="open",
        order_type="dine_in",
        subtotal=0,
        tax_amount=0,
        discount_amount=0,
        tip_amount=0,
        total=0,
        notes=payload.notes,
        guest_name=None,
    )
    db.add(order)
    await db.flush()

    for position, item_request in enumerate(payload.items, start=1):
        menu_item = menu_by_id[int(item_request.menu_item_id)]
        line_total = float(menu_item.price or 0) * item_request.quantity
        subtotal += line_total
        db.add(
            OrderItem(
                restaurant_id=restaurant_id,
                order_id=order.id,
                menu_item_id=menu_item.id,
                item_name=menu_item.name,
                quantity=item_request.quantity,
                unit_price=float(menu_item.price or 0),
                total_price=line_total,
                modifiers_json={},
                # "preparing" matches KDS filter in get_kds_orders(); "sent" was a
                # dead status that never surfaced on the kitchen screen.
                status="preparing",
                notes=item_request.notes,
                sent_to_kitchen_at=datetime.now(timezone.utc),
                station=(menu_item.name.split(" ", 1)[0] or "kitchen").lower(),
                course_number=position,
            )
        )

    order.subtotal = round(subtotal, 2)
    order.tax_amount = round(order.subtotal * 0.07, 2)
    order.total = round(order.subtotal + order.tax_amount, 2)
    table.status = "occupied"

    return WaiterOrderCreateResponse(
        order_id=str(order.id),
        status="sent_to_kitchen",
        created_at=order.created_at.isoformat() if order.created_at else datetime.now(timezone.utc).isoformat(),
    )


@router.post("/orders/{order_id}/payment", response_model=WaiterPaymentResponse)
async def waiter_complete_payment(
    order_id: int,
    payload: WaiterPaymentRequest,
    current_user: User = Depends(_current_restaurant_user),
    db: AsyncSession = Depends(get_db),
):
    restaurant_id = current_user.restaurant_id
    order = await db.scalar(
        select(TableOrder).where(
            TableOrder.id == order_id,
            TableOrder.restaurant_id == restaurant_id,
        )
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    bill = await db.scalar(
        select(Bill).where(
            Bill.order_id == order.id,
            Bill.restaurant_id == restaurant_id,
        )
    )
    if bill is None:
        bill = Bill(
            restaurant_id=restaurant_id,
            order_id=order.id,
            bill_number=f"WTR-BILL-{order.id:05d}",
            subtotal=float(order.subtotal or 0),
            tax_rate=0.07,
            tax_amount=float(order.tax_amount or 0),
            service_charge=0,
            discount_amount=float(order.discount_amount or 0),
            tip_amount=float(order.tip_amount or 0),
            total=float(order.total or payload.amount),
            split_type="none",
            split_count=1,
            status="open",
            receipt_token=f"waiter-{order.id:05d}",
        )
        db.add(bill)
        await db.flush()

    paid_at = datetime.now(timezone.utc)
    payment = Payment(
        restaurant_id=restaurant_id,
        bill_id=bill.id,
        amount=payload.amount,
        method=payload.payment_method,
        reference=f"WTR-PAY-{order.id:05d}",
        tip_amount=float(order.tip_amount or 0),
        status="completed",
        paid_at=paid_at,
        card_last_four="4242" if payload.payment_method == "card" else None,
        card_brand="visa" if payload.payment_method == "card" else None,
    )
    db.add(payment)

    bill.status = "paid"
    bill.paid_at = paid_at
    order.status = "paid"

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
            active_session.ended_at = paid_at

    return WaiterPaymentResponse(
        receipt_id=bill.bill_number,
        status="paid",
        amount=payload.amount,
        paid_at=paid_at.isoformat(),
    )
