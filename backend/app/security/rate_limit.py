from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict

from fastapi import Request

from app.config import settings
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.shared.events import get_redis

_WINDOW_SECONDS = 60
_fallback_counters: dict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
_fallback_lock = asyncio.Lock()
logger = logging.getLogger("app.security.rate_limit")


def _timeout_seconds() -> float:
    return max(settings.redis_operation_timeout_ms, 1) / 1000.0


def get_client_identifier(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def get_rate_limit_bucket(
    request: Request,
) -> tuple[str, int, int, str] | None:
    path = request.url.path
    normalized_path = path.rstrip("/") or "/"
    method = request.method.upper()

    if path.startswith("/api/auth/") and method == "POST":
        return (
            "auth",
            max(settings.auth_rate_limit_per_minute // 2, 1),
            settings.auth_rate_limit_per_minute,
            "auth",
        )

    if method == "POST" and path in {
        "/api/qr/order",
        "/api/public/restaurant/order",
    }:
        return (
            "public",
            max(settings.public_rate_limit_per_minute // 3, 1),
            settings.public_rate_limit_per_minute,
            "public_mutation",
        )

    if path.startswith("/api/public/billing/receipt/") and method == "GET":
        return (
            "public",
            max(settings.public_rate_limit_per_minute // 3, 1),
            settings.public_rate_limit_per_minute,
            "public_receipt",
        )

    if normalized_path == "/api/availability" and method == "GET":
        return (
            "availability",
            settings.availability_rate_limit_burst_per_10_seconds,
            settings.availability_rate_limit_per_minute,
            "availability_read",
        )

    if normalized_path == "/api/reservations" and method == "POST":
        return (
            "reservation_write",
            settings.reservation_write_rate_limit_burst_per_10_seconds,
            settings.reservation_write_rate_limit_per_minute,
            "reservation_write",
        )

    return None


async def enforce_rate_limit(request: Request) -> tuple[bool, int]:
    bucket = get_rate_limit_bucket(request)
    if bucket is None:
        return True, 0

    bucket_name, burst_limit, sustained_limit, request_source = bucket
    identifier = get_client_identifier(request)
    allowed, retry_after = await enforce_named_rate_limit(
        bucket_name=bucket_name,
        identifier=identifier,
        limit=sustained_limit,
        burst_limit=burst_limit,
        sustained_limit=sustained_limit,
        request_source=request_source,
    )
    if not allowed:
        await api_metrics.record_business_event("rate_limit.triggered")
        log_event(
            logger,
            logging.WARNING,
            "rate_limit_triggered",
            rate_limit_source=request_source,
            path=request.url.path,
            method=request.method,
            client_id=identifier,
            retry_after=retry_after,
        )
    return allowed, retry_after


async def enforce_named_rate_limit(
    *,
    bucket_name: str,
    identifier: str,
    limit: int,
    burst_limit: int | None = None,
    sustained_limit: int | None = None,
    burst_window_seconds: int = 10,
    sustained_window_seconds: int = _WINDOW_SECONDS,
    request_source: str | None = None,
) -> tuple[bool, int]:
    effective_sustained_limit = sustained_limit or limit
    if burst_limit is None:
        burst_limit = max(effective_sustained_limit // 2, 1)

    try:
        redis = await asyncio.wait_for(get_redis(), timeout=_timeout_seconds())
        checks = [
            ("burst", burst_limit, burst_window_seconds),
            ("sustained", effective_sustained_limit, sustained_window_seconds),
        ]
        retry_after = 0
        for tier_name, tier_limit, window_seconds in checks:
            key = f"rl:{bucket_name}:{identifier}:{tier_name}"
            count = await asyncio.wait_for(redis.incr(key), timeout=_timeout_seconds())
            if count == 1:
                await asyncio.wait_for(
                    redis.expire(key, window_seconds),
                    timeout=_timeout_seconds(),
                )
            if count > tier_limit:
                ttl = await asyncio.wait_for(redis.ttl(key), timeout=_timeout_seconds())
                retry_after = max(ttl, 1) if ttl is not None else 1
                await api_metrics.record_business_event("rate_limit.triggered")
                if request_source:
                    await api_metrics.record_business_event(
                        f"rate_limit.triggered.source.{request_source}"
                    )
                return False, retry_after
        return True, 0
    except Exception:
        # Fallback to in-memory limiter if Redis is unavailable.
        async with _fallback_lock:
            now = time.monotonic()
            checks = [
                ("burst", burst_limit, burst_window_seconds),
                ("sustained", effective_sustained_limit, sustained_window_seconds),
            ]
            for tier_name, tier_limit, window_seconds in checks:
                key = f"rl:{bucket_name}:{identifier}:{tier_name}"
                count, reset_at = _fallback_counters[key]
                if now >= reset_at:
                    count = 0
                    reset_at = now + window_seconds
                count += 1
                _fallback_counters[key] = (count, reset_at)
                if count > tier_limit:
                    await api_metrics.record_business_event("rate_limit.triggered")
                    if request_source:
                        await api_metrics.record_business_event(
                            f"rate_limit.triggered.source.{request_source}"
                        )
                    return False, max(int(reset_at - now), 1)
            return True, 0


async def reset_rate_limit_counters() -> None:
    async with _fallback_lock:
        _fallback_counters.clear()
