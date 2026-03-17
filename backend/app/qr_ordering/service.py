import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.reservations.models import Table, FloorSection, QRTableCode
from app.menu.models import MenuCategory, MenuItem
from app.billing.models import TableOrder, OrderItem
from app.websockets.connection_manager import manager


async def generate_qr_code(db: AsyncSession, table_id: int) -> QRTableCode:
    """Generate a unique QR code for a table."""
    code = secrets.token_urlsafe(16)
    qr = QRTableCode(table_id=table_id, code=code, is_active=True)
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
    result = await db.execute(
        select(QRTableCode).where(QRTableCode.code == code, QRTableCode.is_active == True)
    )
    qr = result.scalar_one_or_none()
    if not qr:
        return None

    # Update scan count
    qr.scan_count += 1
    qr.last_scanned_at = datetime.now(timezone.utc)
    await db.flush()

    # Get table + section
    table_result = await db.execute(select(Table).where(Table.id == qr.table_id))
    table = table_result.scalar_one_or_none()
    if not table:
        return None

    section_result = await db.execute(select(FloorSection).where(FloorSection.id == table.section_id))
    section = section_result.scalar_one_or_none()

    return {
        "table_number": table.table_number,
        "section_name": section.name if section else "Main",
        "capacity": table.capacity,
    }


async def get_public_menu(db: AsyncSession):
    """Get full menu organized by category (public endpoint)."""
    cat_result = await db.execute(
        select(MenuCategory).where(MenuCategory.is_active == True).order_by(MenuCategory.sort_order)
    )
    categories = list(cat_result.scalars().all())

    item_result = await db.execute(
        select(MenuItem).where(MenuItem.is_available == True).order_by(MenuItem.sort_order)
    )
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


async def submit_qr_order(db: AsyncSession, table_code: str, guest_name: str, items: list, notes: str | None):
    """Submit an order from QR code — creates TableOrder + OrderItems."""
    # Validate QR code
    qr_result = await db.execute(
        select(QRTableCode).where(QRTableCode.code == table_code, QRTableCode.is_active == True)
    )
    qr = qr_result.scalar_one_or_none()
    if not qr:
        return None

    # Get table
    table_result = await db.execute(select(Table).where(Table.id == qr.table_id))
    table = table_result.scalar_one_or_none()
    if not table:
        return None

    # Fetch menu items to calculate total
    item_ids = [i["menu_item_id"] for i in items]
    menu_result = await db.execute(select(MenuItem).where(MenuItem.id.in_(item_ids)))
    menu_items = {mi.id: mi for mi in menu_result.scalars().all()}

    total = 0.0
    for item in items:
        mi = menu_items.get(item["menu_item_id"])
        if mi:
            total += float(mi.price) * item.get("quantity", 1)

    # Create TableOrder
    order = TableOrder(
        table_id=qr.table_id,
        status="pending",
        guest_name=guest_name,
    )
    db.add(order)
    await db.flush()

    # Create OrderItems
    for item in items:
        mi = menu_items.get(item["menu_item_id"])
        if not mi:
            continue
        oi = OrderItem(
            order_id=order.id,
            menu_item_id=item["menu_item_id"],
            quantity=item.get("quantity", 1),
            unit_price=float(mi.price),
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
