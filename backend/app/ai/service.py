from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import time as time_module
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.schemas import (
    AIConversationTurn,
    AIUsageSummary,
    HotelPropertySnapshot,
    HotelSnapshotResponse,
)
from app.billing.models import OrderItem, TableOrder
from app.config import settings
from app.dashboard.models import DashboardQuery
from app.hms.models import (
    HousekeepingTask,
    HotelFolio,
    HotelFolioLine,
    HotelFolioPayment,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
)
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.shared.events import get_redis

logger = logging.getLogger("app.ai.hotel")

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_HISTORY_LIMIT = 5
ACTIVE_RESERVATION_STATUSES = ("confirmed", "checked_in")
IN_HOUSE_STAY_STATUSES = ("checked_in",)
OPEN_FOLIO_STATUSES = ("open", "pending")
_AI_SNAPSHOT_CACHE_PREFIX = "ai:hotel_snapshot"
_AI_TOKEN_BUDGET_PREFIX = "ai:token_budget"
_PENDING_SNAPSHOT_INVALIDATIONS_KEY = "ai_snapshot_pending_invalidations"


@dataclass(slots=True)
class AIUserContext:
    role: str
    restaurant_id: int | None
    active_property_id: int | None
    hotel_roles: tuple[str, ...]
    hotel_permissions: tuple[str, ...]
    tenant_scope: str


@dataclass(slots=True)
class DirectAnswerCandidate:
    answer: str
    confidence: float
    reason: str


@dataclass(slots=True)
class PropertyDateWindow:
    property_id: int
    name: str
    timezone_name: str
    currency: str
    today: date
    tomorrow: date
    start_of_today_utc: datetime
    start_of_tomorrow_utc: datetime
    start_of_day_after_tomorrow_utc: datetime


@dataclass(slots=True)
class _LocalSnapshotCacheEntry:
    expires_at: float
    payload: dict[str, Any]


@dataclass(slots=True)
class AIAnswerResult:
    question: str
    answer: str
    model: str
    route: str
    route_confidence: float
    used_fallback: bool
    highlights: dict[str, object]
    snapshot: HotelSnapshotResponse
    usage: AIUsageSummary | None
    latency_ms: int
    snapshot_latency_ms: int
    llm_latency_ms: int | None
    snapshot_cache_status: str
    error: str | None
    retry_count: int
    token_budget_remaining: int | None


class SnapshotCacheStore:
    def __init__(self) -> None:
        self._entries: dict[str, _LocalSnapshotCacheEntry] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _ttl_seconds() -> int:
        return max(int(settings.ai_snapshot_cache_ttl_seconds), 1)

    @staticmethod
    def _redis_timeout_seconds() -> float:
        return max(settings.redis_operation_timeout_ms, 1) / 1000.0

    async def get(self, key: str) -> tuple[HotelSnapshotResponse | None, str]:
        local = await self._get_local(key)
        if local is not None:
            await api_metrics.record_business_event("ai.snapshot_cache.hit")
            await api_metrics.record_business_event("ai.snapshot_cache.hit.local")
            return local, "local_hit"

        redis_payload = await self._get_redis(key)
        if redis_payload is not None:
            await self._set_local(key, redis_payload)
            await api_metrics.record_business_event("ai.snapshot_cache.hit")
            await api_metrics.record_business_event("ai.snapshot_cache.hit.redis")
            return redis_payload, "redis_hit"

        await api_metrics.record_business_event("ai.snapshot_cache.miss")
        return None, "miss"

    async def set(self, key: str, snapshot: HotelSnapshotResponse) -> None:
        payload = snapshot.model_dump(mode="json")
        await self._set_local(key, snapshot)
        await self._set_redis(key, payload)

    async def invalidate(self, *, property_id: int | None = None) -> None:
        keys = (
            [_build_snapshot_cache_key(property_id), _build_snapshot_cache_key(None)]
            if property_id is not None
            else list(await self._local_keys())
        )
        await self._invalidate_local(keys)
        await self._invalidate_redis(keys, clear_all=property_id is None)

    async def _get_local(self, key: str) -> HotelSnapshotResponse | None:
        now = time_module.monotonic()
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                self._entries.pop(key, None)
                return None
            return HotelSnapshotResponse.model_validate(copy.deepcopy(entry.payload))

    async def _set_local(self, key: str, snapshot: HotelSnapshotResponse | dict[str, Any]) -> None:
        payload = (
            snapshot.model_dump(mode="json")
            if isinstance(snapshot, HotelSnapshotResponse)
            else copy.deepcopy(snapshot)
        )
        async with self._lock:
            self._entries[key] = _LocalSnapshotCacheEntry(
                expires_at=time_module.monotonic() + self._ttl_seconds(),
                payload=payload,
            )

    async def _local_keys(self) -> list[str]:
        async with self._lock:
            return list(self._entries.keys())

    async def _invalidate_local(self, keys: list[str]) -> None:
        if not keys:
            return
        async with self._lock:
            for key in keys:
                self._entries.pop(key, None)

    async def _get_redis(self, key: str) -> HotelSnapshotResponse | None:
        try:
            redis = await asyncio.wait_for(get_redis(), timeout=self._redis_timeout_seconds())
            raw = await asyncio.wait_for(redis.get(key), timeout=self._redis_timeout_seconds())
            if not raw:
                return None
            return HotelSnapshotResponse.model_validate(json.loads(raw))
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "ai_snapshot_cache_redis_read_failed",
                error=str(exc),
            )
            await api_metrics.record_business_event("ai.snapshot_cache.redis_error")
            return None

    async def _set_redis(self, key: str, payload: dict[str, Any]) -> None:
        try:
            redis = await asyncio.wait_for(get_redis(), timeout=self._redis_timeout_seconds())
            await asyncio.wait_for(
                redis.set(key, json.dumps(payload), ex=self._ttl_seconds()),
                timeout=self._redis_timeout_seconds(),
            )
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "ai_snapshot_cache_redis_write_failed",
                error=str(exc),
            )
            await api_metrics.record_business_event("ai.snapshot_cache.redis_error")

    async def _invalidate_redis(self, keys: list[str], *, clear_all: bool) -> None:
        try:
            redis = await asyncio.wait_for(get_redis(), timeout=self._redis_timeout_seconds())
            if clear_all:
                matched = [key async for key in redis.scan_iter(match=f"{_AI_SNAPSHOT_CACHE_PREFIX}:*")]
                if matched:
                    await asyncio.wait_for(redis.delete(*matched), timeout=self._redis_timeout_seconds())
                return
            if keys:
                await asyncio.wait_for(redis.delete(*keys), timeout=self._redis_timeout_seconds())
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "ai_snapshot_cache_redis_invalidate_failed",
                error=str(exc),
            )
            await api_metrics.record_business_event("ai.snapshot_cache.redis_error")


snapshot_cache_store = SnapshotCacheStore()


