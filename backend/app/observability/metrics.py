from __future__ import annotations

import asyncio
import copy
import logging
import time as time_module
from collections import Counter
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict
from urllib.parse import urlparse

from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger("app.observability.metrics")


@dataclass
class RequestSample:
    timestamp: datetime
    path: str
    method: str
    status_code: int
    latency_ms: int


@dataclass
class EndpointStats:
    """Per-endpoint aggregate stats."""

    total_requests: int = 0
    total_errors: int = 0
    total_latency_ms: float = 0
    max_latency_ms: float = 0


@dataclass
class WebSocketStats:
    active_connections: int = 0
    active_channels: int = 0
    total_connections: int = 0
    total_disconnections: int = 0
    total_messages_received: int = 0
    total_broadcasts: int = 0
    total_broadcast_failures: int = 0


@dataclass
class BusinessTimingSample:
    timestamp: datetime
    metric_name: str
    duration_ms: int


@dataclass
class ReservationConflictSample:
    timestamp: datetime
    reservation_type: str
    request_source: str
    endpoint: str
    entity_id: int | str | None
    table_id: int | None
    room_id: str | None
    room_type_id: int | None
    time_range: str | None
    conflict_count: int


@dataclass
class ReservationLockSample:
    timestamp: datetime
    reservation_type: str
    request_source: str
    endpoint: str
    entity_id: int | str | None
    table_id: int | None
    room_id: str | None
    room_type_id: int | None
    wait_ms: int
    contended: bool


@dataclass
class CachedSnapshot:
    expires_at: float = 0.0
    payload: dict[str, Any] | None = None

