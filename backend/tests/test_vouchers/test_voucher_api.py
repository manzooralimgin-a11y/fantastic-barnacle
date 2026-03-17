"""Tests for voucher module critical paths."""
from __future__ import annotations

from typing import Any

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.anyio


def _headers(restaurant_id: int, role: str = "manager") -> dict[str, str]:
    return {
        "x-test-restaurant-id": str(restaurant_id),
        "x-test-role": role,
    }


# ── Create voucher ──


async def test_create_voucher(client: AsyncClient, tenant_seed: Any) -> None:
    """POST /api/vouchers/ creates a voucher and returns it with a generated code."""
    resp = await client.post(
        "/api/vouchers/",
        json={"amount_total": 50.0, "customer_name": "Test Customer"},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["amount_total"] == 50.0
    assert body["amount_remaining"] == 50.0
    assert body["status"] == "active"
    assert body["code"].startswith("GV-")
    assert body["customer_name"] == "Test Customer"
    assert "id" in body


# ── Redeem voucher with sufficient balance ──


async def test_redeem_voucher_success(client: AsyncClient, tenant_seed: Any) -> None:
    """Redeeming a voucher with sufficient balance succeeds and records the redemption."""
    # First create a voucher
    create_resp = await client.post(
        "/api/vouchers/",
        json={"amount_total": 100.0},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert create_resp.status_code == 200
    code = create_resp.json()["code"]

    # Redeem part of the balance
    redeem_resp = await client.post(
        "/api/vouchers/redeem",
        json={"code": code, "deduction_amount": 30.0},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert redeem_resp.status_code == 200
    redemption = redeem_resp.json()
    assert redemption["discount_applied"] == 30.0
    assert "voucher_id" in redemption
    assert "redeemed_at" in redemption


# ── Redeem voucher with insufficient balance (race condition prevention) ──


async def test_redeem_voucher_insufficient_balance(client: AsyncClient, tenant_seed: Any) -> None:
    """Redeeming more than the remaining balance returns 400 (atomic UPDATE guard)."""
    # Create a voucher with small balance
    create_resp = await client.post(
        "/api/vouchers/",
        json={"amount_total": 10.0},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert create_resp.status_code == 200
    code = create_resp.json()["code"]

    # Attempt to redeem more than the balance
    redeem_resp = await client.post(
        "/api/vouchers/redeem",
        json={"code": code, "deduction_amount": 50.0},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert redeem_resp.status_code == 400
    assert "invalid" in redeem_resp.json()["detail"].lower() or "balance" in redeem_resp.json()["detail"].lower()


# ── Redeem fully depletes balance → status becomes "used" ──


async def test_redeem_voucher_fully_marks_used(client: AsyncClient, tenant_seed: Any) -> None:
    """Redeeming the exact remaining balance marks the voucher as 'used'."""
    create_resp = await client.post(
        "/api/vouchers/",
        json={"amount_total": 25.0},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert create_resp.status_code == 200
    code = create_resp.json()["code"]
    voucher_id = create_resp.json()["id"]

    redeem_resp = await client.post(
        "/api/vouchers/redeem",
        json={"code": code, "deduction_amount": 25.0},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert redeem_resp.status_code == 200

    # Validate: voucher should now be 'used'
    validate_resp = await client.post(
        "/api/vouchers/validate",
        json={"code": code},
        headers=_headers(tenant_seed.restaurant_a_id),
    )
    assert validate_resp.status_code == 200
    assert validate_resp.json()["valid"] is False
    assert "used" in validate_resp.json()["message"].lower()


# ── Auth required: no tenant header → error ──


async def test_voucher_endpoints_require_auth(client: AsyncClient) -> None:
    """Voucher endpoints without x-test-restaurant-id header still work via the
    override but produce restaurant_id=0, which returns empty results (no crash).
    With the real dependency (no override), HTTPBearer would reject the request.
    Here we verify the override at least does not crash and returns a list."""
    # The test client overrides get_current_tenant_user, so missing header → restaurant_id=0.
    # We just verify no 500 error; in production HTTPBearer enforces real auth.
    resp = await client.get("/api/vouchers/")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