class TenantTokenBudgetStore:
    def __init__(self) -> None:
        self._entries: dict[str, tuple[int, float]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> int:
        local = await self._get_local(key)
        if local is not None:
            return local
        remote = await self._get_redis(key)
        if remote is not None:
            await self._set_local(key, remote)
            return remote
        return 0

    async def add(self, key: str, tokens: int) -> int:
        increment = max(int(tokens), 0)
        if increment <= 0:
            return await self.get(key)

        remote_value = await self._increment_redis(key, increment)
        if remote_value is not None:
            await self._set_local(key, remote_value)
            return remote_value

        async with self._lock:
            current, _expires_at = self._entries.get(key, (0, self._expires_at()))
            next_value = current + increment
            self._entries[key] = (next_value, self._expires_at())
            return next_value

    async def _get_local(self, key: str) -> int | None:
        async with self._lock:
            stored = self._entries.get(key)
            if stored is None:
                return None
            value, expires_at = stored
            if expires_at <= time_module.time():
                self._entries.pop(key, None)
                return None
            return value

    async def _set_local(self, key: str, value: int) -> None:
        async with self._lock:
            self._entries[key] = (max(int(value), 0), self._expires_at())

    @staticmethod
    def _expires_at() -> float:
        return time_module.time() + 60 * 60 * 48

    @staticmethod
    def _redis_timeout_seconds() -> float:
        return max(settings.redis_operation_timeout_ms, 1) / 1000.0

    @staticmethod
    def _redis_ttl_seconds() -> int:
        return 60 * 60 * 48

    async def _get_redis(self, key: str) -> int | None:
        try:
            redis = await asyncio.wait_for(get_redis(), timeout=self._redis_timeout_seconds())
            raw = await asyncio.wait_for(redis.get(key), timeout=self._redis_timeout_seconds())
            return int(raw) if raw is not None else None
        except Exception:
            return None

    async def _increment_redis(self, key: str, increment: int) -> int | None:
        try:
            redis = await asyncio.wait_for(get_redis(), timeout=self._redis_timeout_seconds())
            if hasattr(redis, "pipeline"):
                pipeline = redis.pipeline(transaction=True)
                pipeline.incrby(key, increment)
                pipeline.expire(key, self._redis_ttl_seconds())
                results = await asyncio.wait_for(
                    pipeline.execute(),
                    timeout=self._redis_timeout_seconds(),
                )
                return int(results[0])
            next_value = await asyncio.wait_for(
                redis.incrby(key, increment),
                timeout=self._redis_timeout_seconds(),
            )
            await asyncio.wait_for(
                redis.expire(key, self._redis_ttl_seconds()),
                timeout=self._redis_timeout_seconds(),
            )
            return int(next_value)
        except Exception:
            return None


tenant_token_budget_store = TenantTokenBudgetStore()


def _to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


def _safe_timezone(timezone_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _question_hash(question: str) -> str:
    return hashlib.sha256(question.strip().lower().encode("utf-8")).hexdigest()[:12]


def _build_snapshot_cache_key(property_id: int | None) -> str:
    return f"{_AI_SNAPSHOT_CACHE_PREFIX}:{property_id or 'all'}"


def _token_budget_scope_key(
    *,
    user_context: AIUserContext | None,
    property_id: int | None,
) -> str:
    if user_context is not None and user_context.restaurant_id is not None:
        return f"restaurant:{user_context.restaurant_id}"
    if property_id is not None:
        return f"property:{property_id}"
    return "public"


def _token_budget_key(
    *,
    user_context: AIUserContext | None,
    property_id: int | None,
    target_date: date | None = None,
) -> str:
    scope = _token_budget_scope_key(user_context=user_context, property_id=property_id)
    current_date = (target_date or datetime.now(timezone.utc).date()).isoformat()
    return f"{_AI_TOKEN_BUDGET_PREFIX}:{scope}:{current_date}"


def _estimate_prompt_tokens(
    *,
    question: str,
    history: list[AIConversationTurn],
    llm_snapshot: dict[str, Any],
) -> int:
    serialized_snapshot = json.dumps(llm_snapshot, separators=(",", ":"), ensure_ascii=True)
    char_count = len(question) + len(serialized_snapshot) + sum(len(item.content) for item in history)
    return max(int(char_count / 4), 1)


async def build_ai_user_context(
    db: AsyncSession,
    current_user: object | None,
) -> AIUserContext | None:
    if current_user is None:
        return None

    role_value = getattr(getattr(current_user, "role", None), "value", None) or str(
        getattr(current_user, "role", "unknown")
    )
    restaurant_id = getattr(current_user, "restaurant_id", None)
    active_property_id = getattr(current_user, "active_property_id", None)
    hotel_roles: tuple[str, ...] = ()
    hotel_permissions: tuple[str, ...] = ()

    try:
        from app.hms.rbac import get_hotel_access_context

        hotel_access = await get_hotel_access_context(
            db,
            current_user,
            preferred_property_id=active_property_id,
            persist_active_property=False,
        )
        hotel_roles = hotel_access.hotel_roles
        hotel_permissions = hotel_access.hotel_permissions
        active_property_id = hotel_access.active_property_id
    except Exception:
        hotel_roles = ()
        hotel_permissions = ()

    return AIUserContext(
        role=role_value,
        restaurant_id=restaurant_id,
        active_property_id=active_property_id,
        hotel_roles=hotel_roles,
        hotel_permissions=hotel_permissions,
        tenant_scope=_token_budget_scope_key(
            user_context=None,
            property_id=active_property_id,
        )
        if restaurant_id is None
        else f"restaurant:{restaurant_id}",
    )


def schedule_ai_snapshot_invalidation(
    db: AsyncSession,
    *,
    property_id: int | None,
    reason: str,
) -> None:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.setdefault(_PENDING_SNAPSHOT_INVALIDATIONS_KEY, [])
    pending.append((property_id, reason))


def discard_pending_ai_snapshot_invalidations(db: AsyncSession) -> None:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    session_info.pop(_PENDING_SNAPSHOT_INVALIDATIONS_KEY, None)


async def flush_pending_ai_snapshot_invalidations(db: AsyncSession) -> None:
    session_info = getattr(db, "info", None)
    if session_info is None:
        return
    pending = session_info.pop(_PENDING_SNAPSHOT_INVALIDATIONS_KEY, [])
    if not pending:
        return

    invalidate_all = any(property_id is None for property_id, _reason in pending)
    property_ids = sorted(
        {
            int(property_id)
            for property_id, _reason in pending
            if property_id is not None
        }
    )
    if invalidate_all:
        await snapshot_cache_store.invalidate(property_id=None)
    else:
        for property_id in property_ids:
            await snapshot_cache_store.invalidate(property_id=property_id)

    await api_metrics.record_business_event("ai.snapshot_cache.invalidation")
    for property_id, reason in pending:
        log_event(
            logger,
            logging.INFO,
            "ai_snapshot_cache_invalidated",
            property_id=property_id,
            reason=reason,
        )


async def get_ai_latency_metrics(window_minutes: int = 60) -> dict[str, Any]:
    timing_snapshot = await api_metrics.business_timing_snapshot(window_minutes=window_minutes)
    per_route = {
        metric_name.removeprefix("ai.query.total.route."): values
        for metric_name, values in timing_snapshot.items()
        if metric_name.startswith("ai.query.total.route.")
    }
    return {
        "window_minutes": window_minutes,
        "overall": timing_snapshot.get("ai.query.total", {"count": 0, "avg_ms": 0.0, "p95_ms": 0.0, "max_ms": 0.0}),
        "per_route": per_route,
        "snapshot": {
            "build": timing_snapshot.get("ai.snapshot.build", {"count": 0, "avg_ms": 0.0, "p95_ms": 0.0, "max_ms": 0.0}),
            "cached": timing_snapshot.get("ai.snapshot.cached", {"count": 0, "avg_ms": 0.0, "p95_ms": 0.0, "max_ms": 0.0}),
        },
        "events": await api_metrics.business_snapshot(),
    }


def _build_property_window(property_record: HotelProperty) -> PropertyDateWindow:
    tz = _safe_timezone(property_record.timezone)
    local_now = datetime.now(tz)
    today = local_now.date()
    tomorrow = today + timedelta(days=1)
    start_today_local = datetime.combine(today, time.min, tzinfo=tz)
    start_tomorrow_local = start_today_local + timedelta(days=1)
    start_day_after_tomorrow_local = start_tomorrow_local + timedelta(days=1)
    return PropertyDateWindow(
        property_id=property_record.id,
        name=property_record.name,
        timezone_name=property_record.timezone,
        currency=property_record.currency,
        today=today,
        tomorrow=tomorrow,
        start_of_today_utc=start_today_local.astimezone(timezone.utc),
        start_of_tomorrow_utc=start_tomorrow_local.astimezone(timezone.utc),
        start_of_day_after_tomorrow_utc=start_day_after_tomorrow_local.astimezone(timezone.utc),
    )


async def _load_property_windows(
    db: AsyncSession,
    *,
    property_id: int | None = None,
) -> list[PropertyDateWindow]:
    query: Select[tuple[HotelProperty]] = select(HotelProperty).order_by(HotelProperty.id.asc())
    if property_id is not None:
        query = query.where(HotelProperty.id == property_id)
    property_rows = list((await db.execute(query)).scalars().all())
    return [_build_property_window(property_record) for property_record in property_rows]


async def _reservation_status_counts(
    db: AsyncSession,
    property_ids: list[int],
) -> dict[str, int]:
    if not property_ids:
        return {}
    rows = (
        await db.execute(
            select(HotelReservation.status, func.count(HotelReservation.id))
            .where(HotelReservation.property_id.in_(property_ids))
            .group_by(HotelReservation.status)
        )
    ).all()
    return {str(status or "unknown"): int(count or 0) for status, count in rows}


async def _stay_status_counts(
    db: AsyncSession,
    property_ids: list[int],
) -> dict[str, int]:
    if not property_ids:
        return {}
    rows = (
        await db.execute(
            select(HotelStay.status, func.count(HotelStay.id))
            .where(HotelStay.property_id.in_(property_ids))
            .group_by(HotelStay.status)
        )
    ).all()
    return {str(status or "unknown"): int(count or 0) for status, count in rows}


async def _room_status_counts(
    db: AsyncSession,
    property_ids: list[int],
) -> dict[str, int]:
    if not property_ids:
        return {}
    rows = (
        await db.execute(
            select(Room.status, func.count(Room.id))
            .where(Room.property_id.in_(property_ids))
            .group_by(Room.status)
        )
    ).all()
    return {str(status or "unknown"): int(count or 0) for status, count in rows}


async def _housekeeping_status_counts(
    db: AsyncSession,
    property_ids: list[int],
) -> dict[str, int]:
    if not property_ids:
        return {}
    rows = (
        await db.execute(
            select(HousekeepingTask.status, func.count(HousekeepingTask.id))
            .where(HousekeepingTask.property_id.in_(property_ids))
            .group_by(HousekeepingTask.status)
        )
    ).all()
    return {str(status or "unknown"): int(count or 0) for status, count in rows}


async def _reservation_sample(
    db: AsyncSession,
    *,
    property_ids: list[int],
    target_date: date,
    date_field: str,
    limit: int = 5,
) -> list[dict[str, object]]:
    if not property_ids:
        return []
    field = HotelReservation.check_in if date_field == "check_in" else HotelReservation.check_out
    rows = (
        await db.execute(
            select(
                HotelReservation.id,
                HotelReservation.property_id,
                HotelReservation.booking_id,
                HotelReservation.guest_name,
                HotelReservation.room,
                HotelReservation.check_in,
                HotelReservation.check_out,
                HotelReservation.status,
            )
            .where(
                HotelReservation.property_id.in_(property_ids),
                field == target_date,
                HotelReservation.status.in_(ACTIVE_RESERVATION_STATUSES),
            )
            .order_by(HotelReservation.check_in.asc(), HotelReservation.id.asc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "reservation_id": reservation_id,
            "property_id": reservation_property_id,
            "booking_id": booking_id,
            "guest_name": guest_name,
            "room": room,
            "check_in": check_in.isoformat(),
            "check_out": check_out.isoformat(),
            "status": status,
        }
        for (
            reservation_id,
            reservation_property_id,
            booking_id,
            guest_name,
            room,
            check_in,
            check_out,
            status,
        ) in rows
    ]


async def _active_stay_sample(
    db: AsyncSession,
    *,
    property_ids: list[int],
    limit: int = 5,
) -> list[dict[str, object]]:
    if not property_ids:
        return []
    rows = (
        await db.execute(
            select(
                HotelStay.id,
                HotelStay.property_id,
                HotelStay.status,
                HotelStay.planned_check_in,
                HotelStay.planned_check_out,
                HotelReservation.booking_id,
                HotelReservation.guest_name,
                Room.room_number,
            )
            .join(HotelReservation, HotelReservation.id == HotelStay.reservation_id)
            .outerjoin(Room, Room.id == HotelStay.room_id)
            .where(
                HotelStay.property_id.in_(property_ids),
                HotelStay.status.in_(("booked", "checked_in")),
            )
            .order_by(HotelStay.planned_check_out.asc(), HotelStay.id.asc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "stay_id": stay_id,
            "property_id": property_id,
            "status": status,
            "planned_check_in": planned_check_in.isoformat(),
            "planned_check_out": planned_check_out.isoformat(),
            "booking_id": booking_id,
            "guest_name": guest_name,
            "room_number": room_number,
        }
        for (
            stay_id,
            property_id,
            status,
            planned_check_in,
            planned_check_out,
            booking_id,
            guest_name,
            room_number,
        ) in rows
    ]


async def _recent_open_folios(
    db: AsyncSession,
    *,
    property_ids: list[int],
    limit: int = 5,
) -> list[dict[str, object]]:
    if not property_ids:
        return []
    rows = (
        await db.execute(
            select(
                HotelFolio.folio_number,
                HotelFolio.property_id,
                HotelFolio.balance_due,
                HotelFolio.total,
                HotelReservation.booking_id,
                HotelReservation.guest_name,
            )
            .join(HotelReservation, HotelReservation.id == HotelFolio.reservation_id)
            .where(
                HotelFolio.property_id.in_(property_ids),
                HotelFolio.status.in_(OPEN_FOLIO_STATUSES),
            )
            .order_by(HotelFolio.updated_at.desc(), HotelFolio.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "folio_number": folio_number,
            "property_id": property_id,
            "balance_due": round(_to_float(balance_due), 2),
            "total": round(_to_float(total), 2),
            "booking_id": booking_id,
            "guest_name": guest_name,
        }
        for folio_number, property_id, balance_due, total, booking_id, guest_name in rows
    ]


async def _urgent_housekeeping_tasks(
    db: AsyncSession,
    *,
    property_ids: list[int],
    limit: int = 5,
) -> list[dict[str, object]]:
    if not property_ids:
        return []
    rows = (
        await db.execute(
            select(
                HousekeepingTask.id,
                HousekeepingTask.property_id,
                HousekeepingTask.title,
                HousekeepingTask.priority,
                HousekeepingTask.status,
                HousekeepingTask.due_date,
                Room.room_number,
            )
            .outerjoin(Room, Room.id == HousekeepingTask.room_id)
            .where(HousekeepingTask.property_id.in_(property_ids))
            .order_by(HousekeepingTask.priority.desc(), HousekeepingTask.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "task_id": task_id,
            "property_id": property_id,
            "title": title,
            "priority": priority,
            "status": status,
            "due_date": due_date.isoformat() if due_date else None,
            "room_number": room_number,
        }
        for task_id, property_id, title, priority, status, due_date, room_number in rows
    ]


async def _recent_orders(
    db: AsyncSession,
    *,
    limit: int = 5,
) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(
                TableOrder.id,
                TableOrder.restaurant_id,
                TableOrder.status,
                TableOrder.guest_name,
                TableOrder.total,
                TableOrder.created_at,
                func.count(OrderItem.id).label("items_count"),
            )
            .outerjoin(OrderItem, OrderItem.order_id == TableOrder.id)
            .group_by(TableOrder.id)
            .order_by(TableOrder.created_at.desc(), TableOrder.id.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "order_id": order_id,
            "restaurant_id": restaurant_id,
            "status": status,
            "guest_name": guest_name,
            "total": round(_to_float(total), 2),
            "created_at": created_at.isoformat() if created_at else None,
            "items_count": int(items_count or 0),
        }
        for order_id, restaurant_id, status, guest_name, total, created_at, items_count in rows
    ]


def _extract_summary_highlights(snapshot: HotelSnapshotResponse) -> dict[str, object]:
    summary = snapshot.summary
    return {
        "occupied_rooms": summary.get("occupied_rooms", 0),
        "occupancy_pct": summary.get("occupancy_pct", 0.0),
        "revenue_today": summary.get("revenue_today", 0.0),
        "checkouts_tomorrow": summary.get("checkouts_tomorrow", 0),
    }


async def _build_hotel_snapshot(
    db: AsyncSession,
    *,
    property_id: int | None = None,
) -> HotelSnapshotResponse:
    property_windows = await _load_property_windows(db, property_id=property_id)
    property_ids = [item.property_id for item in property_windows]
    generated_at = datetime.now(timezone.utc)

    room_status_counts = await _room_status_counts(db, property_ids)
    reservation_status_counts = await _reservation_status_counts(db, property_ids)
    stay_status_counts = await _stay_status_counts(db, property_ids)
    housekeeping_status_counts = await _housekeeping_status_counts(db, property_ids)

    open_folio_count = 0
    outstanding_balance = 0.0
    hotel_revenue_today = 0.0
    payments_today = 0.0
    arrivals_today = 0
    departures_today = 0
    checkouts_tomorrow = 0
    in_house_guests = 0
    due_today = 0
    properties: list[HotelPropertySnapshot] = []

    for item in property_windows:
        property_total_rooms = (
            await db.execute(select(func.count(Room.id)).where(Room.property_id == item.property_id))
        ).scalar() or 0
        property_occupied_rooms = (
            await db.execute(
                select(func.count(Room.id)).where(
                    Room.property_id == item.property_id,
                    Room.status == "occupied",
                )
            )
        ).scalar() or 0
        property_arrivals_today = (
            await db.execute(
                select(func.count(HotelReservation.id)).where(
                    HotelReservation.property_id == item.property_id,
                    HotelReservation.check_in == item.today,
                    HotelReservation.status.in_(ACTIVE_RESERVATION_STATUSES),
                )
            )
        ).scalar() or 0
        property_departures_today = (
            await db.execute(
                select(func.count(HotelReservation.id)).where(
                    HotelReservation.property_id == item.property_id,
                    HotelReservation.check_out == item.today,
                    HotelReservation.status.in_(ACTIVE_RESERVATION_STATUSES),
                )
            )
        ).scalar() or 0
        property_checkouts_tomorrow = (
            await db.execute(
                select(func.count(HotelReservation.id)).where(
                    HotelReservation.property_id == item.property_id,
                    HotelReservation.check_out == item.tomorrow,
                    HotelReservation.status.in_(ACTIVE_RESERVATION_STATUSES),
                )
            )
        ).scalar() or 0
        property_in_house = (
            await db.execute(
                select(func.count(HotelStay.id)).where(
                    HotelStay.property_id == item.property_id,
                    HotelStay.status.in_(IN_HOUSE_STAY_STATUSES),
                )
            )
        ).scalar() or 0
        property_open_folios = (
            await db.execute(
                select(func.count(HotelFolio.id)).where(
                    HotelFolio.property_id == item.property_id,
                    HotelFolio.status.in_(OPEN_FOLIO_STATUSES),
                )
            )
        ).scalar() or 0
        property_outstanding_balance = (
            await db.execute(
                select(func.coalesce(func.sum(HotelFolio.balance_due), 0.0)).where(
                    HotelFolio.property_id == item.property_id,
                    HotelFolio.status.in_(OPEN_FOLIO_STATUSES),
                )
            )
        ).scalar() or 0.0
        property_hotel_revenue_today = (
            await db.execute(
                select(func.coalesce(func.sum(HotelFolioLine.total_price), 0.0))
                .select_from(HotelFolioLine)
                .join(HotelFolio, HotelFolio.id == HotelFolioLine.folio_id)
                .where(
                    HotelFolio.property_id == item.property_id,
                    HotelFolioLine.service_date == item.today,
                    HotelFolioLine.status != "void",
                )
            )
        ).scalar() or 0.0
        property_payments_today = (
            await db.execute(
                select(func.coalesce(func.sum(HotelFolioPayment.amount), 0.0))
                .select_from(HotelFolioPayment)
                .join(HotelFolio, HotelFolio.id == HotelFolioPayment.folio_id)
                .where(
                    HotelFolio.property_id == item.property_id,
                    HotelFolioPayment.status == "completed",
                    HotelFolioPayment.paid_at >= item.start_of_today_utc,
                    HotelFolioPayment.paid_at < item.start_of_tomorrow_utc,
                )
            )
        ).scalar() or 0.0
        property_occupancy_pct = round(
            (int(property_occupied_rooms) / int(property_total_rooms) * 100)
            if property_total_rooms
            else 0.0,
            1,
        )
        property_due_today = (
            await db.execute(
                select(func.count(HousekeepingTask.id)).where(
                    HousekeepingTask.property_id == item.property_id,
                    HousekeepingTask.due_date == item.today,
                    HousekeepingTask.status.in_(("pending", "in_progress")),
                )
            )
        ).scalar() or 0

        open_folio_count += int(property_open_folios)
        outstanding_balance += _to_float(property_outstanding_balance)
        hotel_revenue_today += _to_float(property_hotel_revenue_today)
        payments_today += _to_float(property_payments_today)
        arrivals_today += int(property_arrivals_today)
        departures_today += int(property_departures_today)
        checkouts_tomorrow += int(property_checkouts_tomorrow)
        in_house_guests += int(property_in_house)
        due_today += int(property_due_today)

        properties.append(
            HotelPropertySnapshot(
                property_id=item.property_id,
                name=item.name,
                timezone=item.timezone_name,
                currency=item.currency,
                today=item.today.isoformat(),
                tomorrow=item.tomorrow.isoformat(),
                total_rooms=int(property_total_rooms),
                occupied_rooms=int(property_occupied_rooms),
                occupancy_pct=property_occupancy_pct,
                arrivals_today=int(property_arrivals_today),
                checkouts_tomorrow=int(property_checkouts_tomorrow),
                revenue_today=round(_to_float(property_hotel_revenue_today), 2),
            )
        )

    default_tz = property_windows[0].timezone_name if property_windows else "UTC"
    default_zone = _safe_timezone(default_tz)
    today_local = datetime.now(default_zone).date()
    start_today_local = datetime.combine(today_local, time.min, tzinfo=default_zone).astimezone(
        timezone.utc
    )
    start_tomorrow_local = start_today_local + timedelta(days=1)

    order_rows_today = (
        await db.execute(
            select(func.count(TableOrder.id), func.coalesce(func.sum(TableOrder.total), 0.0)).where(
                TableOrder.created_at >= start_today_local,
                TableOrder.created_at < start_tomorrow_local,
                TableOrder.status != "cancelled",
            )
        )
    ).one()
    restaurant_orders_today = int(order_rows_today[0] or 0)
    restaurant_revenue_today = round(_to_float(order_rows_today[1]), 2)
    open_orders_count = (
        await db.execute(
            select(func.count(TableOrder.id)).where(TableOrder.status.in_(("open", "in_progress")))
        )
    ).scalar() or 0
    pending_order_items = (
        await db.execute(
            select(func.count(OrderItem.id)).where(OrderItem.status.in_(("pending", "fired")))
        )
    ).scalar() or 0

    total_rooms = sum(item.total_rooms for item in properties)
    occupied_rooms = sum(item.occupied_rooms for item in properties)
    cleaning_rooms = room_status_counts.get("cleaning", 0)
    maintenance_rooms = room_status_counts.get("maintenance", 0)
    available_rooms = room_status_counts.get(
        "available",
        max(total_rooms - occupied_rooms - cleaning_rooms - maintenance_rooms, 0),
    )
    occupancy_pct = round((occupied_rooms / total_rooms * 100) if total_rooms else 0.0, 1)
    total_revenue_today = round(hotel_revenue_today + restaurant_revenue_today, 2)

    return HotelSnapshotResponse(
        generated_at=generated_at,
        scope={
            "property_ids": property_ids,
            "property_count": len(property_ids),
            "timezone": default_tz,
        },
        summary={
            "occupied_rooms": occupied_rooms,
            "total_rooms": total_rooms,
            "occupancy_pct": occupancy_pct,
            "available_rooms": available_rooms,
            "cleaning_rooms": cleaning_rooms,
            "maintenance_rooms": maintenance_rooms,
            "arrivals_today": arrivals_today,
            "departures_today": departures_today,
            "checkouts_tomorrow": checkouts_tomorrow,
            "in_house_guests": in_house_guests,
            "revenue_today": total_revenue_today,
            "hotel_revenue_today": round(hotel_revenue_today, 2),
            "restaurant_revenue_today": restaurant_revenue_today,
            "open_folio_balance": round(outstanding_balance, 2),
            "open_folios": open_folio_count,
            "housekeeping_open_tasks": housekeeping_status_counts.get("pending", 0)
            + housekeeping_status_counts.get("in_progress", 0),
            "restaurant_orders_today": restaurant_orders_today,
        },
        reservations={
            "status_counts": reservation_status_counts,
            "arrivals_today": arrivals_today,
            "departures_today": departures_today,
            "checkouts_tomorrow": checkouts_tomorrow,
            "pending_bookings": reservation_status_counts.get("pending", 0),
            "arrivals_sample": await _reservation_sample(
                db,
                property_ids=property_ids,
                target_date=today_local,
                date_field="check_in",
            ),
            "checkouts_tomorrow_sample": await _reservation_sample(
                db,
                property_ids=property_ids,
                target_date=today_local + timedelta(days=1),
                date_field="check_out",
            ),
        },
        stays={
            "status_counts": stay_status_counts,
            "in_house": in_house_guests,
            "active_sample": await _active_stay_sample(db, property_ids=property_ids),
        },
        rooms={
            "status_counts": room_status_counts,
            "total_rooms": total_rooms,
            "occupied_rooms": occupied_rooms,
            "available_rooms": available_rooms,
            "occupancy_pct": occupancy_pct,
        },
        folios={
            "open_count": open_folio_count,
            "outstanding_balance": round(outstanding_balance, 2),
            "hotel_revenue_today": round(hotel_revenue_today, 2),
            "payments_today": round(payments_today, 2),
            "recent_open_folios": await _recent_open_folios(db, property_ids=property_ids),
        },
        orders={
            "today_count": restaurant_orders_today,
            "open_count": int(open_orders_count),
            "revenue_today": restaurant_revenue_today,
            "pending_items": int(pending_order_items),
            "recent_orders": await _recent_orders(db),
        },
        housekeeping={
            "status_counts": housekeeping_status_counts,
            "due_today": due_today,
            "urgent_tasks": await _urgent_housekeeping_tasks(db, property_ids=property_ids),
        },
        properties=properties,
    )


async def get_hotel_snapshot(
    db: AsyncSession,
    *,
    property_id: int | None = None,
) -> tuple[HotelSnapshotResponse, str, int]:
    cache_key = _build_snapshot_cache_key(property_id)
    started = time_module.perf_counter()
    cached_snapshot, cache_status = await snapshot_cache_store.get(cache_key)
    if cached_snapshot is not None:
        elapsed_ms = max(int((time_module.perf_counter() - started) * 1000), 0)
        await api_metrics.record_business_timing("ai.snapshot.cached", elapsed_ms)
        return cached_snapshot, cache_status, elapsed_ms

    snapshot = await _build_hotel_snapshot(db, property_id=property_id)
    await snapshot_cache_store.set(cache_key, snapshot)
    elapsed_ms = max(int((time_module.perf_counter() - started) * 1000), 0)
    await api_metrics.record_business_timing("ai.snapshot.build", elapsed_ms)
    return snapshot, "fresh", elapsed_ms


def _truncate_text(value: str, limit: int = 220) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _sanitize_reservation_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "property_id": entry.get("property_id"),
            "status": entry.get("status"),
            "check_in": entry.get("check_in"),
            "check_out": entry.get("check_out"),
        }
        for entry in entries[:3]
    ]


def _sanitize_stay_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "property_id": entry.get("property_id"),
            "status": entry.get("status"),
            "planned_check_in": entry.get("planned_check_in"),
            "planned_check_out": entry.get("planned_check_out"),
        }
        for entry in entries[:3]
    ]


def _sanitize_folio_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "property_id": entry.get("property_id"),
            "balance_due": entry.get("balance_due"),
            "total": entry.get("total"),
        }
        for entry in entries[:3]
    ]


