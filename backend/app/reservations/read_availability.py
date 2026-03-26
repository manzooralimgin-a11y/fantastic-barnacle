from __future__ import annotations

import asyncio
import logging
import time as time_module
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.hms.models import HotelReservation, RoomType
from app.hms.room_inventory import (
    BOOKABLE_ROOM_CATEGORY_KEYS,
    inventory_room_numbers,
    is_bookable_room_category,
    normalize_room_category,
    room_category_display_label,
    room_category_for_room,
)
from app.middleware.request_id import get_request_path
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.availability import (
    ACTIVE_RESTAURANT_STATUSES,
    INACTIVE_HOTEL_STATUSES,
    hotel_date_ranges_overlap,
    restaurant_intervals_overlap,
)
from app.reservations.cache import (
    availability_cache_store,
    build_hotel_query_cache_key,
    build_restaurant_query_cache_key,
)
from app.reservations.models import Reservation, Table

logger = logging.getLogger("app.reservations.read_availability")

_RESTAURANT_SLOT_START = time(11, 0)
_RESTAURANT_SLOT_END = time(21, 0)


@dataclass(slots=True)
class _ReadCircuitState:
    consecutive_failures: int = 0
    open_until: float = 0.0


def _duration_ms(started: float) -> int:
    return max(int((time_module.perf_counter() - started) * 1000), 0)


def _request_source(request_source: str | None) -> str:
    if request_source:
        return request_source
    path = get_request_path()
    if path.startswith("/mcp/"):
        return "mcp"
    if path:
        return "api"
    return "service"


def _endpoint_name() -> str:
    return get_request_path() or "service"


async def _increment_counter(metric_name: str, *, availability_type: str, request_source: str) -> None:
    await api_metrics.record_business_event(metric_name)
    await api_metrics.record_business_event(f"{metric_name}.type.{availability_type}")
    await api_metrics.record_business_event(f"{metric_name}.source.{request_source}")
    await api_metrics.record_business_event(
        f"{metric_name}.type.{availability_type}.source.{request_source}"
    )


async def _record_duration(metric_name: str, duration_ms: int, *, availability_type: str, request_source: str) -> None:
    await api_metrics.record_business_timing(metric_name, duration_ms)
    await api_metrics.record_business_timing(f"{metric_name}.type.{availability_type}", duration_ms)
    await api_metrics.record_business_timing(
        f"{metric_name}.type.{availability_type}.source.{request_source}",
        duration_ms,
    )


async def _record_compute_duration(
    metric_name: str,
    duration_ms: int,
    *,
    availability_type: str,
    request_source: str,
) -> None:
    await _record_duration(
        metric_name,
        duration_ms,
        availability_type=availability_type,
        request_source=request_source,
    )


async def _record_version_mismatch(
    *,
    availability_type: str,
    request_source: str,
    endpoint: str,
    entity_id: int,
    previous_version: str,
    current_version: str,
    cache_key: str,
    context: dict[str, Any],
) -> None:
    await api_metrics.record_business_event("availability.cache.stale_read_avoidance")
    log_event(
        logger,
        logging.WARNING,
        "availability_cache_version_mismatch",
        type=availability_type,
        request_source=request_source,
        endpoint=endpoint,
        entity_id=entity_id,
        previous_version=previous_version,
        current_version=current_version,
        cache_key=cache_key,
        **context,
    )


def _restaurant_end_time(start_time: time) -> time:
    anchor = datetime.combine(date(2000, 1, 1), start_time)
    return (anchor + timedelta(minutes=settings.restaurant_availability_duration_minutes)).time()


def _generate_time_grid() -> list[time]:
    interval = max(settings.restaurant_availability_slot_minutes, 5)
    current = datetime.combine(date(2000, 1, 1), _RESTAURANT_SLOT_START)
    end = datetime.combine(date(2000, 1, 1), _RESTAURANT_SLOT_END)
    slots: list[time] = []
    while current <= end:
        slots.append(current.time())
        current += timedelta(minutes=interval)
    return slots


