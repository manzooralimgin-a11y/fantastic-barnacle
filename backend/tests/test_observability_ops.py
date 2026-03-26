from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

import app.main as main_module
import app.observability.metrics as metrics_module
from app.config import settings
from app.main import app
from app.observability.alerts import evaluate_alert_thresholds
from app.observability.metrics import api_metrics


@pytest.fixture(autouse=True)
async def reset_observability_metrics():
    await api_metrics.reset()
    yield
    await api_metrics.reset()


@pytest.mark.asyncio
async def test_trace_id_is_derived_from_traceparent(client: AsyncClient) -> None:
    trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
    traceparent = f"00-{trace_id}-00f067aa0ba902b7-01"

    resp = await client.get("/api/health", headers={"traceparent": traceparent})

    assert resp.status_code == 200
    assert resp.headers["x-trace-id"] == trace_id
    assert resp.headers["x-request-id"]


@pytest.mark.asyncio
async def test_canonical_reservation_increments_business_metrics(
    client: AsyncClient,
    tenant_seed,
) -> None:
    reservation_date = (date.today() + timedelta(days=1)).isoformat()
    reservation_resp = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Metrics Guest",
            "guest_email": "metrics@example.com",
            "guest_phone": "123456789",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:30:00",
            "source": "online",
        },
        headers={"x-test-role": "manager", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert reservation_resp.status_code == 201

    metrics_resp = await client.get(
        "/api/metrics",
        headers={"x-test-role": "admin", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )

    assert metrics_resp.status_code == 200
    metrics = metrics_resp.json()
    assert metrics["business_events"]["restaurant_reservations_total"] == 1
    assert metrics["business_events"]["reservation.create.total"] == 1
    assert metrics["business_events"]["reservation.create.success"] == 1
    assert metrics["business_events"]["reservation.create.source.canonical"] == 1
    assert metrics["business_events"]["reservation.availability.check.total"] == 1
    assert metrics["business_events"]["reservation.availability.check.total.source.canonical"] == 1
    assert "reservation.availability.check.duration_ms" in metrics["business_timings"]


@pytest.mark.asyncio
async def test_celery_monitor_snapshot_uses_cache(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = {"count": 0}

    async def fake_compute():
        calls["count"] += 1
        return {
            "broker_status": "connected",
            "result_backend_status": "connected",
            "queue_lag": 0,
            "worker_count": 1,
            "workers": ["worker@test"],
            "active_tasks": 0,
            "reserved_tasks": 0,
            "scheduled_tasks": 0,
        }

    monkeypatch.setattr(metrics_module, "_compute_celery_monitor_snapshot", fake_compute)

    first = await metrics_module.get_celery_monitor_snapshot(use_cache=True)
    second = await metrics_module.get_celery_monitor_snapshot(use_cache=True)

    assert first["broker_status"] == "connected"
    assert second["broker_status"] == "connected"
    assert calls["count"] == 1


@pytest.mark.asyncio
async def test_redis_status_times_out_quickly_under_degradation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class SlowRedis:
        async def ping(self) -> bool:
            await asyncio.sleep(0.05)
            return True

    monkeypatch.setattr(main_module.settings, "redis_operation_timeout_ms", 1)

    async def fake_get_redis():
        return SlowRedis()

    monkeypatch.setattr(main_module, "get_redis", fake_get_redis)

    started = time.perf_counter()
    status, latency_ms = await main_module._redis_status()
    elapsed_ms = (time.perf_counter() - started) * 1000

    assert status == "error"
    assert latency_ms is None
    assert elapsed_ms < 50


@pytest.mark.asyncio
async def test_build_dependency_snapshot_uses_cached_status_for_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = {"database": 0, "redis": 0}

    async def fake_database_status(_db) -> tuple[str, int]:
        calls["database"] += 1
        return "connected", 1

    async def fake_redis_status() -> tuple[str, int]:
        calls["redis"] += 1
        return "connected", 2

    monkeypatch.setattr(main_module, "_database_status", fake_database_status)
    monkeypatch.setattr(main_module, "_redis_status", fake_redis_status)
    monkeypatch.setattr(main_module, "_dependency_status_cache", None)
    monkeypatch.setattr(main_module, "_dependency_status_cache_expires_at", 0.0)

    celery_snapshot = {
        "broker_status": "connected",
        "result_backend_status": "connected",
        "queue_lag": 0,
        "worker_count": 0,
        "workers": [],
        "active_tasks": 0,
        "reserved_tasks": 0,
        "scheduled_tasks": 0,
    }

    first = await main_module._build_dependency_snapshot(
        object(),
        celery_snapshot=celery_snapshot,
        use_cache=True,
    )
    second = await main_module._build_dependency_snapshot(
        object(),
        celery_snapshot=celery_snapshot,
        use_cache=True,
    )

    assert first["database"] == "connected"
    assert second["redis"] == "connected"
    assert calls == {"database": 1, "redis": 1}


@pytest.mark.asyncio
async def test_readiness_returns_not_ready_for_dependency_failures(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_dependency_snapshot(_db, **_kwargs):
        return {
            "database": "error",
            "database_latency_ms": None,
            "redis": "error",
            "redis_latency_ms": None,
            "celery_broker": "error",
            "celery_result_backend": "error",
            "celery": {
                "broker_status": "error",
                "result_backend_status": "error",
                "queue_lag": None,
                "worker_count": 0,
                "workers": [],
                "active_tasks": 0,
                "reserved_tasks": 0,
                "scheduled_tasks": 0,
            },
        }

    monkeypatch.setattr(main_module, "_build_dependency_snapshot", fake_dependency_snapshot)

    resp = await client.get("/api/ready")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["database"] == "error"
    assert body["redis"] == "error"
    assert body["celery_broker"] == "error"


@pytest.mark.asyncio
async def test_websocket_metrics_capture_connection_activity() -> None:
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws/42") as websocket:
            websocket.send_text("ping")
            assert websocket.receive_text() == "pong"

    snapshot = await api_metrics.websocket_snapshot()
    assert snapshot["total_connections"] == 1
    assert snapshot["total_messages_received"] == 1
    assert snapshot["total_disconnections"] == 1
    assert snapshot["active_connections"] == 0


@pytest.mark.asyncio
async def test_conflict_insights_endpoint_surfaces_restaurant_hotspots(
    client: AsyncClient,
    tenant_seed,
) -> None:
    reservation_date = (date.today() + timedelta(days=2)).isoformat()
    first = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Conflict One",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "19:00:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers={"x-test-role": "manager", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert first.status_code == 201

    conflict = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Conflict Two",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "19:30:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers={"x-test-role": "manager", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert conflict.status_code == 409

    insights = await client.get(
        "/internal/reservations/conflict-insights",
        headers={"x-test-role": "admin", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert insights.status_code == 200
    body = insights.json()
    assert "top_conflicting_tables" in body
    assert "top_conflicting_rooms" in body
    assert "top_conflicting_room_types" in body
    assert "peak_conflict_time_ranges" in body
    assert "lock_contention_events" in body
    assert any(
        row["table_id"] == tenant_seed.table_a_id
        for row in body["top_conflicting_tables"]
    )


@pytest.mark.asyncio
async def test_availability_logs_include_debug_fields(
    client: AsyncClient,
    tenant_seed,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="app.reservations.availability")
    reservation_date = (date.today() + timedelta(days=3)).isoformat()

    first = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Log One",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "20:00:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers={"x-test-role": "manager", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Log Two",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "20:15:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers={"x-test-role": "manager", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert second.status_code == 409

    events = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "app.reservations.availability"
    ]
    by_event = {event["event"]: event for event in events if "event" in event}
    assert "reservation_availability_check_started" in by_event
    assert "reservation_conflict_detected" in by_event
    assert "reservation_availability_check_failed" in by_event
    conflict = by_event["reservation_conflict_detected"]
    assert conflict["request_source"] == "canonical"
    assert conflict["endpoint"] == "/api/reservations"
    assert conflict["type"] == "restaurant"
    assert conflict["entity_id"] == tenant_seed.restaurant_a_id
    assert conflict["table_id"] == tenant_seed.table_a_id
    assert conflict["conflict_count"] >= 1
    assert "duration_ms" in conflict
    assert "lock_wait_ms" in conflict


@pytest.mark.asyncio
async def test_slow_availability_logging_can_be_triggered_for_debugging(
    client: AsyncClient,
    tenant_seed,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(main_module.settings, "reservation_availability_slow_ms", 0)
    caplog.set_level(logging.INFO, logger="app.reservations.availability")
    reservation_date = (date.today() + timedelta(days=4)).isoformat()

    resp = await client.post(
        "/api/reservations",
        json={
            "kind": "restaurant",
            "guest_name": "Slow Metrics Guest",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
            "duration_min": 90,
            "table_id": tenant_seed.table_a_id,
        },
        headers={"x-test-role": "manager", "x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert resp.status_code == 201

    events = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.name == "app.reservations.availability"
    ]
    slow_events = [event for event in events if event.get("event") == "reservation_availability_slow"]
    assert slow_events
    assert slow_events[0]["endpoint"] == "/api/reservations"


def test_alert_thresholds_include_reservation_and_integration_failures() -> None:
    alerts = evaluate_alert_thresholds(
        {
            "p95_latency_ms": 0,
            "error_rate_pct": 0,
            "websocket": {},
            "celery": {},
            "dependencies": {},
            "business_events": {
                "reservation.create.failure": settings.reservation_create_failure_threshold,
                "integration.webhook.failure": 1,
                "integration.mcp.failure": 1,
            },
        }
    )

    alert_types = {alert["type"] for alert in alerts}
    assert "reservation_create_failures" in alert_types
    assert "webhook_failures" in alert_types
    assert "mcp_failures" in alert_types


def test_alert_thresholds_include_availability_and_cache_degradation() -> None:
    alerts = evaluate_alert_thresholds(
        {
            "p95_latency_ms": 0,
            "error_rate_pct": 0,
            "websocket": {},
            "celery": {},
            "dependencies": {},
            "business_timings": {
                "availability.query.duration_ms": {
                    "count": 50,
                    "avg_ms": 125.0,
                    "p95_ms": settings.slo_availability_p95_ms_threshold,
                    "max_ms": 900.0,
                }
            },
            "business_events": {
                "reservation.lock.contention": settings.reservation_lock_contention_alert_threshold,
                "availability.cache.redis.failure": 1,
                "availability.cache.circuit_open": 1,
                "availability.cache.hit": 5,
                "availability.cache.miss": 20,
            },
        }
    )

    alert_types = {alert["type"] for alert in alerts}
    assert "availability_latency" in alert_types
    assert "reservation_lock_contention" in alert_types
    assert "availability_cache_backend" in alert_types
    assert "availability_cache_hit_ratio" in alert_types