class ApiMetricsCollector:
    def __init__(self, max_samples: int = 20_000) -> None:
        self._samples: deque[RequestSample] = deque(maxlen=max_samples)
        self._lock = asyncio.Lock()
        self._endpoint_stats: Dict[str, EndpointStats] = {}
        self._total_requests: int = 0
        self._total_errors: int = 0
        self._business_counters: Dict[str, int] = {}
        self._business_timing_samples: deque[BusinessTimingSample] = deque(maxlen=max_samples)
        self._reservation_conflict_samples: deque[ReservationConflictSample] = deque(maxlen=max_samples)
        self._reservation_lock_samples: deque[ReservationLockSample] = deque(maxlen=max_samples)
        self._websocket_stats = WebSocketStats()

    async def record(
        self,
        *,
        path: str,
        method: str,
        status_code: int,
        latency_ms: int,
    ) -> None:
        async with self._lock:
            self._samples.append(
                RequestSample(
                    timestamp=datetime.now(timezone.utc),
                    path=path,
                    method=method,
                    status_code=status_code,
                    latency_ms=latency_ms,
                )
            )
            self._total_requests += 1
            if status_code >= 500:
                self._total_errors += 1

            key = f"{method} {path}"
            stats = self._endpoint_stats.setdefault(key, EndpointStats())
            stats.total_requests += 1
            stats.total_latency_ms += latency_ms
            stats.max_latency_ms = max(stats.max_latency_ms, latency_ms)
            if status_code >= 500:
                stats.total_errors += 1

    async def record_business_event(self, event_name: str, increment: int = 1) -> None:
        async with self._lock:
            self._business_counters[event_name] = (
                self._business_counters.get(event_name, 0) + increment
            )

    async def record_business_timing(self, metric_name: str, duration_ms: int) -> None:
        async with self._lock:
            self._business_timing_samples.append(
                BusinessTimingSample(
                    timestamp=datetime.now(timezone.utc),
                    metric_name=metric_name,
                    duration_ms=max(int(duration_ms), 0),
                )
            )

    async def record_reservation_conflict(
        self,
        *,
        reservation_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int | str | None,
        table_id: int | None,
        room_id: str | None,
        room_type_id: int | None,
        time_range: str | None,
        conflict_count: int,
    ) -> None:
        async with self._lock:
            self._reservation_conflict_samples.append(
                ReservationConflictSample(
                    timestamp=datetime.now(timezone.utc),
                    reservation_type=reservation_type,
                    request_source=request_source,
                    endpoint=endpoint,
                    entity_id=entity_id,
                    table_id=table_id,
                    room_id=room_id,
                    room_type_id=room_type_id,
                    time_range=time_range,
                    conflict_count=max(int(conflict_count), 0),
                )
            )

    async def record_reservation_lock_wait(
        self,
        *,
        reservation_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int | str | None,
        table_id: int | None,
        room_id: str | None,
        room_type_id: int | None,
        wait_ms: int,
        contention_threshold_ms: int,
    ) -> None:
        async with self._lock:
            self._reservation_lock_samples.append(
                ReservationLockSample(
                    timestamp=datetime.now(timezone.utc),
                    reservation_type=reservation_type,
                    request_source=request_source,
                    endpoint=endpoint,
                    entity_id=entity_id,
                    table_id=table_id,
                    room_id=room_id,
                    room_type_id=room_type_id,
                    wait_ms=max(int(wait_ms), 0),
                    contended=int(wait_ms) >= contention_threshold_ms,
                )
            )

    async def record_websocket_connect(
        self,
        *,
        active_connections: int,
        active_channels: int,
    ) -> None:
        async with self._lock:
            self._websocket_stats.total_connections += 1
            self._websocket_stats.active_connections = active_connections
            self._websocket_stats.active_channels = active_channels

    async def record_websocket_disconnect(
        self,
        *,
        active_connections: int,
        active_channels: int,
    ) -> None:
        async with self._lock:
            self._websocket_stats.total_disconnections += 1
            self._websocket_stats.active_connections = active_connections
            self._websocket_stats.active_channels = active_channels

    async def record_websocket_message(self) -> None:
        async with self._lock:
            self._websocket_stats.total_messages_received += 1

    async def record_websocket_broadcast(self, failures: int = 0) -> None:
        async with self._lock:
            self._websocket_stats.total_broadcasts += 1
            self._websocket_stats.total_broadcast_failures += max(failures, 0)

    async def snapshot(self, window_minutes: int = 15) -> dict:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=window_minutes)
        async with self._lock:
            rows = [row for row in self._samples if row.timestamp >= window_start]

        total_requests = len(rows)
        if total_requests == 0:
            return {
                "window_minutes": window_minutes,
                "total_requests": 0,
                "p50_latency_ms": 0.0,
                "p95_latency_ms": 0.0,
                "p99_latency_ms": 0.0,
                "error_rate_pct": 0.0,
                "avg_latency_ms": 0.0,
                "status_distribution": {},
            }

        latencies = sorted(float(row.latency_ms) for row in rows)
        p50_index = max(0, min(len(latencies) - 1, int(len(latencies) * 0.50) - 1))
        p95_index = max(0, min(len(latencies) - 1, int(len(latencies) * 0.95) - 1))
        p99_index = max(0, min(len(latencies) - 1, int(len(latencies) * 0.99) - 1))
        error_count = sum(1 for row in rows if row.status_code >= 500)
        error_rate_pct = (error_count / total_requests) * 100.0
        avg_latency = sum(latencies) / total_requests

        status_dist: Dict[str, int] = {}
        for row in rows:
            bucket = f"{row.status_code // 100}xx"
            status_dist[bucket] = status_dist.get(bucket, 0) + 1

        return {
            "window_minutes": window_minutes,
            "total_requests": total_requests,
            "p50_latency_ms": round(latencies[p50_index], 2),
            "p95_latency_ms": round(latencies[p95_index], 2),
            "p99_latency_ms": round(latencies[p99_index], 2),
            "avg_latency_ms": round(avg_latency, 2),
            "error_rate_pct": round(error_rate_pct, 3),
            "status_distribution": status_dist,
        }

    async def top_endpoints(self, limit: int = 10) -> list[dict]:
        async with self._lock:
            sorted_endpoints = sorted(
                self._endpoint_stats.items(),
                key=lambda x: x[1].total_requests,
                reverse=True,
            )[:limit]

        return [
            {
                "endpoint": key,
                "total_requests": stats.total_requests,
                "avg_latency_ms": round(stats.total_latency_ms / max(stats.total_requests, 1), 2),
                "max_latency_ms": round(stats.max_latency_ms, 2),
                "error_rate_pct": round(
                    (stats.total_errors / max(stats.total_requests, 1)) * 100, 2
                ),
            }
            for key, stats in sorted_endpoints
        ]

    async def slowest_endpoints(self, limit: int = 10) -> list[dict]:
        async with self._lock:
            sorted_endpoints = sorted(
                self._endpoint_stats.items(),
                key=lambda x: x[1].total_latency_ms / max(x[1].total_requests, 1),
                reverse=True,
            )[:limit]

        return [
            {
                "endpoint": key,
                "avg_latency_ms": round(stats.total_latency_ms / max(stats.total_requests, 1), 2),
                "max_latency_ms": round(stats.max_latency_ms, 2),
                "total_requests": stats.total_requests,
            }
            for key, stats in sorted_endpoints
        ]

    async def business_snapshot(self) -> dict[str, int]:
        async with self._lock:
            return dict(sorted(self._business_counters.items()))

    async def websocket_snapshot(self) -> dict[str, int]:
        async with self._lock:
            stats = self._websocket_stats
            return {
                "active_connections": stats.active_connections,
                "active_channels": stats.active_channels,
                "total_connections": stats.total_connections,
                "total_disconnections": stats.total_disconnections,
                "total_messages_received": stats.total_messages_received,
                "total_broadcasts": stats.total_broadcasts,
                "total_broadcast_failures": stats.total_broadcast_failures,
            }

    async def business_timing_snapshot(self, window_minutes: int = 60) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(minutes=window_minutes)
        async with self._lock:
            rows = [row for row in self._business_timing_samples if row.timestamp >= window_start]

        grouped: dict[str, list[int]] = {}
        for row in rows:
            grouped.setdefault(row.metric_name, []).append(row.duration_ms)

        return {
            metric_name: _summarize_durations(values)
            for metric_name, values in sorted(grouped.items())
        }

    async def reservation_conflict_insights(self, window_hours: int = 24) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(hours=window_hours)
        async with self._lock:
            conflicts = [
                row
                for row in self._reservation_conflict_samples
                if row.timestamp >= window_start
            ]
            locks = [
                row
                for row in self._reservation_lock_samples
                if row.timestamp >= window_start and row.contended
            ]

        table_counter = Counter(
            (row.entity_id, row.table_id)
            for row in conflicts
            if row.table_id is not None
        )
        room_counter = Counter(
            (row.entity_id, row.room_id)
            for row in conflicts
            if row.room_id
        )
        room_type_counter = Counter(
            (row.entity_id, row.room_type_id)
            for row in conflicts
            if row.room_type_id is not None
        )
        time_range_counter = Counter(
            (row.reservation_type, row.time_range)
            for row in conflicts
            if row.time_range
        )

        return {
            "top_conflicting_tables": [
                {
                    "entity_id": entity_id,
                    "table_id": table_id,
                    "conflicts": count,
                }
                for (entity_id, table_id), count in table_counter.most_common(10)
            ],
            "top_conflicting_rooms": [
                {
                    "entity_id": entity_id,
                    "room_id": room_id,
                    "conflicts": count,
                }
                for (entity_id, room_id), count in room_counter.most_common(10)
            ],
            "top_conflicting_room_types": [
                {
                    "entity_id": entity_id,
                    "room_type_id": room_type_id,
                    "conflicts": count,
                }
                for (entity_id, room_type_id), count in room_type_counter.most_common(10)
            ],
            "peak_conflict_time_ranges": [
                {
                    "type": reservation_type,
                    "time_range": time_range,
                    "conflicts": count,
                }
                for (reservation_type, time_range), count in time_range_counter.most_common(10)
            ],
            "lock_contention_events": len(locks),
        }

    async def reset(self) -> None:
        async with self._lock:
            self._samples.clear()
            self._endpoint_stats.clear()
            self._total_requests = 0
            self._total_errors = 0
            self._business_counters.clear()
            self._business_timing_samples.clear()
            self._reservation_conflict_samples.clear()
            self._reservation_lock_samples.clear()
            self._websocket_stats = WebSocketStats()
        _celery_snapshot_cache.expires_at = 0.0
        _celery_snapshot_cache.payload = None

    @property
    def total_requests(self) -> int:
        return self._total_requests

    @property
    def total_errors(self) -> int:
        return self._total_errors


