from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.billing.models import OrderItem, TableOrder
from app.database import Base
from app.hms.models import HotelProperty, RoomType
from app.reservations.models import QRTableCode


def tenant_headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


def test_phase1_and_hms_tables_keep_scoping_columns() -> None:
    restaurant_scoped = {
        "menu_categories",
        "menu_items",
        "guest_profiles",
        "orders",
        "loyalty_accounts",
        "promotions",
        "floor_sections",
        "tables",
        "reservations",
        "waitlist",
        "qr_table_codes",
        "table_sessions",
        "table_orders",
        "order_items",
        "bills",
        "payments",
        "vendors",
        "inventory_items",
        "purchase_orders",
        "inventory_movements",
        "tva_reports",
        "supplier_catalog_items",
        "auto_purchase_rules",
    }
    property_scoped = {
        "hms_room_types",
        "hms_rooms",
        "hms_reservations",
    }

    for table_name in restaurant_scoped:
        assert "restaurant_id" in Base.metadata.tables[table_name].c

    for table_name in property_scoped:
        assert "property_id" in Base.metadata.tables[table_name].c


@pytest.mark.asyncio(loop_scope="session")
async def test_billing_order_create_rejects_cross_tenant_table_reference(
    client: AsyncClient, tenant_seed: Any
) -> None:
    resp = await client.post(
        "/api/billing/orders",
        json={
            "table_id": tenant_seed.table_b_id,
            "guest_name": "Cross Tenant Billing",
        },
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Table not found"


@pytest.mark.asyncio(loop_scope="session")
async def test_billing_add_order_item_rejects_cross_tenant_menu_item_reference(
    client: AsyncClient, tenant_seed: Any
) -> None:
    resp = await client.post(
        f"/api/billing/orders/{tenant_seed.billing_order_a_id}/items",
        json={
            "menu_item_id": tenant_seed.menu_item_b_id,
            "item_name": "Cross Tenant Item",
            "quantity": 1,
            "unit_price": 10.0,
        },
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Menu item not found"


@pytest.mark.asyncio(loop_scope="session")
async def test_inventory_item_create_rejects_cross_tenant_vendor_reference(
    client: AsyncClient, tenant_seed: Any
) -> None:
    resp = await client.post(
        "/api/inventory/items",
        json={
            "name": "Cross Tenant Inventory",
            "category": "Produce",
            "unit": "kg",
            "vendor_id": tenant_seed.vendor_b_id,
        },
        headers=tenant_headers(tenant_seed.restaurant_a_id),
    )

    assert resp.status_code == 404
    assert resp.json()["detail"] == "Vendor not found"


@pytest.mark.asyncio(loop_scope="session")
async def test_public_qr_order_persists_restaurant_scope(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="tenant-a-qr-order",
        is_active=True,
    )
    db_session.add(qr)
    await db_session.flush()

    resp = await client.post(
        "/api/public/restaurant/order",
        json={
            "table_code": qr.code,
            "guest_name": "QR Guest",
            "items": [
                {
                    "menu_item_id": tenant_seed.menu_item_a_id,
                    "quantity": 2,
                }
            ],
            "notes": "No onions",
        },
    )

    assert resp.status_code == 200
    body = resp.json()

    order = await db_session.scalar(select(TableOrder).where(TableOrder.id == body["order_id"]))
    assert order is not None
    assert order.restaurant_id == tenant_seed.restaurant_a_id
    assert order.table_id == tenant_seed.table_a_id
    assert float(order.total) > 0

    item = await db_session.scalar(select(OrderItem).where(OrderItem.order_id == order.id))
    assert item is not None
    assert item.restaurant_id == tenant_seed.restaurant_a_id
    assert item.menu_item_id == tenant_seed.menu_item_a_id
    assert item.item_name
    assert float(item.total_price) > 0


@pytest.mark.asyncio(loop_scope="session")
async def test_public_qr_order_rejects_cross_tenant_menu_item(
    client: AsyncClient,
    tenant_seed: Any,
    db_session: AsyncSession,
) -> None:
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="tenant-a-invalid-item",
        is_active=True,
    )
    db_session.add(qr)
    await db_session.flush()

    resp = await client.post(
        "/api/public/restaurant/order",
        json={
            "table_code": qr.code,
            "guest_name": "QR Guest",
            "items": [
                {
                    "menu_item_id": tenant_seed.menu_item_b_id,
                    "quantity": 1,
                }
            ],
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid QR code or table"


@pytest.mark.asyncio(loop_scope="session")
async def test_public_hotel_booking_rejects_cross_property_room_type(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_a = HotelProperty(
        name="Property A",
        address="A Street 1",
        city="Berlin",
        country="DE",
    )
    property_b = HotelProperty(
        name="Property B",
        address="B Street 1",
        city="Hamburg",
        country="DE",
    )
    db_session.add_all([property_a, property_b])
    await db_session.flush()

    room_type_b = RoomType(
        property_id=property_b.id,
        name="Suite",
        base_occupancy=2,
        max_occupancy=4,
        base_price=199.0,
    )
    db_session.add(room_type_b)
    await db_session.flush()

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": property_a.id,
            "room_type_id": room_type_b.id,
            "guest_name": "Hotel Guest",
            "guest_email": "hotel@example.com",
            "guest_phone": "1234567",
            "check_in": "2026-04-10",
            "check_out": "2026-04-12",
            "adults": 2,
            "children": 0,
        },
    )

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Room type does not belong to the selected property"
