import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reservations.models import Table, FloorSection, QRTableCode
from app.menu.models import MenuCategory, MenuItem
from app.billing.models import TableOrder, OrderItem
from app.websockets.connection_manager import manager


async def _get_active_table_context_by_code(db: AsyncSession, code: str):
    result = await db.execute(
        select(QRTableCode).where(QRTableCode.code == code, QRTableCode.is_active == True)
    )
    qr = result.scalar_one_or_none()
    if not qr:
        return None, None, None

    table_result = await db.execute(select(Table).where(Table.id == qr.table_id))
    table = table_result.scalar_one_or_none()
    if not table:
        return qr, None, None

    section_result = await db.execute(select(FloorSection).where(FloorSection.id == table.section_id))
    section = section_result.scalar_one_or_none()
    return qr, table, section


async def generate_qr_code(db: AsyncSession, table_id: int) -> QRTableCode:
    """Generate a unique QR code for a table."""
    table_result = await db.execute(select(Table).where(Table.id == table_id))
    table = table_result.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    if table.restaurant_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Table is missing restaurant scope",
        )
    code = secrets.token_urlsafe(16)
    qr = QRTableCode(
        table_id=table_id,
        restaurant_id=table.restaurant_id,
        code=code,
        is_active=True,
    )
    db.add(qr)
    await db.flush()
    await db.refresh(qr)
    return qr


async def get_qr_codes_for_table(db: AsyncSession, table_id: int) -> list[QRTableCode]:
    result = await db.execute(
        select(QRTableCode).where(QRTableCode.table_id == table_id).order_by(QRTableCode.created_at.desc())
    )
    return list(result.scalars().all())


async def get_table_by_code(db: AsyncSession, code: str):
    """Get table info by QR code (public endpoint)."""
    qr, table, section = await _get_active_table_context_by_code(db, code)
    if not table:
        return None

    qr.scan_count += 1
    qr.last_scanned_at = datetime.now(timezone.utc)
    await db.flush()

    return {
        "table_number": table.table_number,
        "section_name": section.name if section else "Main",
        "capacity": table.capacity,
    }


async def get_public_menu(db: AsyncSession, restaurant_id: int | None = None):
    """Get full menu organized by category (public endpoint)."""
    cat_query = select(MenuCategory).where(MenuCategory.is_active == True).order_by(MenuCategory.sort_order)
    if restaurant_id is not None:
        cat_query = cat_query.where(MenuCategory.restaurant_id == restaurant_id)
    cat_result = await db.execute(cat_query)
    categories = list(cat_result.scalars().all())

    item_query = select(MenuItem).where(MenuItem.is_available == True).order_by(MenuItem.sort_order)
    if restaurant_id is not None:
        item_query = item_query.where(MenuItem.restaurant_id == restaurant_id)
    item_result = await db.execute(item_query)
    items = list(item_result.scalars().all())

    cat_map = {}
    for cat in categories:
        cat_map[cat.id] = {
            "id": cat.id,
            "name": cat.name,
            "items": [],
        }

    for item in items:
        if item.category_id in cat_map:
            allergens = []
            if item.allergens_json and isinstance(item.allergens_json, dict):
                allergens = item.allergens_json.get("tags", [])
            dietary = []
            if item.dietary_tags_json and isinstance(item.dietary_tags_json, dict):
                dietary = item.dietary_tags_json.get("tags", [])

            cat_map[item.category_id]["items"].append({
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "price": float(item.price),
                "category_id": item.category_id,
                "category_name": cat_map[item.category_id]["name"],
                "image_url": item.image_url,
                "is_available": item.is_available,
                "prep_time_min": item.prep_time_min,
                "allergens": allergens,
                "dietary_tags": dietary,
            })

    return [v for v in cat_map.values() if v["items"]]


async def get_public_menu_for_code(db: AsyncSession, code: str):
    _qr, table, _section = await _get_active_table_context_by_code(db, code)
    if not table or table.restaurant_id is None:
        return None
    return await get_public_menu(db, restaurant_id=table.restaurant_id)


async def submit_qr_order(db: AsyncSession, table_code: str, guest_name: str, items: list, notes: str | None):
    """Submit an order from QR code — creates TableOrder + OrderItems."""
    qr, table, _section = await _get_active_table_context_by_code(db, table_code)
    if not table:
        return None
    if table.restaurant_id is None:
        return None

    # Fetch menu items to calculate total
    item_ids = [i["menu_item_id"] for i in items]
    menu_result = await db.execute(
        select(MenuItem).where(
            MenuItem.id.in_(item_ids),
            MenuItem.restaurant_id == table.restaurant_id,
            MenuItem.is_available == True,
        )
    )
    menu_items = {mi.id: mi for mi in menu_result.scalars().all()}
    if len(menu_items) != len(set(item_ids)):
        return None

    total = 0.0
    for item in items:
        mi = menu_items.get(item["menu_item_id"])
        if mi:
            total += float(mi.price) * item.get("quantity", 1)

    # Create TableOrder
    order = TableOrder(
        restaurant_id=table.restaurant_id,
        table_id=qr.table_id,
        order_type="dine_in",
        status="pending",
        guest_name=guest_name,
        notes=notes,
        subtotal=total,
        tax_amount=0,
        total=total,
    )
    db.add(order)
    await db.flush()

    # Create OrderItems
    for item in items:
        mi = menu_items.get(item["menu_item_id"])
        if not mi:
            continue
        quantity = item.get("quantity", 1)
        oi = OrderItem(
            restaurant_id=table.restaurant_id,
            order_id=order.id,
            menu_item_id=item["menu_item_id"],
            item_name=mi.name,
            quantity=quantity,
            unit_price=float(mi.price),
            total_price=float(mi.price) * quantity,
            notes=item.get("notes"),
            status="pending",
        )
        db.add(oi)

    await db.flush()
    await db.refresh(order)

    # Broadcast to KDS via WebSockets
    await manager.broadcast(
        {
            "type": "NEW_ORDER",
            "order_id": order.id,
            "table_number": table.table_number,
            "guest_name": guest_name,
            "total": total,
            "items_count": len(items)
        },
        restaurant_id=table.restaurant_id or 1
    )

    return {
        "order_id": order.id,
        "table_number": table.table_number,
        "status": order.status,
        "items_count": len(items),
        "total": total,
        "message": f"Order placed for table {table.table_number}!",
    }


async def get_order_status(db: AsyncSession, order_id: int):
    """Get order status (public endpoint)."""
    result = await db.execute(select(TableOrder).where(TableOrder.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        return None

    items_result = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id)
    )
    items = list(items_result.scalars().all())

    return {
        "order_id": order.id,
        "status": order.status,
        "items": [
            {
                "id": oi.id,
                "menu_item_id": oi.menu_item_id,
                "quantity": oi.quantity,
                "status": oi.status,
                "notes": oi.notes,
            }
            for oi in items
        ],
    }