def _sanitize_order_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "restaurant_id": entry.get("restaurant_id"),
            "status": entry.get("status"),
            "total": entry.get("total"),
            "items_count": entry.get("items_count"),
            "created_at": entry.get("created_at"),
        }
        for entry in entries[:3]
    ]


def _sanitize_housekeeping_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "property_id": entry.get("property_id"),
            "title": _truncate_text(str(entry.get("title") or ""), limit=80),
            "priority": entry.get("priority"),
            "status": entry.get("status"),
            "due_date": entry.get("due_date"),
        }
        for entry in entries[:3]
    ]


def _build_llm_snapshot(snapshot: HotelSnapshotResponse) -> dict[str, Any]:
    raw = snapshot.model_dump(mode="json")
    return {
        "executive_summary": raw["summary"],
        "operations": {
            "reservations": {
                "status_counts": raw["reservations"].get("status_counts", {}),
                "arrivals_today": raw["reservations"].get("arrivals_today", 0),
                "departures_today": raw["reservations"].get("departures_today", 0),
                "checkouts_tomorrow": raw["reservations"].get("checkouts_tomorrow", 0),
                "pending_bookings": raw["reservations"].get("pending_bookings", 0),
                "arrivals_sample": _sanitize_reservation_entries(
                    raw["reservations"].get("arrivals_sample", [])
                ),
                "checkouts_tomorrow_sample": _sanitize_reservation_entries(
                    raw["reservations"].get("checkouts_tomorrow_sample", [])
                ),
            },
            "stays": {
                "status_counts": raw["stays"].get("status_counts", {}),
                "in_house": raw["stays"].get("in_house", 0),
                "active_sample": _sanitize_stay_entries(raw["stays"].get("active_sample", [])),
            },
            "rooms": raw["rooms"],
        },
        "finance": {
            "revenue_today": raw["summary"].get("revenue_today", 0.0),
            "hotel_revenue_today": raw["folios"].get("hotel_revenue_today", 0.0),
            "restaurant_revenue_today": raw["orders"].get("revenue_today", 0.0),
            "open_folio_balance": raw["folios"].get("outstanding_balance", 0.0),
            "open_folios": raw["folios"].get("open_count", 0),
            "payments_today": raw["folios"].get("payments_today", 0.0),
            "recent_open_folios": _sanitize_folio_entries(
                raw["folios"].get("recent_open_folios", [])
            ),
        },
        "food_and_beverage": {
            "today_count": raw["orders"].get("today_count", 0),
            "open_count": raw["orders"].get("open_count", 0),
            "pending_items": raw["orders"].get("pending_items", 0),
            "recent_orders": _sanitize_order_entries(raw["orders"].get("recent_orders", [])),
        },
        "housekeeping": {
            "status_counts": raw["housekeeping"].get("status_counts", {}),
            "due_today": raw["housekeeping"].get("due_today", 0),
            "urgent_tasks": _sanitize_housekeeping_entries(raw["housekeeping"].get("urgent_tasks", [])),
        },
        "properties": [
            {
                "property_id": property["property_id"],
                "name": property["name"],
                "timezone": property["timezone"],
                "currency": property["currency"],
                "total_rooms": property["total_rooms"],
                "occupied_rooms": property["occupied_rooms"],
                "occupancy_pct": property["occupancy_pct"],
                "arrivals_today": property["arrivals_today"],
                "checkouts_tomorrow": property["checkouts_tomorrow"],
                "revenue_today": property["revenue_today"],
            }
            for property in raw.get("properties", [])
        ],
    }