api_metrics = ApiMetricsCollector()
_celery_snapshot_cache = CachedSnapshot()
_celery_snapshot_lock = asyncio.Lock()


def _summarize_durations(values: list[int]) -> dict[str, float | int]:
    if not values:
        return {
            "count": 0,
            "avg_ms": 0.0,
            "p95_ms": 0.0,
            "max_ms": 0.0,
        }

    ordered = sorted(values)
    p95_index = max(0, min(len(ordered) - 1, int(len(ordered) * 0.95) - 1))
    return {
        "count": len(ordered),
        "avg_ms": round(sum(ordered) / len(ordered), 2),
        "p95_ms": round(float(ordered[p95_index]), 2),
        "max_ms": round(float(ordered[-1]), 2),
    }


def _queue_name_from_broker_url() -> str:
    return "celery"


def _copy_cached_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    return copy.deepcopy(payload or {})


def _default_celery_snapshot(*, partial: bool = False, source: str = "fallback") -> dict[str, Any]:
    return {
        "broker_status": "unknown",
        "result_backend_status": "unknown",
        "queue_lag": None,
        "worker_count": 0,
        "workers": [],
        "active_tasks": 0,
        "reserved_tasks": 0,
        "scheduled_tasks": 0,
        "partial": partial,
        "source": source,
    }