async def generate_restaurant_slots(
    db: AsyncSession,
    *,
    restaurant_id: int,
    reservation_date: date,
    party_size: int,
) -> list[dict[str, Any]]:
    tables = (
        await db.execute(
            select(Table.id, Table.capacity)
            .where(
                Table.restaurant_id == restaurant_id,
                Table.capacity >= party_size,
                Table.is_active.is_(True),
                Table.status == "available",
            )
            .order_by(Table.capacity, Table.id)
        )
    ).all()

    reservation_rows = (
        await db.execute(
            select(
                Reservation.table_id,
                Reservation.start_time,
                Reservation.end_time,
                Reservation.duration_min,
            ).where(
                Reservation.restaurant_id == restaurant_id,
                Reservation.reservation_date == reservation_date,
                Reservation.table_id.is_not(None),
                Reservation.status.in_(ACTIVE_RESTAURANT_STATUSES),
            )
        )
    ).all()

    reservations_by_table: dict[int, list[tuple[time, time]]] = {}
    for table_id, start_time_value, end_time_value, duration_min in reservation_rows:
        if table_id is None:
            continue
        existing_end = end_time_value
        if existing_end is None:
            anchor = datetime.combine(reservation_date, start_time_value)
            existing_end = (anchor + timedelta(minutes=duration_min or 90)).time()
        reservations_by_table.setdefault(table_id, []).append((start_time_value, existing_end))

    slots: list[dict[str, Any]] = []
    for slot_start in _generate_time_grid():
        slot_end = _restaurant_end_time(slot_start)
        available_tables = 0
        for table_id, _capacity in tables:
            overlaps = any(
                restaurant_intervals_overlap(
                    slot_start,
                    slot_end,
                    existing_start,
                    existing_end,
                )
                for existing_start, existing_end in reservations_by_table.get(table_id, [])
            )
            if not overlaps:
                available_tables += 1

        slots.append(
            {
                "start_time": slot_start.strftime("%H:%M"),
                "end_time": slot_end.strftime("%H:%M"),
                "available": available_tables > 0,
                "table_options": available_tables,
            }
        )

    return slots


async def calculate_hotel_availability(
    db: AsyncSession,
    *,
    property_id: int,
    check_in: date,
    check_out: date,
    adults: int,
    children: int,
) -> dict[str, Any]:
    if check_out <= check_in:
        raise HTTPException(status_code=400, detail="check_out must be after check_in")

    room_types = (
        await db.execute(
            select(
                RoomType.id,
                RoomType.name,
                RoomType.max_occupancy,
            ).where(RoomType.property_id == property_id)
        )
    ).all()
    if not room_types:
        raise HTTPException(status_code=404, detail="Hotel property not found")

    room_types_by_category: dict[str, tuple[int, str, int]] = {}
    for room_type_id, name, max_occupancy in room_types:
        category_key = normalize_room_category(name)
        if category_key is None or not is_bookable_room_category(category_key):
            continue
        room_types_by_category.setdefault(
            category_key,
            (room_type_id, room_category_display_label(category_key), max_occupancy),
        )

    if not room_types_by_category:
        raise HTTPException(status_code=404, detail="Hotel property not found")

    reservation_rows = (
        await db.execute(
            select(
                HotelReservation.room_type_id,
                HotelReservation.room,
                HotelReservation.room_type_label,
                HotelReservation.check_in,
                HotelReservation.check_out,
            ).where(
                HotelReservation.property_id == property_id,
                HotelReservation.status.notin_(INACTIVE_HOTEL_STATUSES),
            )
        )
    ).all()

    category_by_room_type_id = {
        room_type_id: category_key
        for category_key, (room_type_id, _name, _max_occupancy) in room_types_by_category.items()
    }

    overlapping_by_category: dict[str, int] = {}
    for room_type_id, room_number, room_type_label, existing_check_in, existing_check_out in reservation_rows:
        if hotel_date_ranges_overlap(check_in, check_out, existing_check_in, existing_check_out):
            category_key = room_category_for_room(room_number)
            if category_key is None and room_type_id is not None:
                category_key = category_by_room_type_id.get(room_type_id)
            if category_key is None and room_type_label:
                category_key = normalize_room_category(room_type_label)
            if category_key is None or not is_bookable_room_category(category_key):
                continue
            overlapping_by_category[category_key] = overlapping_by_category.get(category_key, 0) + 1

    available_room_types: list[dict[str, Any]] = []
    for category_key in BOOKABLE_ROOM_CATEGORY_KEYS:
        room_type_tuple = room_types_by_category.get(category_key)
        if room_type_tuple is None:
            continue
        room_type_id, name, _max_occupancy = room_type_tuple
        total_rooms = len(inventory_room_numbers(category_key))
        overlapping = overlapping_by_category.get(category_key, 0)
        available_rooms = max(total_rooms - overlapping, 0)
        available_room_types.append(
            {
                "room_type_id": room_type_id,
                "name": name,
                "available_rooms": available_rooms,
            }
        )

    return {
        "type": "hotel",
        "check_in": check_in.isoformat(),
        "check_out": check_out.isoformat(),
        "available": any(item["available_rooms"] > 0 for item in available_room_types),
        "room_types": available_room_types,
    }