def _history_for_model(
    question: str,
    history: list[AIConversationTurn] | None,
) -> list[dict[str, object]]:
    limit = settings.ai_history_message_limit or DEFAULT_HISTORY_LIMIT
    normalized_history = [
        {"role": message.role, "content": [{"type": "input_text", "text": message.content}]}
        for message in (history or [])[-limit:]
        if message.content.strip()
    ]
    if (
        not normalized_history
        or normalized_history[-1]["role"] != "user"
        or normalized_history[-1]["content"][0]["text"] != question
    ):
        normalized_history.append(
            {"role": "user", "content": [{"type": "input_text", "text": question}]}
        )
    return normalized_history[-limit:]


def _system_prompt(
    llm_snapshot: dict[str, Any],
    *,
    user_context: AIUserContext | None,
) -> str:
    sections = [
        "USER_CONTEXT",
        json.dumps(
            {
                "role": user_context.role if user_context is not None else "owner",
                "restaurant_id": user_context.restaurant_id if user_context is not None else None,
                "active_property_id": user_context.active_property_id if user_context is not None else None,
                "hotel_roles": list(user_context.hotel_roles) if user_context is not None else [],
                "hotel_permissions": list(user_context.hotel_permissions) if user_context is not None else [],
            },
            indent=2,
        ),
        "EXECUTIVE_SUMMARY",
        json.dumps(llm_snapshot["executive_summary"], indent=2),
        "OPERATIONS",
        json.dumps(llm_snapshot["operations"], indent=2),
        "FINANCE",
        json.dumps(llm_snapshot["finance"], indent=2),
        "FOOD_AND_BEVERAGE",
        json.dumps(llm_snapshot["food_and_beverage"], indent=2),
        "HOUSEKEEPING",
        json.dumps(llm_snapshot["housekeeping"], indent=2),
        "PROPERTIES",
        json.dumps(llm_snapshot["properties"], indent=2),
    ]
    return (
        "You are a hotel management AI assistant.\n"
        "Use only the provided live hotel snapshot sections.\n"
        "Strict rules:\n"
        "1. Never invent or estimate counts, revenue, guests, bookings, rooms, or statuses.\n"
        "2. If the snapshot does not contain the requested fact, say that it is unavailable.\n"
        "3. Prefer exact numbers and short arithmetic using only the snapshot.\n"
        "4. Do not mention or infer any personally identifying guest details.\n"
        "5. Tailor phrasing and recommendations to the user's role and hotel permissions.\n"
        "6. If a follow-up relies on missing context, ask one brief clarification question.\n"
        "7. If recommending an action outside the user's likely access, say that a higher-permission user may be needed.\n"
        "8. Keep answers concise, operational, and decision-useful.\n\n"
        "Snapshot sections:\n"
        + "\n\n".join(sections)
    )


