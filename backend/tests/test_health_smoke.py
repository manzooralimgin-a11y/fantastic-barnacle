"""Smoke tests — verify critical observability endpoints respond correctly."""

import pytest
from httpx import AsyncClient

import app.main as main_module


@pytest.mark.asyncio
async def test_health_endpoint(client: AsyncClient) -> None:
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["database"] in {"connected", "error"}
    assert data["redis"] in {"connected", "error"}
    assert "celery" in data
    assert "websocket" in data
    assert "version" in data


@pytest.mark.asyncio
async def test_metrics_endpoint(client: AsyncClient) -> None:
    resp = await client.get(
        "/api/metrics",
        headers={"x-test-role": "admin", "x-test-restaurant-id": "1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "total_requests_all_time" in data
    assert "top_endpoints" in data
    assert "business_events" in data
    assert "business_timings" in data
    assert "websocket" in data
    assert "celery" in data
    assert "dependencies" in data
    assert "reservation_conflicts" in data
    assert "thresholds" in data
    assert "alerts" in data


@pytest.mark.asyncio
async def test_internal_system_consistency_endpoint(client: AsyncClient) -> None:
    resp = await client.get(
        "/internal/reservations/system-consistency-check",
        headers={"x-test-role": "admin", "x-test-restaurant-id": "1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "counts" in data
    assert "missed_invalidations" in data


@pytest.mark.asyncio
async def test_startup_validation_blocks_when_enforced(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def failing_validation():
        return {"status": "error", "failures": ["redis"]}

    monkeypatch.setattr(
        main_module,
        "_validate_startup_state",
        failing_validation,
    )
    monkeypatch.setattr(main_module.settings, "startup_validation_enforced", True)
    monkeypatch.setattr(main_module, "_is_test_environment", lambda: False)

    with pytest.raises(RuntimeError, match="Startup validation failed"):
        async with main_module.lifespan(main_module.app):
            pass


@pytest.mark.asyncio
async def test_unknown_route_returns_404(client: AsyncClient) -> None:
    resp = await client.get("/api/nonexistent")
    assert resp.status_code in (404, 405)


@pytest.mark.asyncio
async def test_restore_all_removed(client: AsyncClient) -> None:
    """Verify the unauthenticated /restore-all endpoint no longer exists."""
    resp = await client.get("/restore-all")
    assert resp.status_code in (404, 405)