async def get_queue_lag() -> int | None:
    queue_name = _queue_name_from_broker_url()
    parsed = urlparse(settings.celery_broker_url)
    if parsed.scheme not in {"redis", "rediss"}:
        return None

    timeout_seconds = max(settings.redis_operation_timeout_ms, 1) / 1000.0
    redis_client = Redis.from_url(
        settings.celery_broker_url,
        decode_responses=True,
        socket_timeout=timeout_seconds,
        socket_connect_timeout=timeout_seconds,
        retry_on_timeout=False,
    )
    try:
        lag = await asyncio.wait_for(redis_client.llen(queue_name), timeout=timeout_seconds)
        return int(lag)
    except Exception:
        return None
    finally:
        await redis_client.aclose()


async def _ping_redis(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"redis", "rediss"}:
        return "unsupported"

    timeout_seconds = max(settings.redis_operation_timeout_ms, 1) / 1000.0
    redis_client = Redis.from_url(
        url,
        decode_responses=True,
        socket_timeout=timeout_seconds,
        socket_connect_timeout=timeout_seconds,
        retry_on_timeout=False,
    )
    try:
        await asyncio.wait_for(redis_client.ping(), timeout=timeout_seconds)
        return "connected"
    except Exception:
        return "error"
    finally:
        await redis_client.aclose()


async def _compute_celery_monitor_snapshot() -> dict:
    queue_lag = await get_queue_lag()
    broker_status = await _ping_redis(settings.celery_broker_url)
    result_backend_status = await _ping_redis(settings.celery_result_backend)

    worker_stats: dict | None = None
    active_tasks: dict | None = None
    reserved_tasks: dict | None = None
    scheduled_tasks: dict | None = None

    try:
        from app.shared.celery_app import celery

        inspect = celery.control.inspect(timeout=settings.celery_monitor_timeout_seconds)
        worker_stats = await asyncio.to_thread(lambda: inspect.stats() or {})
        active_tasks = await asyncio.to_thread(lambda: inspect.active() or {})
        reserved_tasks = await asyncio.to_thread(lambda: inspect.reserved() or {})
        scheduled_tasks = await asyncio.to_thread(lambda: inspect.scheduled() or {})
    except Exception:
        worker_stats = {}
        active_tasks = {}
        reserved_tasks = {}
        scheduled_tasks = {}

    def _count_tasks(payload: dict | None) -> int:
        if not payload:
            return 0
        return sum(len(items or []) for items in payload.values())

    return {
        "broker_status": broker_status,
        "result_backend_status": result_backend_status,
        "queue_lag": queue_lag,
        "worker_count": len(worker_stats or {}),
        "workers": sorted((worker_stats or {}).keys()),
        "active_tasks": _count_tasks(active_tasks),
        "reserved_tasks": _count_tasks(reserved_tasks),
        "scheduled_tasks": _count_tasks(scheduled_tasks),
    }


async def get_celery_monitor_snapshot(*, use_cache: bool = False) -> dict:
    now = time_module.monotonic()
    if use_cache and _celery_snapshot_cache.payload is not None and _celery_snapshot_cache.expires_at > now:
        return _copy_cached_payload(_celery_snapshot_cache.payload)

    async with _celery_snapshot_lock:
        now = time_module.monotonic()
        if (
            use_cache
            and _celery_snapshot_cache.payload is not None
            and _celery_snapshot_cache.expires_at > now
        ):
            return _copy_cached_payload(_celery_snapshot_cache.payload)

        try:
            payload = await asyncio.wait_for(
                _compute_celery_monitor_snapshot(),
                timeout=max(settings.metrics_dependency_timeout_ms, 1) / 1000.0,
            )
        except Exception as exc:
            if _celery_snapshot_cache.payload is not None:
                cached = _copy_cached_payload(_celery_snapshot_cache.payload)
                cached["partial"] = True
                cached["source"] = "stale_cache"
                logger.warning("Using cached celery monitor snapshot after failure: %s", exc)
                return cached
            logger.warning("Falling back to partial celery monitor snapshot: %s", exc)
            return _default_celery_snapshot(partial=True, source="timeout")

        payload["partial"] = False
        payload["source"] = "live"
        _celery_snapshot_cache.payload = _copy_cached_payload(payload)
        _celery_snapshot_cache.expires_at = (
            time_module.monotonic() + max(settings.metrics_snapshot_cache_ttl_seconds, 1)
        )
        return _copy_cached_payload(payload)