def _structured_live_answer(
    *,
    title: str,
    lines: list[str],
) -> str:
    return "\n".join([title, *[f"- {line}" for line in lines]])


def _fallback_answer(snapshot: HotelSnapshotResponse) -> str:
    summary = snapshot.summary
    return _structured_live_answer(
        title="Live snapshot response",
        lines=[
            f"Occupied rooms: {summary.get('occupied_rooms', 0)}/{summary.get('total_rooms', 0)} ({summary.get('occupancy_pct', 0.0)}%)",
            f"Today's revenue: EUR {summary.get('revenue_today', 0.0):,.2f}",
            f"Guests checking out tomorrow: {summary.get('checkouts_tomorrow', 0)}",
        ],
    )


def _token_limit_fallback_answer(
    snapshot: HotelSnapshotResponse,
    *,
    tenant_scope: str,
) -> str:
    summary = snapshot.summary
    return _structured_live_answer(
        title="Live snapshot response",
        lines=[
            f"Occupied rooms: {summary.get('occupied_rooms', 0)}/{summary.get('total_rooms', 0)} ({summary.get('occupancy_pct', 0.0)}%)",
            f"Today's revenue: EUR {summary.get('revenue_today', 0.0):,.2f}",
            f"Detailed AI analysis is paused for {tenant_scope} because today's token budget has been reached.",
        ],
    )


