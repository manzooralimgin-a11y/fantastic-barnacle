from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient

from app.config import settings
from app.security import rate_limit


@pytest.mark.asyncio
async def test_auth_me_requires_bearer_token(client: AsyncClient) -> None:
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
    body = resp.json()
    assert body["error"] == "Authentication required"
    assert body["detail"] == "Authentication required"
    assert body["status"] == 401
    assert "request_id" in body


@pytest.mark.asyncio
async def test_metrics_with_staff_role_is_forbidden(client: AsyncClient) -> None:
    resp = await client.get("/api/metrics", headers={"x-test-role": "staff", "x-test-restaurant-id": "1"})
    assert resp.status_code == 403
    body = resp.json()
    assert body["error"] == "Insufficient permissions"
    assert body["status"] == 403


@pytest.mark.asyncio
async def test_public_restaurant_reservation_validation(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "restaurant_id": 1,
            "guest_name": "Guest",
            "guest_email": "guest@example.com",
            "guest_phone": "1234567",
            "party_size": 0,
            "reservation_date": "2026-04-01",
            "start_time": "18:00",
        },
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["error"] == "Validation error"
    assert body["status"] == 422


@pytest.mark.asyncio
async def test_public_qr_order_requires_non_empty_items(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/qr/order",
        json={
            "table_code": "T123",
            "guest_name": "Guest",
            "items": [],
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_public_hotel_booking_validation(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "hotel",
            "property_id": 1,
            "room_type_id": 1,
            "guest_name": "Guest",
            "guest_email": "guest@example.com",
            "guest_phone": "1234567",
            "check_in": "2026-04-10",
            "check_out": "2026-04-11",
            "adults": 0,
            "children": 0,
        },
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_readiness_endpoint_reports_dependency_status(client: AsyncClient) -> None:
    resp = await client.get("/api/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["database"] == "connected"
    assert "redis" in body


@pytest.mark.asyncio
async def test_public_order_rate_limit_is_enforced_with_fallback_store(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_redis():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(rate_limit, "get_redis", failing_redis)
    monkeypatch.setattr(settings, "public_rate_limit_per_minute", 1)
    await rate_limit.reset_rate_limit_counters()

    payload = {}
    resp1 = await client.post("/api/public/restaurant/order", json=payload)
    resp2 = await client.post("/api/public/restaurant/order", json=payload)

    assert resp1.status_code == 422
    assert resp2.status_code == 429
    body = resp2.json()
    assert body["error"] == "Too many requests"
    assert body["status"] == 429


@pytest.mark.asyncio
async def test_auth_rate_limit_is_enforced_with_fallback_store(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_redis():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(rate_limit, "get_redis", failing_redis)
    monkeypatch.setattr(settings, "auth_rate_limit_per_minute", 1)
    await rate_limit.reset_rate_limit_counters()

    payload = {}
    resp1 = await client.post("/api/auth/login", json=payload)
    resp2 = await client.post("/api/auth/login", json=payload)

    assert resp1.status_code == 422
    assert resp2.status_code == 429
    body = resp2.json()
    assert body["error"] == "Too many requests"
    assert body["status"] == 429


@pytest.mark.asyncio
async def test_availability_rate_limit_is_enforced_with_fallback_store(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    tenant_seed,
) -> None:
    async def failing_redis():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(rate_limit, "get_redis", failing_redis)
    monkeypatch.setattr(settings, "availability_rate_limit_per_minute", 1)
    await rate_limit.reset_rate_limit_counters()

    params = {
        "restaurant_id": tenant_seed.restaurant_a_id,
        "date": (date.today() + timedelta(days=20)).isoformat(),
        "party_size": 2,
    }
    resp1 = await client.get("/api/availability", params=params)
    resp2 = await client.get("/api/availability", params=params)

    assert resp1.status_code == 200
    assert resp2.status_code == 429
    body = resp2.json()
    assert body["error"] == "Too many requests"
    assert body["status"] == 429
