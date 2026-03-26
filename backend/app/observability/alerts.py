import logging
from typing import Any

from app.config import settings
from app.observability.logging import log_event

logger = logging.getLogger("app.observability.alerts")


async def trigger_alert(
    alert_type: str,
    severity: str,
    message: str,
    context: dict[str, Any] | None = None,
) -> None:
    payload = {
        "alert_type": alert_type,
        "severity": severity,
        "message": message,
        "context": context or {},
    }

    log_event(
        logger,
        logging.ERROR if severity == "critical" else logging.WARNING,
        "system_alert",
        **payload,
    )


def evaluate_alert_thresholds(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    alerts: list[dict[str, Any]] = []

    p95_latency = float(snapshot.get("p95_latency_ms") or 0)
    error_rate_pct = float(snapshot.get("error_rate_pct") or 0)
    business_events = snapshot.get("business_events") or {}
    websocket = snapshot.get("websocket") or {}
    celery = snapshot.get("celery") or {}
    dependencies = snapshot.get("dependencies") or {}
    business_timings = snapshot.get("business_timings") or {}

    if p95_latency >= settings.slo_api_p95_ms_critical_threshold:
        alerts.append(
            {
                "type": "api_latency",
                "severity": "critical",
                "message": (
                    f"API p95 latency {p95_latency}ms exceeded "
                    f"{settings.slo_api_p95_ms_critical_threshold}ms"
                ),
            }
        )
    elif p95_latency >= settings.slo_api_p95_ms_threshold:
        alerts.append(
            {
                "type": "api_latency",
                "severity": "warning",
                "message": (
                    f"API p95 latency {p95_latency}ms exceeded "
                    f"{settings.slo_api_p95_ms_threshold}ms"
                ),
            }
        )

    if error_rate_pct >= settings.slo_error_rate_pct_critical_threshold:
        alerts.append(
            {
                "type": "api_error_rate",
                "severity": "critical",
                "message": (
                    f"API error rate {error_rate_pct}% exceeded "
                    f"{settings.slo_error_rate_pct_critical_threshold}%"
                ),
            }
        )
    elif error_rate_pct >= settings.slo_error_rate_pct_threshold:
        alerts.append(
            {
                "type": "api_error_rate",
                "severity": "warning",
                "message": (
                    f"API error rate {error_rate_pct}% exceeded "
                    f"{settings.slo_error_rate_pct_threshold}%"
                ),
            }
        )

    queue_lag = celery.get("queue_lag")
    if isinstance(queue_lag, int):
        if queue_lag >= settings.slo_queue_lag_critical_threshold:
            alerts.append(
                {
                    "type": "celery_queue_lag",
                    "severity": "critical",
                    "message": (
                        f"Celery queue lag {queue_lag} exceeded "
                        f"{settings.slo_queue_lag_critical_threshold}"
                    ),
                }
            )
        elif queue_lag >= settings.slo_queue_lag_threshold:
            alerts.append(
                {
                    "type": "celery_queue_lag",
                    "severity": "warning",
                    "message": (
                        f"Celery queue lag {queue_lag} exceeded "
                        f"{settings.slo_queue_lag_threshold}"
                    ),
                }
            )

    broadcast_failures = int(websocket.get("total_broadcast_failures") or 0)
    if broadcast_failures >= settings.websocket_broadcast_failure_threshold:
        alerts.append(
            {
                "type": "websocket_broadcast_failures",
                "severity": "warning",
                "message": (
                    f"WebSocket broadcast failures {broadcast_failures} exceeded "
                    f"{settings.websocket_broadcast_failure_threshold}"
                ),
            }
        )

    for dependency_name in ("database", "redis", "celery_broker", "celery_result_backend"):
        if dependencies.get(dependency_name) == "error":
            alerts.append(
                {
                    "type": f"{dependency_name}_unhealthy",
                    "severity": "critical",
                    "message": f"{dependency_name} is unavailable",
                }
            )

    reservation_failures = int(business_events.get("reservation.create.failure") or 0)
    if reservation_failures >= settings.reservation_create_failure_threshold:
        alerts.append(
            {
                "type": "reservation_create_failures",
                "severity": "warning",
                "message": (
                    f"Reservation create failures {reservation_failures} exceeded "
                    f"{settings.reservation_create_failure_threshold}"
                ),
            }
        )

    availability_timing = business_timings.get("availability.query.duration_ms") or {}
    availability_p95 = float(availability_timing.get("p95_ms") or 0)
    if availability_p95 >= settings.slo_availability_p95_ms_critical_threshold:
        alerts.append(
            {
                "type": "availability_latency",
                "severity": "critical",
                "message": (
                    f"Availability p95 latency {availability_p95}ms exceeded "
                    f"{settings.slo_availability_p95_ms_critical_threshold}ms"
                ),
            }
        )
    elif availability_p95 >= settings.slo_availability_p95_ms_threshold:
        alerts.append(
            {
                "type": "availability_latency",
                "severity": "warning",
                "message": (
                    f"Availability p95 latency {availability_p95}ms exceeded "
                    f"{settings.slo_availability_p95_ms_threshold}ms"
                ),
            }
        )

    lock_contention = int(business_events.get("reservation.lock.contention") or 0)
    if lock_contention >= settings.reservation_lock_contention_alert_threshold:
        alerts.append(
            {
                "type": "reservation_lock_contention",
                "severity": "warning",
                "message": (
                    f"Reservation lock contention {lock_contention} exceeded "
                    f"{settings.reservation_lock_contention_alert_threshold}"
                ),
            }
        )

    redis_failures = int(business_events.get("availability.cache.redis.failure") or 0)
    cache_circuit_opens = int(business_events.get("availability.cache.circuit_open") or 0)
    if redis_failures > 0 or cache_circuit_opens > 0:
        alerts.append(
            {
                "type": "availability_cache_backend",
                "severity": "warning" if cache_circuit_opens == 0 else "critical",
                "message": (
                    "Availability cache backend degraded: "
                    f"redis_failures={redis_failures}, circuit_opens={cache_circuit_opens}"
                ),
            }
        )

    cache_hits = int(business_events.get("availability.cache.hit") or 0)
    cache_misses = int(business_events.get("availability.cache.miss") or 0)
    cache_queries = cache_hits + cache_misses
    if cache_queries >= settings.availability_cache_min_queries_for_alert:
        hit_ratio = cache_hits / max(cache_queries, 1)
        if hit_ratio < settings.availability_cache_hit_ratio_warning_threshold:
            alerts.append(
                {
                    "type": "availability_cache_hit_ratio",
                    "severity": "warning",
                    "message": (
                        f"Availability cache hit ratio {hit_ratio:.2%} fell below "
                        f"{settings.availability_cache_hit_ratio_warning_threshold:.0%}"
                    ),
                }
            )

    webhook_failures = int(
        (business_events.get("integration.webhook.failure") or 0)
        + (business_events.get("integration.webhook.processing_failure") or 0)
    )
    if webhook_failures > 0:
        alerts.append(
            {
                "type": "webhook_failures",
                "severity": "critical",
                "message": f"VoiceBooker webhook failures detected: {webhook_failures}",
            }
        )

    mcp_failures = int(business_events.get("integration.mcp.failure") or 0)
    if mcp_failures > 0:
        alerts.append(
            {
                "type": "mcp_failures",
                "severity": "critical",
                "message": f"VoiceBooker MCP failures detected: {mcp_failures}",
            }
        )

    consistency_violations = int(business_events.get("reservation.consistency.violation") or 0)
    if consistency_violations > 0:
        alerts.append(
            {
                "type": "reservation_consistency",
                "severity": "critical",
                "message": f"Reservation consistency violations detected: {consistency_violations}",
            }
        )

    idempotency_failures = int(
        (business_events.get("reservation.idempotency.backend_failure") or 0)
        + (business_events.get("reservation.idempotency.finalize_failure") or 0)
    )
    if idempotency_failures > 0:
        alerts.append(
            {
                "type": "reservation_idempotency",
                "severity": "warning",
                "message": f"Reservation idempotency backend issues detected: {idempotency_failures}",
            }
        )

    mcp_circuit_opens = int(business_events.get("integration.mcp.circuit_open") or 0)
    if mcp_circuit_opens > 0:
        alerts.append(
            {
                "type": "mcp_circuit",
                "severity": "critical",
                "message": f"MCP overload circuit opened {mcp_circuit_opens} time(s)",
            }
        )

    return alerts
