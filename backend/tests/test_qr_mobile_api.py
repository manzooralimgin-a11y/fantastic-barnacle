from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.menu.models import MenuItem
from app.reservations.models import QRTableCode


@pytest.mark.asyncio(loop_scope="session")
async def test_qr_menu_for_code_returns_table_and_scoped_menu(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="mobile-qr-menu-a",
        is_active=True,
    )
    db_session.add(qr)
    await db_session.flush()

    response = await client.get(f"/api/qr/menu/{qr.code}")

    assert response.status_code == 200
    body = response.json()
    assert body["table"]["table_number"]
    assert body["table"]["section_name"]
    assert body["categories"]
    returned_item_ids = {
        item["id"]
        for category in body["categories"]
        for item in category["items"]
    }
    assert tenant_seed.menu_item_a_id in returned_item_ids
    assert tenant_seed.menu_item_b_id not in returned_item_ids


@pytest.mark.asyncio(loop_scope="session")
async def test_public_restaurant_menu_is_scoped_and_filters_zero_price_items(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    zero_price_item = MenuItem(
        restaurant_id=tenant_seed.restaurant_a_id,
        category_id=(await db_session.get(MenuItem, tenant_seed.menu_item_a_id)).category_id,
        name="Should Not Render",
        price=0,
        cost=0,
        is_available=True,
    )
    db_session.add(zero_price_item)
    await db_session.flush()

    response = await client.get(
        f"/api/public/restaurant/menu?restaurant_id={tenant_seed.restaurant_a_id}"
    )

    assert response.status_code == 200
    body = response.json()
    returned_item_ids = {
        item["id"]
        for category in body["categories"]
        for item in category["items"]
    }
    assert tenant_seed.menu_item_a_id in returned_item_ids
    assert tenant_seed.menu_item_b_id not in returned_item_ids
    assert zero_price_item.id not in returned_item_ids
    assert all(
        item["price"] > 0
        for category in body["categories"]
        for item in category["items"]
    )


@pytest.mark.asyncio(loop_scope="session")
async def test_public_restaurant_order_rejects_zero_price_items(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    menu_item = await db_session.get(MenuItem, tenant_seed.menu_item_a_id)
    zero_price_item = MenuItem(
        restaurant_id=tenant_seed.restaurant_a_id,
        category_id=menu_item.category_id,
        name="Free Item",
        price=0,
        cost=0,
        is_available=True,
    )
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="mobile-qr-no-free-items",
        is_active=True,
    )
    db_session.add_all([zero_price_item, qr])
    await db_session.flush()

    response = await client.post(
        "/api/public/restaurant/order",
        json={
            "table_code": qr.code,
            "guest_name": "No Free Items Guest",
            "items": [
                {
                    "menu_item_id": zero_price_item.id,
                    "quantity": 1,
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid QR code or table"


@pytest.mark.asyncio(loop_scope="session")
async def test_qr_order_status_reports_created_guest_order(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="mobile-qr-order-a",
        is_active=True,
    )
    db_session.add(qr)
    await db_session.flush()

    create_response = await client.post(
        "/api/qr/order",
        json={
            "table_code": qr.code,
            "guest_name": "Mobile Guest",
            "items": [
                {
                    "menu_item_id": tenant_seed.menu_item_a_id,
                    "quantity": 2,
                }
            ],
            "notes": "Two spoons, please",
        },
    )
    assert create_response.status_code == 200
    order_id = create_response.json()["order_id"]

    status_response = await client.get(f"/api/qr/order/{order_id}/status")

    assert status_response.status_code == 200
    body = status_response.json()
    assert body["order_id"] == order_id
    assert body["status"] == "open"
    assert len(body["items"]) == 1
    assert body["items"][0]["menu_item_id"] == tenant_seed.menu_item_a_id
    assert body["items"][0]["status"] == "pending"


@pytest.mark.asyncio(loop_scope="session")
async def test_qr_order_rejects_cross_tenant_menu_item(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="mobile-qr-cross-tenant",
        is_active=True,
    )
    db_session.add(qr)
    await db_session.flush()

    response = await client.post(
        "/api/qr/order",
        json={
            "table_code": qr.code,
            "guest_name": "Mobile Guest",
            "items": [
                {
                    "menu_item_id": tenant_seed.menu_item_b_id,
                    "quantity": 1,
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid QR code or table"


@pytest.mark.asyncio(loop_scope="session")
async def test_qr_order_flows_into_waiter_and_kitchen_views(
    client: AsyncClient,
    tenant_seed,
    db_session: AsyncSession,
) -> None:
    qr = QRTableCode(
        restaurant_id=tenant_seed.restaurant_a_id,
        table_id=tenant_seed.table_a_id,
        code="mobile-qr-live-flow-a",
        is_active=True,
    )
    db_session.add(qr)
    await db_session.flush()

    create_response = await client.post(
        "/api/public/restaurant/order",
        json={
            "table_code": qr.code,
            "guest_name": "Live Flow Guest",
            "items": [
                {
                    "menu_item_id": tenant_seed.menu_item_a_id,
                    "quantity": 1,
                }
            ],
            "notes": "Waiter should see this first",
        },
    )
    assert create_response.status_code == 200
    order_id = create_response.json()["order_id"]

    tenant_headers = {
        "x-test-role": "manager",
        "x-test-restaurant-id": str(tenant_seed.restaurant_a_id),
    }

    live_orders_response = await client.get("/api/billing/orders/live", headers=tenant_headers)
    assert live_orders_response.status_code == 200
    live_orders = live_orders_response.json()
    assert any(order["id"] == order_id for order in live_orders)

    pre_handoff_kds_response = await client.get("/api/billing/kds/orders", headers=tenant_headers)
    assert pre_handoff_kds_response.status_code == 200
    assert not any(order["order_id"] == order_id for order in pre_handoff_kds_response.json())

    send_response = await client.post(
        f"/api/billing/orders/{order_id}/send-to-kitchen",
        headers=tenant_headers,
    )
    assert send_response.status_code == 200
    assert send_response.json()["status"] == "submitted"

    kds_response = await client.get("/api/billing/kds/orders", headers=tenant_headers)
    assert kds_response.status_code == 200
    kds_orders = kds_response.json()
    assert any(order["order_id"] == order_id for order in kds_orders)
