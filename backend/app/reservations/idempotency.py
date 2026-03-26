from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

from app.config import settings
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.shared.events import get_redis

logger = logging.getLogger("app.reservations.idempotency")

_IDEMPOTENCY_PREFIX = "reservation:idempotency"


@dataclass(slots=True)
class IdempotencyReplay:
    response: dict[str, Any]
    status_code: int
    reservation_kind: str | None


@dataclass(slots=True)
class IdempotencyClaim:
    redis_key: str
    request_hash: str


def _timeout_seconds() -> float:
    return max(settings.redis_operation_timeout_ms, 1) / 1000.0


def normalize_idempotency_key(value: str | None) -> str | None:
    candidate = (value or "").strip()
    if not candidate:
        return None
    if len(candidate) > 128:
        raise HTTPException(status_code=400, detail="Idempotency-Key is too long")
    return candidate


def build_request_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class ReservationIdempotencyService:
    @classmethod
    def redis_key(cls, *, scope: str, key: str) -> str:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return f"{_IDEMPOTENCY_PREFIX}:{scope}:{digest}"

    @classmethod
    async def claim_or_replay(
        cls,
        *,
        scope: str,
        key: str | None,
        request_payload: dict[str, Any],
        request_source: str,
        endpoint: str,
    ) -> IdempotencyClaim | IdempotencyReplay | None:
        normalized_key = normalize_idempotency_key(key)
        if normalized_key is None:
            return None

        await api_metrics.record_business_event("reservation.idempotency.request")
        request_hash = build_request_hash(request_payload)
        redis = await cls._redis()
        redis_key = cls.redis_key(scope=scope, key=normalized_key)
        pending_payload = {
            "status": "pending",
            "request_hash": request_hash,
            "request_source": request_source,
            "endpoint": endpoint,
        }
        claimed = await cls._redis_call(
            redis.set(
                redis_key,
                json.dumps(pending_payload),
                ex=settings.reservation_idempotency_pending_ttl_seconds,
                nx=True,
            )
        )
        if claimed:
            await api_metrics.record_business_event("reservation.idempotency.miss")
            log_event(
                logger,
                logging.INFO,
                "reservation_idempotency_claimed",
                scope=scope,
                request_source=request_source,
                endpoint=endpoint,
            )
            return IdempotencyClaim(redis_key=redis_key, request_hash=request_hash)

        replay = await cls._wait_for_existing_result(
            redis=redis,
            redis_key=redis_key,
            request_hash=request_hash,
            request_source=request_source,
            endpoint=endpoint,
            scope=scope,
        )
        if replay is not None:
            return replay

        raise HTTPException(
            status_code=409,
            detail="Request with this Idempotency-Key is already being processed",
        )

    @classmethod
    async def complete(
        cls,
        *,
        claim: IdempotencyClaim,
        response: dict[str, Any],
        status_code: int,
        reservation_kind: str | None,
        request_source: str,
        endpoint: str,
    ) -> None:
        redis = await cls._redis()
        payload = {
            "status": "completed",
            "request_hash": claim.request_hash,
            "request_source": request_source,
            "endpoint": endpoint,
            "status_code": status_code,
            "reservation_kind": reservation_kind,
            "response": response,
        }
        await cls._redis_call(
            redis.set(
                claim.redis_key,
                json.dumps(payload),
                ex=settings.reservation_idempotency_ttl_seconds,
            )
        )
        await api_metrics.record_business_event("reservation.idempotency.completed")
        log_event(
            logger,
            logging.INFO,
            "reservation_idempotency_recorded",
            request_source=request_source,
            endpoint=endpoint,
            reservation_kind=reservation_kind,
            status_code=status_code,
        )

    @classmethod
    async def complete_or_log(
        cls,
        *,
        claim: IdempotencyClaim | None,
        response: dict[str, Any],
        status_code: int,
        reservation_kind: str | None,
        request_source: str,
        endpoint: str,
    ) -> None:
        if claim is None:
            return
        try:
            await cls.complete(
                claim=claim,
                response=response,
                status_code=status_code,
                reservation_kind=reservation_kind,
                request_source=request_source,
                endpoint=endpoint,
            )
        except Exception as exc:
            await api_metrics.record_business_event("reservation.idempotency.finalize_failure")
            log_event(
                logger,
                logging.ERROR,
                "reservation_idempotency_finalize_failed",
                request_source=request_source,
                endpoint=endpoint,
                reservation_kind=reservation_kind,
                error=str(exc),
            )

    @classmethod
    async def release(
        cls,
        *,
        claim: IdempotencyClaim | None,
        request_source: str,
        endpoint: str,
        error: str,
    ) -> None:
        if claim is None:
            return
        try:
            redis = await cls._redis()
            raw = await cls._redis_call(redis.get(claim.redis_key))
            if raw:
                data = cls._parse_record(raw)
                if (
                    data.get("status") == "pending"
                    and data.get("request_hash") == claim.request_hash
                ):
                    await cls._redis_call(redis.delete(claim.redis_key))
            await api_metrics.record_business_event("reservation.idempotency.released")
            log_event(
                logger,
                logging.WARNING,
                "reservation_idempotency_released",
                request_source=request_source,
                endpoint=endpoint,
                error=error,
            )
        except Exception:
            logger.debug("Failed to release idempotency claim", exc_info=True)

    @classmethod
    async def _wait_for_existing_result(
        cls,
        *,
        redis,
        redis_key: str,
        request_hash: str,
        request_source: str,
        endpoint: str,
        scope: str,
    ) -> IdempotencyClaim | IdempotencyReplay | None:
        started = asyncio.get_running_loop().time()
        while True:
            raw = await cls._redis_call(redis.get(redis_key))
            if raw is None:
                claimed = await cls._redis_call(
                    redis.set(
                        redis_key,
                        json.dumps(
                            {
                                "status": "pending",
                                "request_hash": request_hash,
                                "request_source": request_source,
                                "endpoint": endpoint,
                            }
                        ),
                        ex=settings.reservation_idempotency_pending_ttl_seconds,
                        nx=True,
                    )
                )
                if claimed:
                    await api_metrics.record_business_event("reservation.idempotency.miss")
                    return IdempotencyClaim(redis_key=redis_key, request_hash=request_hash)
                continue

            record = cls._parse_record(raw)
            if record.get("request_hash") != request_hash:
                await api_metrics.record_business_event("reservation.idempotency.conflict")
                log_event(
                    logger,
                    logging.WARNING,
                    "reservation_idempotency_conflict",
                    scope=scope,
                    request_source=request_source,
                    endpoint=endpoint,
                )
                raise HTTPException(
                    status_code=409,
                    detail="Idempotency-Key is already used for a different request",
                )

            if record.get("status") == "completed":
                await api_metrics.record_business_event("reservation.idempotency.hit")
                wait_ms = int((asyncio.get_running_loop().time() - started) * 1000)
                await api_metrics.record_business_timing(
                    "reservation.idempotency.wait_ms",
                    wait_ms,
                )
                log_event(
                    logger,
                    logging.INFO,
                    "reservation_idempotency_hit",
                    scope=scope,
                    request_source=request_source,
                    endpoint=endpoint,
                    wait_ms=wait_ms,
                    status_code=int(record.get("status_code") or 200),
                    reservation_kind=record.get("reservation_kind"),
                )
                response = record.get("response")
                if not isinstance(response, dict):
                    raise HTTPException(
                        status_code=503,
                        detail="Idempotency service returned an invalid stored response",
                    )
                return IdempotencyReplay(
                    response=response,
                    status_code=int(record.get("status_code") or 200),
                    reservation_kind=record.get("reservation_kind"),
                )

            await api_metrics.record_business_event("reservation.idempotency.wait")
            elapsed_ms = int((asyncio.get_running_loop().time() - started) * 1000)
            if elapsed_ms >= settings.reservation_idempotency_max_wait_ms:
                log_event(
                    logger,
                    logging.WARNING,
                    "reservation_idempotency_inflight_timeout",
                    scope=scope,
                    request_source=request_source,
                    endpoint=endpoint,
                    wait_ms=elapsed_ms,
                )
                return None
            await asyncio.sleep(
                max(settings.reservation_idempotency_poll_interval_ms, 1) / 1000.0
            )

    @staticmethod
    def _parse_record(raw: str) -> dict[str, Any]:
        try:
            parsed = json.loads(raw)
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail="Idempotency service returned an invalid record",
            ) from exc
        if not isinstance(parsed, dict):
            raise HTTPException(
                status_code=503,
                detail="Idempotency service returned an invalid record",
            )
        return parsed

    @staticmethod
    async def _redis() -> Any:
        try:
            return await asyncio.wait_for(get_redis(), timeout=_timeout_seconds())
        except Exception as exc:
            await api_metrics.record_business_event("reservation.idempotency.backend_failure")
            log_event(
                logger,
                logging.ERROR,
                "reservation_idempotency_backend_unavailable",
                error=str(exc),
            )
            raise HTTPException(
                status_code=503,
                detail="Reservation idempotency service unavailable",
            ) from exc

    @staticmethod
    async def _redis_call(awaitable):
        try:
            return await asyncio.wait_for(awaitable, timeout=_timeout_seconds())
        except HTTPException:
            raise
        except Exception as exc:
            await api_metrics.record_business_event("reservation.idempotency.backend_failure")
            log_event(
                logger,
                logging.ERROR,
                "reservation_idempotency_backend_unavailable",
                error=str(exc),
            )
            raise HTTPException(
                status_code=503,
                detail="Reservation idempotency service unavailable",
            ) from exc
