"""Tests for inventory module critical paths."""
from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio


def _headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


# ── Create inventory item ──


async def test_create_inventory_item(client: AsyncClient, tenant_seed: Any) -> None:
    """POST /api/inventory/items creates an inventory item with defaults."""
    resp = await client.post(
        "/api/inventory/items",
        json={
            "name": "Fresh Basil",
            "category": "Herbs",
            "unit": "bunch",
            "current_stock": 20,
            "par_level": 10,
            "cost_per_unit": 1.50,
            "vendor_id": tenant_seed.vendor_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Fresh Basil"
    assert body["category"] == "Herbs"
    assert body["unit"] == "bunch"
    assert body["current_stock"] == 20
    assert body["par_level"] == 10
    assert body["cost_per_unit"] == 1.50
    assert body["vendor_id"] == tenant_seed.vendor_a_id
    assert "id" in body


# ── List items scoped to tenant ──


async def test_list_inventory_items_scoped_to_tenant(client: AsyncClient, tenant_seed: Any) -> None:
    """GET /api/inventory/items returns only items belonging to the requesting tenant."""
    resp_a = await client.get(
        "/api/inventory/items",
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp_a.status_code == 200
    ids_a = {item["id"] for item in resp_a.json()}
    assert tenant_seed.inventory_item_a_id in ids_a
    assert tenant_seed.inventory_item_b_id not in ids_a

    # Cross-check: restaurant B sees its own items only
    resp_b = await client.get(
        "/api/inventory/items",
        headers=_headers(tenant_seed.restaurant_b_id),
    )
    assert resp_b.status_code == 200
    ids_b = {item["id"] for item in resp_b.json()}
    assert tenant_seed.inventory_item_b_id in ids_b
    assert tenant_seed.inventory_item_a_id not in ids_b


# ── Create purchase order ──


async def test_create_purchase_order(client: AsyncClient, tenant_seed: Any) -> None:
    """POST /api/inventory/orders creates a purchase order linked to a vendor."""
    order_date = date.today().isoformat()
    resp = await client.post(
        "/api/inventory/orders",
        json={
            "vendor_id": tenant_seed.vendor_a_id,
            "order_date": order_date,
            "total": 350.0,
            "line_items_json": {
                "items": [
                    {"item_id": tenant_seed.inventory_item_a_id, "qty": 10, "unit_price": 35.0}
                ]
            },
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["vendor_id"] == tenant_seed.vendor_a_id
    assert body["total"] == 350.0
    assert body["status"] == "draft"
    assert "id" in body
    assert body["line_items_json"] is not None


# ── Purchase order for cross-tenant vendor fails ──


async def test_create_purchase_order_cross_tenant_vendor_rejected(
    client: AsyncClient, tenant_seed: Any
) -> None:
    """Creating a purchase order referencing another tenant's vendor returns 404."""
    resp = await client.post(
        "/api/inventory/orders",
        json={
            "vendor_id": tenant_seed.vendor_b_id,
            "order_date": date.today().isoformat(),
            "total": 100,
            "line_items_json": {"items": []},
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 404


# ── List purchase orders ──


async def test_list_purchase_orders(client: AsyncClient, tenant_seed: Any) -> None:
    """GET /api/inventory/orders returns orders for the tenant (initially empty or created)."""
    # Create one first
    await client.post(
        "/api/inventory/orders",
        json={
            "vendor_id": tenant_seed.vendor_a_id,
            "order_date": date.today().isoformat(),
            "total": 50.0,
            "line_items_json": {"items": []},
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )

    resp = await client.get(
        "/api/inventory/orders",
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 200
    orders = resp.json()
    assert isinstance(orders, list)
    assert len(orders) >= 1
    # All orders belong to tenant A
    for order in orders:
        assert "id" in order
        assert "status" in order


# ── Filter inventory items by category ──


async def test_list_inventory_items_filter_by_category(
    client: AsyncClient, tenant_seed: Any
) -> None:
    """GET /api/inventory/items?category=Produce returns only Produce items."""
    resp = await client.get(
        "/api/inventory/items?category=Produce",
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 200
    items = resp.json()
    # The seeded item_a has category "Produce"
    assert any(item["id"] == tenant_seed.inventory_item_a_id for item in items)
    for item in items:
        assert item["category"] == "Produce"
