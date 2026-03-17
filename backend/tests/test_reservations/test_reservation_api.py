"""Tests for reservation module critical paths."""
from __future__ import annotations

from datetime import date, time, timedelta
from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio


def _headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


# ── Create reservation ──


async def test_create_reservation(client: AsyncClient, tenant_seed: Any) -> None:
    """POST /api/reservations creates a reservation with status 'confirmed'."""
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    resp = await client.post(
        "/api/reservations/",
        json={
            "guest_name": "API Test Guest",
            "party_size": 3,
            "reservation_date": tomorrow,
            "start_time": "19:00:00",
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["guest_name"] == "API Test Guest"
    assert body["party_size"] == 3
    assert body["status"] == "confirmed"
    assert body["table_id"] == tenant_seed.table_a_id
    assert "id" in body


# ── List reservations filtered by tenant ──


async def test_list_reservations_scoped_to_tenant(client: AsyncClient, tenant_seed: Any) -> None:
    """GET /api/reservations returns only reservations belonging to the requesting tenant."""
    resp_a = await client.get(
        "/api/reservations/",
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp_a.status_code == 200
    ids_a = {r["id"] for r in resp_a.json()}
    # The seed created reservation_a for restaurant_a
    assert tenant_seed.reservation_a_id in ids_a
    # reservation_b belongs to restaurant_b and must NOT appear
    assert tenant_seed.reservation_b_id not in ids_a

    # Cross-check: restaurant B sees its own but not A's
    resp_b = await client.get(
        "/api/reservations/",
        headers=_headers(tenant_seed.restaurant_b_id),
    )
    assert resp_b.status_code == 200
    ids_b = {r["id"] for r in resp_b.json()}
    assert tenant_seed.reservation_b_id in ids_b
    assert tenant_seed.reservation_a_id not in ids_b


# ── Auto-assign picks a conflict-free table ──


async def test_auto_assign_picks_conflict_free_table(
    client: AsyncClient, tenant_seed: Any
) -> None:
    """When no table_id is provided, the system auto-assigns a table that has no
    time conflict on the requested date/time."""
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    # First reservation: explicitly assign table_a at 19:00
    resp1 = await client.post(
        "/api/reservations/",
        json={
            "guest_name": "First Guest",
            "party_size": 2,
            "reservation_date": tomorrow,
            "start_time": "19:00:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp1.status_code == 201

    # Second reservation: same time, no table_id → auto-assign should NOT pick table_a
    # (because it conflicts at 19:00). Since table_a is the only table for tenant A in the
    # seed, the auto-assign may not find a table — which is fine; the reservation is
    # still created with table_id=None. We verify it does NOT assign table_a.
    resp2 = await client.post(
        "/api/reservations/",
        json={
            "guest_name": "Second Guest",
            "party_size": 2,
            "reservation_date": tomorrow,
            "start_time": "19:00:00",
            "duration_min": 90,
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp2.status_code == 201
    body2 = resp2.json()
    # Auto-assign must not pick the conflicting table
    assert body2["table_id"] != tenant_seed.table_a_id


# ── Auto-assign succeeds when no conflict ──


async def test_auto_assign_succeeds_when_no_conflict(
    client: AsyncClient, tenant_seed: Any
) -> None:
    """Auto-assign picks the available table when no time conflict exists."""
    far_future = (date.today() + timedelta(days=30)).isoformat()

    resp = await client.post(
        "/api/reservations/",
        json={
            "guest_name": "Solo Guest",
            "party_size": 2,
            "reservation_date": far_future,
            "start_time": "12:00:00",
        },
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 201
    body = resp.json()
    # table_a (capacity 4) should be auto-assigned since no conflict exists
    assert body["table_id"] == tenant_seed.table_a_id


# ── Filter reservations by date ──


async def test_list_reservations_filter_by_date(client: AsyncClient, tenant_seed: Any) -> None:
    """GET /api/reservations?reservation_date=... returns only matching reservations."""
    today = date.today().isoformat()
    resp = await client.get(
        f"/api/reservations/?reservation_date={today}",
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 200
    # The seeded reservation_a has reservation_date = today
    ids = {r["id"] for r in resp.json()}
    assert tenant_seed.reservation_a_id in ids
