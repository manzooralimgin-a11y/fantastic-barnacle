from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

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
    assert body["status"] == "pending"
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