class AvailabilityReadService:
    _circuits: dict[str, _ReadCircuitState] = {
        "restaurant": _ReadCircuitState(),
        "hotel": _ReadCircuitState(),
    }

    @classmethod
    async def clear_cache(cls) -> None:
        await availability_cache_store.clear()
        cls._circuits = {
            "restaurant": _ReadCircuitState(),
            "hotel": _ReadCircuitState(),
        }

    @classmethod
    def _circuit_is_open(cls, availability_type: str) -> bool:
        state = cls._circuits.setdefault(availability_type, _ReadCircuitState())
        return time_module.monotonic() < state.open_until

    @classmethod
    async def _record_read_success(cls, availability_type: str) -> None:
        state = cls._circuits.setdefault(availability_type, _ReadCircuitState())
        if state.consecutive_failures > 0 or state.open_until > 0:
            await api_metrics.record_business_event("availability.read.circuit_recovered")
            await api_metrics.record_business_event(
                f"availability.read.circuit_recovered.type.{availability_type}"
            )
            log_event(
                logger,
                logging.INFO,
                "availability_read_circuit_recovered",
                type=availability_type,
                previous_failures=state.consecutive_failures,
            )
            log_event(
                logger,
                logging.INFO,
                "circuit_closed",
                component="availability_read",
                type=availability_type,
                previous_failures=state.consecutive_failures,
            )
        state.consecutive_failures = 0
        state.open_until = 0.0

    @classmethod
    async def _record_read_failure(
        cls,
        *,
        availability_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int,
        error: str,
        timed_out: bool,
    ) -> None:
        state = cls._circuits.setdefault(availability_type, _ReadCircuitState())
        state.consecutive_failures += 1
        await _increment_counter(
            "availability.query.failure",
            availability_type=availability_type,
            request_source=request_source,
        )
        if timed_out:
            await _increment_counter(
                "availability.query.timeout",
                availability_type=availability_type,
                request_source=request_source,
            )

        if state.consecutive_failures >= settings.availability_read_failure_threshold:
            state.open_until = (
                time_module.monotonic() + settings.availability_read_circuit_cooldown_seconds
            )
            await api_metrics.record_business_event("availability.read.circuit_open")
            await api_metrics.record_business_event(
                f"availability.read.circuit_open.type.{availability_type}"
            )
            log_event(
                logger,
                logging.ERROR,
                "availability_read_circuit_open",
                type=availability_type,
                request_source=request_source,
                endpoint=endpoint,
                entity_id=entity_id,
                failure_count=state.consecutive_failures,
                cooldown_seconds=settings.availability_read_circuit_cooldown_seconds,
                error=error,
            )
            log_event(
                logger,
                logging.ERROR,
                "circuit_opened",
                component="availability_read",
                type=availability_type,
                request_source=request_source,
                endpoint=endpoint,
                entity_id=entity_id,
                failure_count=state.consecutive_failures,
                cooldown_seconds=settings.availability_read_circuit_cooldown_seconds,
            )

    @classmethod
    async def _guard_live_recompute(
        cls,
        *,
        availability_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int,
    ) -> None:
        if not cls._circuit_is_open(availability_type):
            return
        await api_metrics.record_business_event("availability.read.circuit_open")
        await api_metrics.record_business_event(
            f"availability.read.circuit_open.type.{availability_type}"
        )
        retry_after_ms = max(
            int(
                (
                    cls._circuits[availability_type].open_until
                    - time_module.monotonic()
                )
                * 1000
            ),
            0,
        )
        log_event(
            logger,
            logging.WARNING,
            "availability_read_circuit_open_skip",
            type=availability_type,
            request_source=request_source,
            endpoint=endpoint,
            entity_id=entity_id,
            retry_after_ms=retry_after_ms,
        )
        raise HTTPException(status_code=503, detail="Availability temporarily unavailable")

    @classmethod
    async def _run_live_recompute(
        cls,
        *,
        availability_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int,
        compute_fn,
    ):
        await cls._guard_live_recompute(
            availability_type=availability_type,
            request_source=request_source,
            endpoint=endpoint,
            entity_id=entity_id,
        )
        try:
            result = await asyncio.wait_for(
                compute_fn(),
                timeout=max(settings.availability_query_timeout_ms, 1) / 1000.0,
            )
        except asyncio.TimeoutError as exc:
            await cls._record_read_failure(
                availability_type=availability_type,
                request_source=request_source,
                endpoint=endpoint,
                entity_id=entity_id,
                error="Availability query timed out",
                timed_out=True,
            )
            log_event(
                logger,
                logging.ERROR,
                "availability_query_timeout",
                type=availability_type,
                request_source=request_source,
                endpoint=endpoint,
                entity_id=entity_id,
                timeout_ms=settings.availability_query_timeout_ms,
            )
            raise HTTPException(status_code=503, detail="Availability temporarily unavailable") from exc
        except HTTPException as exc:
            if exc.status_code >= 500:
                await cls._record_read_failure(
                    availability_type=availability_type,
                    request_source=request_source,
                    endpoint=endpoint,
                    entity_id=entity_id,
                    error=str(exc.detail),
                    timed_out=False,
                )
            raise
        except Exception as exc:
            await cls._record_read_failure(
                availability_type=availability_type,
                request_source=request_source,
                endpoint=endpoint,
                entity_id=entity_id,
                error=str(exc),
                timed_out=False,
            )
            raise
        await cls._record_read_success(availability_type)
        return result

    @classmethod
    async def precompute_restaurant_availability(
        cls,
        db: AsyncSession,
        *,
        restaurant_id: int,
        reservation_date: date,
        party_size: int,
    ) -> dict[str, Any]:
        return await cls.get_restaurant_availability(
            db,
            restaurant_id=restaurant_id,
            reservation_date=reservation_date,
            party_size=party_size,
            request_source="precompute",
        )

    @classmethod
    async def precompute_hotel_availability(
        cls,
        db: AsyncSession,
        *,
        property_id: int,
        check_in: date,
        check_out: date,
        adults: int,
        children: int,
    ) -> dict[str, Any]:
        return await cls.get_hotel_availability(
            db,
            property_id=property_id,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            children=children,
            request_source="precompute",
        )

    @classmethod
    async def get_restaurant_availability(
        cls,
        db: AsyncSession,
        *,
        restaurant_id: int,
        reservation_date: date,
        party_size: int,
        request_source: str | None = None,
    ) -> dict[str, Any]:
        source = _request_source(request_source)
        endpoint = _endpoint_name()
        await _increment_counter(
            "availability.query.total",
            availability_type="restaurant",
            request_source=source,
        )
        started = time_module.perf_counter()
        log_event(
            logger,
            logging.INFO,
            "availability_query_started",
            type="restaurant",
            request_source=source,
            endpoint=endpoint,
            entity_id=restaurant_id,
            date=reservation_date.isoformat(),
            party_size=party_size,
        )
        version = await availability_cache_store.get_restaurant_version(
            restaurant_id,
            reservation_date,
        )
        recompute_attempts = 0
        while True:
            cache_key = build_restaurant_query_cache_key(
                restaurant_id=restaurant_id,
                reservation_date=reservation_date,
                party_size=party_size,
                version=version,
            )
            cached = await availability_cache_store.get(cache_key)
            if cached is not None:
                current_version = await availability_cache_store.get_restaurant_version(
                    restaurant_id,
                    reservation_date,
                )
                if current_version == version:
                    await _increment_counter(
                        "availability.cache.hit",
                        availability_type="restaurant",
                        request_source=source,
                    )
                    duration_ms = _duration_ms(started)
                    await _record_duration(
                        "availability.query.duration_ms",
                        duration_ms,
                        availability_type="restaurant",
                        request_source=source,
                    )
                    log_event(
                        logger,
                        logging.INFO,
                        "availability_query_completed",
                        type="restaurant",
                        request_source=source,
                        endpoint=endpoint,
                        entity_id=restaurant_id,
                        date=reservation_date.isoformat(),
                        party_size=party_size,
                        cache_hit=True,
                        duration_ms=duration_ms,
                        slot_count=len(cached.get("slots", [])),
                    )
                    return cached
                await _record_version_mismatch(
                    availability_type="restaurant",
                    request_source=source,
                    endpoint=endpoint,
                    entity_id=restaurant_id,
                    previous_version=str(version),
                    current_version=str(current_version),
                    cache_key=cache_key,
                    context={
                        "date": reservation_date.isoformat(),
                        "party_size": party_size,
                    },
                )
                version = current_version
                recompute_attempts += 1
                continue

            await _increment_counter(
                "availability.cache.miss",
                availability_type="restaurant",
                request_source=source,
            )
            log_event(
                logger,
                logging.INFO,
                "availability_cache_miss_requiring_live_recomputation",
                type="restaurant",
                request_source=source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                date=reservation_date.isoformat(),
                party_size=party_size,
                cache_key=cache_key,
                version=version,
            )
            compute_started = time_module.perf_counter()
            slots = await cls._run_live_recompute(
                availability_type="restaurant",
                request_source=source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                compute_fn=lambda: generate_restaurant_slots(
                    db,
                    restaurant_id=restaurant_id,
                    reservation_date=reservation_date,
                    party_size=party_size,
                ),
            )
            compute_duration_ms = _duration_ms(compute_started)
            await _record_compute_duration(
                "availability.slot_generation.duration_ms",
                compute_duration_ms,
                availability_type="restaurant",
                request_source=source,
            )
            latest_version = await availability_cache_store.get_restaurant_version(
                restaurant_id,
                reservation_date,
            )
            if latest_version != version and recompute_attempts < 2:
                await _record_version_mismatch(
                    availability_type="restaurant",
                    request_source=source,
                    endpoint=endpoint,
                    entity_id=restaurant_id,
                    previous_version=str(version),
                    current_version=str(latest_version),
                    cache_key=cache_key,
                    context={
                        "date": reservation_date.isoformat(),
                        "party_size": party_size,
                    },
                )
                version = latest_version
                recompute_attempts += 1
                continue

            payload = {
                "type": "restaurant",
                "date": reservation_date.isoformat(),
                "slots": slots,
            }
            await availability_cache_store.set(
                cache_key,
                payload,
                settings.availability_cache_ttl_seconds,
            )
            log_event(
                logger,
                logging.INFO,
                "availability_cache_rebuild_triggered",
                type="restaurant",
                request_source=source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                date=reservation_date.isoformat(),
                party_size=party_size,
                cache_key=cache_key,
                version=version,
                duration_ms=compute_duration_ms,
            )
            duration_ms = _duration_ms(started)
            await _record_duration(
                "availability.query.duration_ms",
                duration_ms,
                availability_type="restaurant",
                request_source=source,
            )
            log_event(
                logger,
                logging.INFO,
                "availability_query_completed",
                type="restaurant",
                request_source=source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                date=reservation_date.isoformat(),
                party_size=party_size,
                cache_hit=False,
                duration_ms=duration_ms,
                slot_count=len(slots),
            )
            return payload

    @classmethod
    async def get_hotel_availability(
        cls,
        db: AsyncSession,
        *,
        property_id: int,
        check_in: date,
        check_out: date,
        adults: int,
        children: int,
        request_source: str | None = None,
    ) -> dict[str, Any]:
        source = _request_source(request_source)
        endpoint = _endpoint_name()
        await _increment_counter(
            "availability.query.total",
            availability_type="hotel",
            request_source=source,
        )
        started = time_module.perf_counter()
        log_event(
            logger,
            logging.INFO,
            "availability_query_started",
            type="hotel",
            request_source=source,
            endpoint=endpoint,
            entity_id=property_id,
            check_in=check_in.isoformat(),
            check_out=check_out.isoformat(),
            adults=adults,
            children=children,
        )
        version_token = await availability_cache_store.get_hotel_version_token(
            property_id=property_id,
            check_in=check_in,
            check_out=check_out,
        )
        recompute_attempts = 0
        while True:
            cache_key = build_hotel_query_cache_key(
                property_id=property_id,
                check_in=check_in,
                check_out=check_out,
                adults=adults,
                children=children,
                version_token=version_token,
            )
            cached = await availability_cache_store.get(cache_key)
            if cached is not None:
                current_version_token = await availability_cache_store.get_hotel_version_token(
                    property_id=property_id,
                    check_in=check_in,
                    check_out=check_out,
                )
                if current_version_token == version_token:
                    await _increment_counter(
                        "availability.cache.hit",
                        availability_type="hotel",
                        request_source=source,
                    )
                    duration_ms = _duration_ms(started)
                    await _record_duration(
                        "availability.query.duration_ms",
                        duration_ms,
                        availability_type="hotel",
                        request_source=source,
                    )
                    log_event(
                        logger,
                        logging.INFO,
                        "availability_query_completed",
                        type="hotel",
                        request_source=source,
                        endpoint=endpoint,
                        entity_id=property_id,
                        check_in=check_in.isoformat(),
                        check_out=check_out.isoformat(),
                        adults=adults,
                        children=children,
                        cache_hit=True,
                        duration_ms=duration_ms,
                        room_type_count=len(cached.get("room_types", [])),
                    )
                    return cached
                await _record_version_mismatch(
                    availability_type="hotel",
                    request_source=source,
                    endpoint=endpoint,
                    entity_id=property_id,
                    previous_version=version_token,
                    current_version=current_version_token,
                    cache_key=cache_key,
                    context={
                        "check_in": check_in.isoformat(),
                        "check_out": check_out.isoformat(),
                        "adults": adults,
                        "children": children,
                    },
                )
                version_token = current_version_token
                recompute_attempts += 1
                continue

            await _increment_counter(
                "availability.cache.miss",
                availability_type="hotel",
                request_source=source,
            )
            log_event(
                logger,
                logging.INFO,
                "availability_cache_miss_requiring_live_recomputation",
                type="hotel",
                request_source=source,
                endpoint=endpoint,
                entity_id=property_id,
                check_in=check_in.isoformat(),
                check_out=check_out.isoformat(),
                adults=adults,
                children=children,
                cache_key=cache_key,
                version_token=version_token,
            )
            compute_started = time_module.perf_counter()
            payload = await cls._run_live_recompute(
                availability_type="hotel",
                request_source=source,
                endpoint=endpoint,
                entity_id=property_id,
                compute_fn=lambda: calculate_hotel_availability(
                    db,
                    property_id=property_id,
                    check_in=check_in,
                    check_out=check_out,
                    adults=adults,
                    children=children,
                ),
            )
            compute_duration_ms = _duration_ms(compute_started)
            await _record_compute_duration(
                "availability.hotel_availability.duration_ms",
                compute_duration_ms,
                availability_type="hotel",
                request_source=source,
            )
            latest_version_token = await availability_cache_store.get_hotel_version_token(
                property_id=property_id,
                check_in=check_in,
                check_out=check_out,
            )
            if latest_version_token != version_token and recompute_attempts < 2:
                await _record_version_mismatch(
                    availability_type="hotel",
                    request_source=source,
                    endpoint=endpoint,
                    entity_id=property_id,
                    previous_version=version_token,
                    current_version=latest_version_token,
                    cache_key=cache_key,
                    context={
                        "check_in": check_in.isoformat(),
                        "check_out": check_out.isoformat(),
                        "adults": adults,
                        "children": children,
                    },
                )
                version_token = latest_version_token
                recompute_attempts += 1
                continue

            await availability_cache_store.set(
                cache_key,
                payload,
                settings.availability_cache_ttl_seconds,
            )
            log_event(
                logger,
                logging.INFO,
                "availability_cache_rebuild_triggered",
                type="hotel",
                request_source=source,
                endpoint=endpoint,
                entity_id=property_id,
                check_in=check_in.isoformat(),
                check_out=check_out.isoformat(),
                adults=adults,
                children=children,
                cache_key=cache_key,
                version_token=version_token,
                duration_ms=compute_duration_ms,
            )
            duration_ms = _duration_ms(started)
            await _record_duration(
                "availability.query.duration_ms",
                duration_ms,
                availability_type="hotel",
                request_source=source,
            )
            log_event(
                logger,
                logging.INFO,
                "availability_query_completed",
                type="hotel",
                request_source=source,
                endpoint=endpoint,
                entity_id=property_id,
                check_in=check_in.isoformat(),
                check_out=check_out.isoformat(),
                adults=adults,
                children=children,
                cache_hit=False,
                duration_ms=duration_ms,
                room_type_count=len(payload.get("room_types", [])),
            )
            return payload