def _extract_usage(data: dict[str, Any]) -> AIUsageSummary | None:
    usage = data.get("usage")
    if not isinstance(usage, dict):
        return None
    input_details = usage.get("input_tokens_details") or {}
    output_details = usage.get("output_tokens_details") or {}
    return AIUsageSummary(
        input_tokens=int(usage.get("input_tokens") or 0),
        output_tokens=int(usage.get("output_tokens") or 0),
        total_tokens=int(usage.get("total_tokens") or 0),
        cached_input_tokens=int(input_details.get("cached_tokens") or 0),
        reasoning_tokens=int(output_details.get("reasoning_tokens") or 0),
    )


def _extract_output_text(data: dict[str, Any]) -> str:
    output_text = data.get("output_text")
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()

    for output_item in data.get("output", []):
        for content_item in output_item.get("content", []):
            if content_item.get("type") == "output_text":
                text = (content_item.get("text") or "").strip()
                if text:
                    return text
    raise RuntimeError("OpenAI response did not include output text")


def _should_retry_openai(exc: Exception) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in {408, 409, 429, 500, 502, 503, 504}
    return False


async def _call_openai_responses_api(
    *,
    question: str,
    history: list[AIConversationTurn],
    llm_snapshot: dict[str, Any],
    user_context: AIUserContext | None,
) -> tuple[str, AIUsageSummary | None, int, int]:
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured")

    payload = {
        "model": settings.ai_openai_model or DEFAULT_OPENAI_MODEL,
        "input": [
            {
                "role": "system",
                "content": [
                    {
                        "type": "input_text",
                        "text": _system_prompt(llm_snapshot, user_context=user_context),
                    }
                ],
            },
            *_history_for_model(question, history),
        ],
        "max_output_tokens": settings.ai_openai_max_output_tokens,
        "temperature": 0.1,
        "text": {"format": {"type": "text"}},
        "truncation": "auto",
        "store": False,
    }
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(settings.ai_openai_timeout_seconds)
    retry_count = 0
    last_exc: Exception | None = None

    for attempt in range(max(int(settings.ai_openai_retry_attempts), 0) + 1):
        started = time_module.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(OPENAI_RESPONSES_URL, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()

            latency_ms = max(int((time_module.perf_counter() - started) * 1000), 0)
            usage = _extract_usage(data)
            return _extract_output_text(data), usage, latency_ms, retry_count
        except Exception as exc:
            last_exc = exc
            if attempt >= max(int(settings.ai_openai_retry_attempts), 0) or not _should_retry_openai(exc):
                break
            retry_count += 1
            await api_metrics.record_business_event("ai.query.llm.retry")
            log_event(
                logger,
                logging.WARNING,
                "ai_llm_retrying",
                attempt=attempt + 1,
                error=str(exc),
            )
            await asyncio.sleep(0.2)

    assert last_exc is not None
    raise last_exc


def _is_contextual_followup(question: str, history: list[AIConversationTurn] | None) -> bool:
    if not history:
        return False
    normalized = question.strip().lower()
    return len(normalized.split()) <= 4 or normalized in {"and tomorrow", "what about tomorrow", "and today"}


def _is_complex_question(question: str) -> bool:
    normalized = " ".join(question.lower().replace("?", " ").split())
    complexity_markers = (
        "compare",
        "versus",
        "trend",
        "forecast",
        "why",
        "explain",
        "recommend",
        "should",
        "what should",
        "how can",
        "which",
        "list",
        "breakdown",
        "per property",
    )
    return any(marker in normalized for marker in complexity_markers)


def _try_direct_answer(
    *,
    question: str,
    history: list[AIConversationTurn] | None,
    snapshot: HotelSnapshotResponse,
) -> DirectAnswerCandidate | None:
    if _is_contextual_followup(question, history):
        return None
    if _is_complex_question(question):
        return None

    normalized = " ".join(question.lower().strip().replace("?", " ").split())
    summary = snapshot.summary

    occupied_patterns = (
        "how many rooms are occupied",
        "rooms are occupied",
        "occupied rooms",
        "how many occupied rooms",
    )
    revenue_patterns = (
        "today's revenue",
        "todays revenue",
        "revenue today",
        "today revenue",
        "umsatz heute",
        "heute umsatz",
    )
    checkout_patterns = (
        "check out tomorrow",
        "checkout tomorrow",
        "checkouts tomorrow",
        "guests check out tomorrow",
        "abreisen morgen",
        "morgen check out",
    )

    if any(pattern in normalized for pattern in occupied_patterns):
        return DirectAnswerCandidate(
            answer=_structured_live_answer(
                title="Live occupancy",
                lines=[
                    f"Occupied rooms: {summary.get('occupied_rooms', 0)}/{summary.get('total_rooms', 0)}",
                    f"Occupancy: {summary.get('occupancy_pct', 0.0)}%",
                    f"Available rooms: {summary.get('available_rooms', 0)}",
                ],
            ),
            confidence=0.98,
            reason="single_metric_occupancy",
        )

    if any(pattern in normalized for pattern in revenue_patterns):
        if any(term in normalized for term in ("compare", "by property", "versus")):
            return None
        return DirectAnswerCandidate(
            answer=_structured_live_answer(
                title="Live revenue",
                lines=[
                    f"Today's total revenue: EUR {summary.get('revenue_today', 0.0):,.2f}",
                    f"Hotel revenue today: EUR {summary.get('hotel_revenue_today', 0.0):,.2f}",
                    f"Restaurant revenue today: EUR {summary.get('restaurant_revenue_today', 0.0):,.2f}",
                ],
            ),
            confidence=0.96,
            reason="single_metric_revenue",
        )

    if any(pattern in normalized for pattern in checkout_patterns):
        return DirectAnswerCandidate(
            answer=_structured_live_answer(
                title="Tomorrow's check-outs",
                lines=[
                    f"Guests checking out tomorrow: {summary.get('checkouts_tomorrow', 0)}",
                    f"In-house guests now: {summary.get('in_house_guests', 0)}",
                    f"Today's departures: {summary.get('departures_today', 0)}",
                ],
            ),
            confidence=0.97,
            reason="single_metric_checkout",
        )

    return None


async def answer_hotel_question(
    db: AsyncSession,
    *,
    question: str,
    history: list[AIConversationTurn] | None = None,
    property_id: int | None = None,
    user_context: AIUserContext | None = None,
) -> AIAnswerResult:
    question_id = _question_hash(question)
    overall_started = time_module.perf_counter()
    route_confidence = 0.0
    token_budget_limit = max(int(settings.ai_daily_token_limit_per_tenant), 0)
    token_budget_key = _token_budget_key(user_context=user_context, property_id=property_id)
    current_token_usage = (
        await tenant_token_budget_store.get(token_budget_key)
        if token_budget_limit > 0
        else 0
    )
    token_budget_remaining = (
        max(token_budget_limit - current_token_usage, 0)
        if token_budget_limit > 0
        else None
    )
    tenant_scope = _token_budget_scope_key(user_context=user_context, property_id=property_id)

    snapshot, snapshot_cache_status, snapshot_latency_ms = await get_hotel_snapshot(
        db,
        property_id=property_id,
    )

    direct_candidate = _try_direct_answer(question=question, history=history, snapshot=snapshot)
    if (
        direct_candidate is not None
        and direct_candidate.confidence >= settings.ai_direct_query_confidence_threshold
    ):
        route_confidence = direct_candidate.confidence
        total_latency_ms = max(int((time_module.perf_counter() - overall_started) * 1000), 0)
        await api_metrics.record_business_event("ai.query.route.direct_db")
        await api_metrics.record_business_timing("ai.query.total", total_latency_ms)
        await api_metrics.record_business_timing("ai.query.total.route.direct_db", total_latency_ms)
        log_event(
            logger,
            logging.INFO,
            "ai_query_completed",
            route="direct_db",
            model="direct_db",
            route_confidence=route_confidence,
            used_fallback=False,
            question_hash=question_id,
            question_chars=len(question),
            property_id=property_id,
            tenant_scope=tenant_scope,
            snapshot_cache_status=snapshot_cache_status,
            snapshot_latency_ms=snapshot_latency_ms,
            total_latency_ms=total_latency_ms,
            token_budget_remaining=token_budget_remaining,
        )
        return AIAnswerResult(
            question=question,
            answer=direct_candidate.answer,
            model="direct_db",
            route="direct_db",
            route_confidence=route_confidence,
            used_fallback=False,
            highlights=_extract_summary_highlights(snapshot),
            snapshot=snapshot,
            usage=None,
            latency_ms=total_latency_ms,
            snapshot_latency_ms=snapshot_latency_ms,
            llm_latency_ms=None,
            snapshot_cache_status=snapshot_cache_status,
            error=None,
            retry_count=0,
            token_budget_remaining=token_budget_remaining,
        )

    llm_snapshot = _build_llm_snapshot(snapshot)
    usage: AIUsageSummary | None = None
    used_fallback = False
    model_name = settings.ai_openai_model or DEFAULT_OPENAI_MODEL
    route = "llm"
    llm_latency_ms: int | None = None
    retry_count = 0
    error_code: str | None = None
    route_confidence = 0.55
    estimated_token_cost = _estimate_prompt_tokens(
        question=question,
        history=history or [],
        llm_snapshot=llm_snapshot,
    ) + max(int(settings.ai_openai_max_output_tokens), 0)

    if token_budget_limit > 0 and current_token_usage + estimated_token_cost > token_budget_limit:
        used_fallback = True
        route = "budget_fallback"
        route_confidence = 1.0
        model_name = "budget_fallback"
        answer = _token_limit_fallback_answer(snapshot, tenant_scope=tenant_scope)
        error_code = "daily_token_limit_exceeded"
        total_latency_ms = max(int((time_module.perf_counter() - overall_started) * 1000), 0)
        await api_metrics.record_business_event("ai.query.fallback")
        await api_metrics.record_business_event("ai.query.limit_exceeded")
        await api_metrics.record_business_timing("ai.query.total", total_latency_ms)
        await api_metrics.record_business_timing("ai.query.total.route.budget_fallback", total_latency_ms)
        log_event(
            logger,
            logging.WARNING,
            "ai_query_budget_exceeded",
            question_hash=question_id,
            question_chars=len(question),
            property_id=property_id,
            tenant_scope=tenant_scope,
            current_token_usage=current_token_usage,
            estimated_token_cost=estimated_token_cost,
            token_budget_limit=token_budget_limit,
        )
        return AIAnswerResult(
            question=question,
            answer=answer,
            model=model_name,
            route=route,
            route_confidence=route_confidence,
            used_fallback=used_fallback,
            highlights=_extract_summary_highlights(snapshot),
            snapshot=snapshot,
            usage=None,
            latency_ms=total_latency_ms,
            snapshot_latency_ms=snapshot_latency_ms,
            llm_latency_ms=None,
            snapshot_cache_status=snapshot_cache_status,
            error=error_code,
            retry_count=0,
            token_budget_remaining=0,
        )

    try:
        answer, usage, llm_latency_ms, retry_count = await _call_openai_responses_api(
            question=question,
            history=history or [],
            llm_snapshot=llm_snapshot,
            user_context=user_context,
        )
        await api_metrics.record_business_event("ai.query.route.llm")
        await api_metrics.record_business_timing("ai.query.llm", llm_latency_ms)
        if usage is not None:
            await api_metrics.record_business_event("ai.query.tokens.input", usage.input_tokens)
            await api_metrics.record_business_event("ai.query.tokens.output", usage.output_tokens)
            await api_metrics.record_business_event("ai.query.tokens.total", usage.total_tokens)
            current_token_usage = await tenant_token_budget_store.add(
                token_budget_key,
                usage.total_tokens,
            )
            token_budget_remaining = max(token_budget_limit - current_token_usage, 0) if token_budget_limit > 0 else None
        else:
            token_budget_remaining = max(token_budget_limit - current_token_usage, 0) if token_budget_limit > 0 else None
    except Exception as exc:
        used_fallback = True
        route = "fallback"
        model_name = "fallback"
        route_confidence = 0.0
        answer = _fallback_answer(snapshot)
        error_code = "ai_temporarily_unavailable"
        await api_metrics.record_business_event("ai.query.fallback")
        log_event(
            logger,
            logging.ERROR,
            "ai_query_fallback",
            question_hash=question_id,
            question_chars=len(question),
            property_id=property_id,
            tenant_scope=tenant_scope,
            snapshot_cache_status=snapshot_cache_status,
            error=str(exc),
        )

    total_latency_ms = max(int((time_module.perf_counter() - overall_started) * 1000), 0)
    await api_metrics.record_business_timing("ai.query.total", total_latency_ms)
    await api_metrics.record_business_timing(f"ai.query.total.route.{route}", total_latency_ms)
    log_event(
        logger,
        logging.INFO,
        "ai_query_completed",
        route=route,
        model=model_name,
        route_confidence=route_confidence,
        used_fallback=used_fallback,
        question_hash=question_id,
        question_chars=len(question),
        property_id=property_id,
        tenant_scope=tenant_scope,
        snapshot_cache_status=snapshot_cache_status,
        snapshot_latency_ms=snapshot_latency_ms,
        llm_latency_ms=llm_latency_ms,
        total_latency_ms=total_latency_ms,
        retry_count=retry_count,
        usage=usage.model_dump() if usage is not None else None,
        token_budget_remaining=token_budget_remaining,
    )

    return AIAnswerResult(
        question=question,
        answer=answer,
        model=model_name,
        route=route,
        route_confidence=route_confidence,
        used_fallback=used_fallback,
        highlights=_extract_summary_highlights(snapshot),
        snapshot=snapshot,
        usage=usage,
        latency_ms=total_latency_ms,
        snapshot_latency_ms=snapshot_latency_ms,
        llm_latency_ms=llm_latency_ms,
        snapshot_cache_status=snapshot_cache_status,
        error=error_code,
        retry_count=retry_count,
        token_budget_remaining=token_budget_remaining,
    )


async def record_ai_query(
    db: AsyncSession,
    *,
    result: AIAnswerResult,
    user_id: int | None = None,
) -> None:
    db.add(
        DashboardQuery(
            user_id=user_id,
            query_text=result.question,
            ai_response=result.answer,
            response_data_json={
                "model": result.model,
                "route": result.route,
                "route_confidence": result.route_confidence,
                "used_fallback": result.used_fallback,
                "highlights": result.highlights,
                "snapshot_summary": result.snapshot.summary,
                "usage": result.usage.model_dump() if result.usage is not None else None,
                "latency_ms": result.latency_ms,
                "snapshot_latency_ms": result.snapshot_latency_ms,
                "llm_latency_ms": result.llm_latency_ms,
                "snapshot_cache_status": result.snapshot_cache_status,
                "error": result.error,
                "retry_count": result.retry_count,
                "token_budget_remaining": result.token_budget_remaining,
            },
        )
    )
    await db.flush()
