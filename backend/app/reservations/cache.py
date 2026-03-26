from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import time as time_module
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.shared.events import get_redis

logger = logging.getLogger("app.reservations.cache")

_PENDING_INVALIDATIONS_KEY = "reservation_availability_pending_invalidations"
_AVAILABILITY_PREFIX = "availability"
_AVAILABILITY_EPOCH_KEY = f"{_AVAILABILITY_PREFIX}:version:epoch"
_REDIS_UNAVAILABLE = object()


@dataclass(slots=True)
class _LocalCacheEntry:
    expires_at: float
    payload: dict[str, Any]


@dataclass(slots=True)
class _CircuitState:
    consecutive_failures: int = 0
    open_until: float = 0.0
    last_error: str | None = None


class _LocalAvailabilityFallback:
    def __init__(self) -> None:
        self._entries: dict[str, _LocalCacheEntry] = {}
        self._versions: dict[str, int] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> dict[str, Any] | None:
        now = time_module.monotonic()
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._entries.pop(key, None)
                return None
            return copy.deepcopy(entry.payload)

    async def set(self, key: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        async with self._lock:
            self._entries[key] = _LocalCacheEntry(
                expires_at=time_module.monotonic() + max(ttl_seconds, 1),
                payload=copy.deepcopy(payload),
            )

    async def get_version(self, key: str) -> int:
        async with self._lock:
            return self._versions.get(key, 0)

    async def mget_versions(self, keys: list[str]) -> list[int]:
        async with self._lock:
            return [self._versions.get(key, 0) for key in keys]

    async def increment_version(self, key: str) -> int:
        async with self._lock:
            next_value = self._versions.get(key, 0) + 1
            self._versions[key] = next_value
            return next_value

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()
            self._versions.clear()


def _restaurant_version_key(restaurant_id: int, reservation_date: date) -> str:
    return f"{_AVAILABILITY_PREFIX}:version:restaurant:{restaurant_id}:{reservation_date.isoformat()}"


def _hotel_version_key(property_id: int, day: date) -> str:
    return f"{_AVAILABILITY_PREFIX}:version:hotel:{property_id}:{day.isoformat()}"


def build_restaurant_query_cache_key(
    *,
    restaurant_id: int,
    reservation_date: date,
    party_size: int,
    version: int,
) -> str:
    return (
        f"{_AVAILABILITY_PREFIX}:query:restaurant:{restaurant_id}:"
        f"{reservation_date.isoformat()}:{party_size}:v{max(version, 0)}"
    )


def _iter_hotel_days(check_in: date, check_out: date) -> list[date]:
    days: list[date] = []
    current = check_in
    while current < check_out:
        days.append(current)
        current += timedelta(days=1)
    return days


def build_hotel_query_cache_key(
    *,
    property_id: int,
    check_in: date,
    check_out: date,
    adults: int,
    children: int,
    version_token: str,
) -> str:
    return (
        f"{_AVAILABILITY_PREFIX}:query:hotel:{property_id}:"
        f"{check_in.isoformat()}:{check_out.isoformat()}:{adults}:{children}:v{version_token}"
    )


class AvailabilityCacheStore:
    def __init__(self) -> None:
        self._fallback = _LocalAvailabilityFallback()
        self._redis_circuit = _CircuitState()

    @staticmethod
    def _timeout_seconds() -> float:
        return max(settings.availability_cache_redis_timeout_ms, 1) / 1000.0

    async def _record_fallback(self, exc: Exception, *, operation: str) -> None:
        message = str(exc)
        await api_metrics.record_business_event("availability.cache.redis.failure")
        await api_metrics.record_business_event(
            f"availability.cache.redis.failure.operation.{operation}"
        )
        if message != self._redis_circuit.last_error:
            self._redis_circuit.last_error = message
            log_event(
                logger,
                logging.WARNING,
                "availability_cache_backend_fallback",
                backend="local",
                operation=operation,
                error=message,
            )

    async def _record_redis_failure(self, exc: Exception, *, operation: str) -> None:
        self._redis_circuit.consecutive_failures += 1
        await self._record_fallback(exc, operation=operation)
        if (
            self._redis_circuit.consecutive_failures
            >= settings.availability_cache_redis_failure_threshold
        ):
            self._redis_circuit.open_until = (
                time_module.monotonic() + settings.availability_cache_circuit_cooldown_seconds
            )
            await api_metrics.record_business_event("availability.cache.circuit_open")
            log_event(
                logger,
                logging.ERROR,
                "availability_cache_circuit_open",
                backend="redis",
                operation=operation,
                failure_count=self._redis_circuit.consecutive_failures,
                cooldown_seconds=settings.availability_cache_circuit_cooldown_seconds,
                error=str(exc),
            )
            log_event(
                logger,
                logging.ERROR,
                "circuit_opened",
                component="availability_cache_redis",
                operation=operation,
                failure_count=self._redis_circuit.consecutive_failures,
                cooldown_seconds=settings.availability_cache_circuit_cooldown_seconds,
            )

    async def _record_redis_success(self) -> None:
        if self._redis_circuit.consecutive_failures > 0 or self._redis_circuit.open_until > 0:
            await api_metrics.record_business_event("availability.cache.circuit_recovered")
            log_event(
                logger,
                logging.INFO,
                "availability_cache_circuit_recovered",
                backend="redis",
                previous_failures=self._redis_circuit.consecutive_failures,
            )
            log_event(
                logger,
                logging.INFO,
                "circuit_closed",
                component="availability_cache_redis",
                previous_failures=self._redis_circuit.consecutive_failures,
            )
        self._redis_circuit = _CircuitState()

    def _circuit_open(self) -> bool:
        return time_module.monotonic() < self._redis_circuit.open_until

    async def _redis_client(self, *, operation: str):
        if self._circuit_open():
            await api_metrics.record_business_event("availability.cache.circuit_open")
            log_event(
                logger,
                logging.WARNING,
                "availability_cache_circuit_open_skip",
                backend="redis",
                operation=operation,
                retry_in_ms=max(int((self._redis_circuit.open_until - time_module.monotonic()) * 1000), 0),
            )
            return _REDIS_UNAVAILABLE
        try:
            redis = await asyncio.wait_for(get_redis(), timeout=self._timeout_seconds())
        except Exception as exc:
            await self._record_redis_failure(exc, operation=operation)
            return _REDIS_UNAVAILABLE
        return redis

    async def _call_redis(self, operation: str, func) -> Any:
        redis = await self._redis_client(operation=operation)
        if redis is _REDIS_UNAVAILABLE:
            return _REDIS_UNAVAILABLE
        try:
            result = await asyncio.wait_for(func(redis), timeout=self._timeout_seconds())
        except Exception as exc:
            await self._record_redis_failure(exc, operation=operation)
            return _REDIS_UNAVAILABLE
        await self._record_redis_success()
        return result

    async def _ensure_cache_epoch_raw(self) -> str | None:
        now_iso = datetime.now(timezone.utc).isoformat()

        async def _seed(redis):
            await redis.set(_AVAILABILITY_EPOCH_KEY, now_iso, nx=True)
            return await redis.get(_AVAILABILITY_EPOCH_KEY)

        raw = await self._call_redis("epoch.ensure", _seed)
        if raw is _REDIS_UNAVAILABLE:
            return None
        if raw is None:
            return now_iso
        return str(raw)

    async def get_cache_epoch(self) -> datetime | None:
        raw = await self._call_redis("epoch.get", lambda redis: redis.get(_AVAILABILITY_EPOCH_KEY))
        if raw is _REDIS_UNAVAILABLE:
            return None
        if raw is None:
            raw = await self._ensure_cache_epoch_raw()
        if not raw:
            return None
        try:
            return datetime.fromisoformat(str(raw))
        except ValueError:
            return None

    async def initialize_epoch(self) -> None:
        await self._ensure_cache_epoch_raw()

    async def _increment_with_ttl(self, *, key: str, operation: str) -> int | object:
        async def _run(redis):
            if hasattr(redis, "pipeline"):
                pipeline = redis.pipeline(transaction=True)
                pipeline.incr(key)
                pipeline.expire(key, settings.availability_cache_version_ttl_seconds)
                results = await pipeline.execute()
                return int(results[0])
            version = await redis.incr(key)
            await redis.expire(key, settings.availability_cache_version_ttl_seconds)
            return int(version)

        return await self._call_redis(operation, _run)

    async def _increment_many_with_ttl(
        self,
        *,
        keys: list[str],
        operation: str,
    ) -> list[int] | object:
        if not keys:
            return []

        async def _run(redis):
            if hasattr(redis, "pipeline"):
                pipeline = redis.pipeline(transaction=True)
                for key in keys:
                    pipeline.incr(key)
                    pipeline.expire(key, settings.availability_cache_version_ttl_seconds)
                results = await pipeline.execute()
                return [int(results[index]) for index in range(0, len(results), 2)]

            versions: list[int] = []
            for key in keys:
                versions.append(int(await redis.incr(key)))
                await redis.expire(key, settings.availability_cache_version_ttl_seconds)
            return versions

        return await self._call_redis(operation, _run)

    async def get(self, key: str) -> dict[str, Any] | None:
        cached = await self._call_redis("get", lambda redis: redis.get(key))
        if cached is not _REDIS_UNAVAILABLE:
            if cached is None:
                return None
            return json.loads(cached)
        return None

    async def set(self, key: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        result = await self._call_redis(
            "set",
            lambda redis: redis.set(key, json.dumps(payload), ex=max(ttl_seconds, 1)),
        )
        if result is _REDIS_UNAVAILABLE:
            return

    async def get_restaurant_version(self, restaurant_id: int, reservation_date: date) -> int:
        key = _restaurant_version_key(restaurant_id, reservation_date)
        raw = await self._call_redis("get_version.restaurant", lambda redis: redis.get(key))
        if raw is not _REDIS_UNAVAILABLE:
            return int(raw) if raw is not None else 0
        return 0

    async def get_hotel_version_token(
        self,
        *,
        property_id: int,
        check_in: date,
        check_out: date,
    ) -> str:
        days = _iter_hotel_days(check_in, check_out)
        if not days:
            return "0"
        keys = [_hotel_version_key(property_id, day) for day in days]
        versions: list[int]
        raw_values = await self._call_redis("mget_versions.hotel", lambda redis: redis.mget(keys))
        if raw_values is _REDIS_UNAVAILABLE:
            versions = [0 for _ in keys]
        else:
            versions = [int(raw) if raw is not None else 0 for raw in raw_values]
        token_input = "|".join(
            f"{day.isoformat()}:{version}" for day, version in zip(days, versions, strict=True)
        )
        return hashlib.sha256(token_input.encode("utf-8")).hexdigest()[:16]

    async def get_hotel_versions(
        self,
        *,
        property_id: int,
        check_in: date,
        check_out: date,
    ) -> dict[str, int]:
        days = _iter_hotel_days(check_in, check_out)
        if not days:
            return {}
        keys = [_hotel_version_key(property_id, day) for day in days]
        raw_values = await self._call_redis("mget_versions.hotel", lambda redis: redis.mget(keys))
        if raw_values is _REDIS_UNAVAILABLE:
            versions = [0 for _ in keys]
        else:
            versions = [int(raw) if raw is not None else 0 for raw in raw_values]
        return {
            day.isoformat(): version
            for day, version in zip(days, versions, strict=True)
        }

    async def invalidate_restaurant_scope(
        self,
        *,
        restaurant_id: int,
        reservation_date: date,
        reason: str,
        request_source: str,
        scheduled_at_monotonic: float | None = None,
    ) -> None:
        await self._ensure_cache_epoch_raw()
        key = _restaurant_version_key(restaurant_id, reservation_date)
        version_result = await self._increment_with_ttl(
            key=key,
            operation="invalidate.restaurant",
        )
        version = int(version_result) if version_result is not _REDIS_UNAVAILABLE else 0
        lag_ms = (
            max(int((time_module.perf_counter() - scheduled_at_monotonic) * 1000), 0)
            if scheduled_at_monotonic is not None
            else None
        )

        await self._record_invalidation(
            availability_type="restaurant",
            request_source=request_source,
        )
        log_event(
            logger,
            logging.INFO,
            "availability_cache_invalidation_triggered",
            type="restaurant",
            request_source=request_source,
            entity_id=restaurant_id,
            date=reservation_date.isoformat(),
            reason=reason,
            version=version,
        )
        if lag_ms is not None:
            log_event(
                logger,
                logging.INFO,
                "availability_invalidation_lag_ms",
                type="restaurant",
                request_source=request_source,
                entity_id=restaurant_id,
                date=reservation_date.isoformat(),
                lag_ms=lag_ms,
            )

    async def invalidate_hotel_scope(
        self,
        *,
        property_id: int,
        check_in: date,
        check_out: date,
        reason: str,
        request_source: str,
        scheduled_at_monotonic: float | None = None,
    ) -> None:
        days = _iter_hotel_days(check_in, check_out)
        await self._ensure_cache_epoch_raw()
        keys = [_hotel_version_key(property_id, day) for day in days]
        versions_result = await self._increment_many_with_ttl(
            keys=keys,
            operation="invalidate.hotel",
        )
        versions = (
            [int(version) for version in versions_result]
            if versions_result is not _REDIS_UNAVAILABLE
            else [0 for _ in keys]
        )
        lag_ms = (
            max(int((time_module.perf_counter() - scheduled_at_monotonic) * 1000), 0)
            if scheduled_at_monotonic is not None
            else None
        )

        await self._record_invalidation(
            availability_type="hotel",
            request_source=request_source,
        )
        log_event(
            logger,
            logging.INFO,
            "availability_cache_invalidation_triggered",
            type="hotel",
            request_source=request_source,
            entity_id=property_id,
            check_in=check_in.isoformat(),
            check_out=check_out.isoformat(),
            reason=reason,
            scope_days=len(days),
            latest_version=max(versions, default=1),
        )
        if lag_ms is not None:
            log_event(
                logger,
                logging.INFO,
                "availability_invalidation_lag_ms",
                type="hotel",
                request_source=request_source,
                entity_id=property_id,
                check_in=check_in.isoformat(),
                check_out=check_out.isoformat(),
                lag_ms=lag_ms,
            )

    async def clear(self) -> None:
        await self._fallback.clear()
        self._redis_circuit = _CircuitState()
        redis = await self._redis_client(operation="clear")
        if redis is _REDIS_UNAVAILABLE:
            return
        try:
            keys = [key async for key in redis.scan_iter(match=f"{_AVAILABILITY_PREFIX}:*")]
            if keys:
                await redis.delete(*keys)
            await self._record_redis_success()
        except Exception as exc:
            await self._record_redis_failure(exc, operation="clear")

    @staticmethod
    async def _record_invalidation(*, availability_type: str, request_source: str) -> None:
        await api_metrics.record_business_event("availability.cache.invalidation.total")
        await api_metrics.record_business_event(
            f"availability.cache.invalidation.type.{availability_type}"
        )
        await api_metrics.record_business_event(
            f"availability.cache.invalidation.source.{request_source}"
        )
        await api_metrics.record_business_event("availability.cache.stale_read_avoidance")


availability_cache_store = AvailabilityCacheStore()


def schedule_restaurant_availability_invalidation(
    db: AsyncSession,
    *,
    restaurant_id: int | None,
    reservation_date: date | None,
    reason: str,
    request_source: str,
) -> None:
    if restaurant_id is None or reservation_date is None:
        return
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.setdefault(_PENDING_INVALIDATIONS_KEY, [])
    pending.append(
        (
            "restaurant",
            int(restaurant_id),
            reservation_date.isoformat(),
            reason,
            request_source,
            time_module.perf_counter(),
        )
    )


def schedule_hotel_availability_invalidation(
    db: AsyncSession,
    *,
    property_id: int | None,
    check_in: date | None,
    check_out: date | None,
    reason: str,
    request_source: str,
) -> None:
    if property_id is None or check_in is None or check_out is None:
        return
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.setdefault(_PENDING_INVALIDATIONS_KEY, [])
    pending.append(
        (
            "hotel",
            int(property_id),
            check_in.isoformat(),
            check_out.isoformat(),
            reason,
            request_source,
            time_module.perf_counter(),
        )
    )


def discard_pending_availability_invalidations(db: AsyncSession) -> int:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return 0
    pending = session_info.pop(_PENDING_INVALIDATIONS_KEY, [])
    return len(pending)


async def flush_pending_availability_invalidations(db: AsyncSession) -> None:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.pop(_PENDING_INVALIDATIONS_KEY, [])
    if not pending:
        return

    restaurant_scopes: dict[tuple[int, str], tuple[str, str, float | None]] = {}
    hotel_scopes: dict[tuple[int, str, str], tuple[str, str, float | None]] = {}

    for item in pending:
        if not item:
            continue
        if item[0] == "restaurant":
            _, restaurant_id, reservation_date, reason, request_source, scheduled_at = item
            existing = restaurant_scopes.get((restaurant_id, reservation_date))
            if existing is None or (
                scheduled_at is not None and (existing[2] is None or scheduled_at < existing[2])
            ):
                restaurant_scopes[(restaurant_id, reservation_date)] = (
                    reason,
                    request_source,
                    scheduled_at,
                )
            continue
        _, property_id, check_in, check_out, reason, request_source, scheduled_at = item
        existing = hotel_scopes.get((property_id, check_in, check_out))
        if existing is None or (
            scheduled_at is not None and (existing[2] is None or scheduled_at < existing[2])
        ):
            hotel_scopes[(property_id, check_in, check_out)] = (
                reason,
                request_source,
                scheduled_at,
            )

    for (restaurant_id, reservation_date), (
        reason,
        request_source,
        scheduled_at,
    ) in restaurant_scopes.items():
        try:
            await availability_cache_store.invalidate_restaurant_scope(
                restaurant_id=restaurant_id,
                reservation_date=date.fromisoformat(reservation_date),
                reason=reason,
                request_source=request_source,
                scheduled_at_monotonic=scheduled_at,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "availability_cache_invalidation_failed",
                type="restaurant",
                request_source=request_source,
                entity_id=restaurant_id,
                date=reservation_date,
                reason=reason,
                error=str(exc),
            )

    for (property_id, check_in, check_out), (
        reason,
        request_source,
        scheduled_at,
    ) in hotel_scopes.items():
        try:
            await availability_cache_store.invalidate_hotel_scope(
                property_id=property_id,
                check_in=date.fromisoformat(check_in),
                check_out=date.fromisoformat(check_out),
                reason=reason,
                request_source=request_source,
                scheduled_at_monotonic=scheduled_at,
            )
        except Exception as exc:
            log_event(
                logger,
                logging.ERROR,
                "availability_cache_invalidation_failed",
                type="hotel",
                request_source=request_source,
                entity_id=property_id,
                check_in=check_in,
                check_out=check_out,
                reason=reason,
                error=str(exc),
            )
