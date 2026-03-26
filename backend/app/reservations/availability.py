from __future__ import annotations

import hashlib
import logging
import time as time_module
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.hms.models import HotelReservation as HotelReservationRecord, Room, RoomType
from app.hms.room_inventory import (
    inventory_room_numbers,
    normalize_room_category,
    normalize_room_number,
    room_category_for_room,
)
from app.middleware.request_id import get_request_path
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.domain import Reservation as DomainReservation
from app.reservations.models import Reservation as RestaurantReservationRecord, Table

ACTIVE_RESTAURANT_STATUSES = {"confirmed", "seated", "arrived"}
INACTIVE_HOTEL_STATUSES = {"cancelled", "checked_out", "checked-out"}
_AVAILABILITY_GUARD_KEY = "reservation_availability_checked"

logger = logging.getLogger("app.reservations.availability")


def restaurant_intervals_overlap(
    start_time: time,
    end_time: time,
    existing_start: time,
    existing_end: time,
) -> bool:
    return not (end_time <= existing_start or start_time >= existing_end)


def hotel_date_ranges_overlap(
    check_in: date,
    check_out: date,
    existing_check_in: date,
    existing_check_out: date,
) -> bool:
    return not (check_out <= existing_check_in or check_in >= existing_check_out)


def _restaurant_end_time(start_time: time, duration_min: int, explicit_end: time | None) -> time:
    if explicit_end is not None:
        return explicit_end
    anchor = datetime.combine(date(2000, 1, 1), start_time)
    return (anchor + timedelta(minutes=duration_min)).time()


def _stable_lock_key(namespace: str, *parts: object) -> int:
    raw = "::".join([namespace, *(str(part) for part in parts)])
    digest = hashlib.blake2b(raw.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=False) & ((1 << 63) - 1)


async def _acquire_transaction_lock(
    db: AsyncSession,
    namespace: str,
    *parts: object,
) -> None:
    lock_key = _stable_lock_key(namespace, *parts)
    await db.execute(select(func.pg_advisory_xact_lock(lock_key)))


def _elapsed_ms(started: float) -> int:
    return max(int((time_module.perf_counter() - started) * 1000), 0)


async def _configure_lock_timeout(db: AsyncSession) -> None:
    await db.execute(
        text(f"SET LOCAL lock_timeout = '{max(settings.reservation_lock_timeout_ms, 1)}ms'")
    )


def _is_lock_timeout_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "lock timeout" in message or "canceling statement due to lock timeout" in message


def _is_deadlock_error(exc: Exception) -> bool:
    return "deadlock detected" in str(exc).lower()


def _request_source(reservation: DomainReservation) -> str:
    endpoint = get_request_path()
    if endpoint == "/api/reservations":
        return "canonical"
    if endpoint.startswith("/mcp/"):
        return "mcp"
    if endpoint.startswith("/internal/"):
        return "internal"
    if reservation.source == "mcp":
        return "mcp"
    return reservation.source or "service"


def _endpoint_name(reservation: DomainReservation) -> str:
    endpoint = get_request_path()
    if endpoint:
        return endpoint
    if reservation.source == "mcp":
        return "/mcp/tool"
    return "service"


def _restaurant_window(
    reservation_date: date,
    start_time: time,
    end_time: time,
) -> tuple[datetime, datetime]:
    return (
        datetime.combine(reservation_date, start_time),
        datetime.combine(reservation_date, end_time),
    )


def _restaurant_time_range(reservation_date: date, start_time: time, end_time: time) -> str:
    start_dt, end_dt = _restaurant_window(reservation_date, start_time, end_time)
    return f"{start_dt.isoformat()}->{end_dt.isoformat()}"


def _hotel_time_range(check_in: date, check_out: date) -> str:
    return f"{check_in.isoformat()}->{check_out.isoformat()}"


class ReservationAvailabilityService:
    @staticmethod
    def _set_guard(db: AsyncSession, reservation_type: str) -> None:
        db.info[_AVAILABILITY_GUARD_KEY] = reservation_type

    @classmethod
    async def _increment_metric(
        cls,
        metric_name: str,
        *,
        reservation_type: str,
        request_source: str,
    ) -> None:
        await api_metrics.record_business_event(metric_name)
        await api_metrics.record_business_event(f"{metric_name}.type.{reservation_type}")
        await api_metrics.record_business_event(f"{metric_name}.source.{request_source}")
        await api_metrics.record_business_event(
            f"{metric_name}.type.{reservation_type}.source.{request_source}"
        )

    @classmethod
    async def _record_check_started(cls, **fields) -> None:
        await cls._increment_metric(
            "reservation.availability.check.total",
            reservation_type=fields["type"],
            request_source=fields["request_source"],
        )
        log_event(logger, logging.INFO, "reservation_availability_check_started", **fields)

    @staticmethod
    async def _record_check_duration(
        *,
        reservation_type: str,
        request_source: str,
        duration_ms: int,
    ) -> None:
        await api_metrics.record_business_timing(
            "reservation.availability.check.duration_ms",
            duration_ms,
        )
        await api_metrics.record_business_timing(
            f"reservation.availability.check.duration_ms.type.{reservation_type}",
            duration_ms,
        )
        await api_metrics.record_business_timing(
            f"reservation.availability.check.duration_ms.type.{reservation_type}.source.{request_source}",
            duration_ms,
        )

    @staticmethod
    async def _record_lock_wait_metric(
        *,
        reservation_type: str,
        request_source: str,
        duration_ms: int,
    ) -> None:
        await api_metrics.record_business_timing(
            "reservation.lock.wait_ms",
            duration_ms,
        )
        await api_metrics.record_business_timing(
            f"reservation.lock.wait_ms.type.{reservation_type}",
            duration_ms,
        )
        await api_metrics.record_business_timing(
            f"reservation.lock.wait_ms.type.{reservation_type}.source.{request_source}",
            duration_ms,
        )

    @classmethod
    async def _log_lock(
        cls,
        *,
        reservation_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int | None,
        table_id: int | None,
        room_id: str | None,
        room_type_id: int | None,
        start: datetime | None,
        end: datetime | None,
        check_in: date | None,
        check_out: date | None,
        wait_ms: int,
    ) -> None:
        payload = {
            "type": reservation_type,
            "request_source": request_source,
            "endpoint": endpoint,
            "entity_id": entity_id,
            "table_id": table_id,
            "room_id": room_id,
            "room_type_id": room_type_id,
            "start": start,
            "end": end,
            "check_in": check_in,
            "check_out": check_out,
            "conflict_count": 0,
            "duration_ms": wait_ms,
            "lock_wait_ms": wait_ms,
        }
        log_event(logger, logging.INFO, "reservation_lock_wait_time", **payload)
        log_event(logger, logging.INFO, "reservation_lock_acquired", **payload)
        await cls._record_lock_wait_metric(
            reservation_type=reservation_type,
            request_source=request_source,
            duration_ms=wait_ms,
        )
        await api_metrics.record_reservation_lock_wait(
            reservation_type=reservation_type,
            request_source=request_source,
            endpoint=endpoint,
            entity_id=entity_id,
            table_id=table_id,
            room_id=room_id,
            room_type_id=room_type_id,
            wait_ms=wait_ms,
            contention_threshold_ms=settings.reservation_lock_contention_threshold_ms,
        )
        if wait_ms >= settings.reservation_lock_contention_threshold_ms:
            await cls._increment_metric(
                "reservation.lock.contention",
                reservation_type=reservation_type,
                request_source=request_source,
            )

    @classmethod
    async def _record_conflict(
        cls,
        *,
        reservation_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int | None,
        table_id: int | None,
        room_id: str | None,
        room_type_id: int | None,
        start: datetime | None,
        end: datetime | None,
        check_in: date | None,
        check_out: date | None,
        conflict_count: int,
        duration_ms: int,
        lock_wait_ms: int | None,
        time_range: str | None,
    ) -> None:
        payload = {
            "type": reservation_type,
            "request_source": request_source,
            "endpoint": endpoint,
            "entity_id": entity_id,
            "table_id": table_id,
            "room_id": room_id,
            "room_type_id": room_type_id,
            "start": start,
            "end": end,
            "check_in": check_in,
            "check_out": check_out,
            "conflict_count": conflict_count,
            "duration_ms": duration_ms,
            "lock_wait_ms": lock_wait_ms,
        }
        log_event(logger, logging.WARNING, "reservation_conflict_detected", **payload)
        await cls._increment_metric(
            f"reservation.availability.conflict.{reservation_type}",
            reservation_type=reservation_type,
            request_source=request_source,
        )
        await api_metrics.record_reservation_conflict(
            reservation_type=reservation_type,
            request_source=request_source,
            endpoint=endpoint,
            entity_id=entity_id,
            table_id=table_id,
            room_id=room_id,
            room_type_id=room_type_id,
            time_range=time_range,
            conflict_count=conflict_count,
        )

    @classmethod
    async def _record_check_finished(
        cls,
        event_name: str,
        *,
        reservation_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int | None,
        table_id: int | None,
        room_id: str | None,
        room_type_id: int | None,
        start: datetime | None,
        end: datetime | None,
        check_in: date | None,
        check_out: date | None,
        conflict_count: int,
        duration_ms: int,
        lock_wait_ms: int,
        status_code: int | None = None,
        error: str | None = None,
    ) -> None:
        payload = {
            "type": reservation_type,
            "request_source": request_source,
            "endpoint": endpoint,
            "entity_id": entity_id,
            "table_id": table_id,
            "room_id": room_id,
            "room_type_id": room_type_id,
            "start": start,
            "end": end,
            "check_in": check_in,
            "check_out": check_out,
            "conflict_count": conflict_count,
            "duration_ms": duration_ms,
            "lock_wait_ms": lock_wait_ms,
        }
        if status_code is not None:
            payload["status_code"] = status_code
        if error is not None:
            payload["error"] = error
        if event_name == "reservation_availability_check_failed":
            await cls._increment_metric(
                "reservation.availability.check.failed",
                reservation_type=reservation_type,
                request_source=request_source,
            )
            log_event(logger, logging.WARNING, event_name, **payload)
        else:
            log_event(logger, logging.INFO, event_name, **payload)

        await cls._record_check_duration(
            reservation_type=reservation_type,
            request_source=request_source,
            duration_ms=duration_ms,
        )

        if duration_ms >= settings.reservation_availability_slow_ms:
            log_event(
                logger,
                logging.WARNING,
                "reservation_availability_slow",
                query_type=reservation_type,
                type=reservation_type,
                request_source=request_source,
                endpoint=endpoint,
                entity_id=entity_id,
                table_id=table_id,
                room_id=room_id,
                room_type_id=room_type_id,
                start=start,
                end=end,
                check_in=check_in,
                check_out=check_out,
                conflict_count=conflict_count,
                duration_ms=duration_ms,
                lock_wait_ms=lock_wait_ms,
                lock_wait_contributed=lock_wait_ms > 0,
            )

    @classmethod
    async def _handle_lock_exception(
        cls,
        *,
        exc: Exception,
        reservation_type: str,
        request_source: str,
        endpoint: str,
        entity_id: int | None,
        table_id: int | None,
        room_id: str | None,
        room_type_id: int | None,
        start: datetime | None,
        end: datetime | None,
        check_in: date | None,
        check_out: date | None,
        duration_ms: int,
        lock_wait_ms: int,
    ) -> None:
        payload = {
            "type": reservation_type,
            "request_source": request_source,
            "endpoint": endpoint,
            "entity_id": entity_id,
            "table_id": table_id,
            "room_id": room_id,
            "room_type_id": room_type_id,
            "start": start,
            "end": end,
            "check_in": check_in,
            "check_out": check_out,
            "conflict_count": 0,
            "duration_ms": duration_ms,
            "lock_wait_ms": lock_wait_ms,
            "error": str(exc),
        }
        if _is_lock_timeout_error(exc):
            await cls._increment_metric(
                "reservation.lock.timeout",
                reservation_type=reservation_type,
                request_source=request_source,
            )
            log_event(logger, logging.WARNING, "reservation_lock_timeout", **payload)
            raise HTTPException(
                status_code=503,
                detail="Reservation availability lock timed out",
            ) from exc
        if _is_deadlock_error(exc):
            await cls._increment_metric(
                "reservation.lock.deadlock_prevented",
                reservation_type=reservation_type,
                request_source=request_source,
            )
            log_event(logger, logging.WARNING, "reservation_deadlock_prevented", **payload)
            raise HTTPException(
                status_code=503,
                detail="Reservation concurrency protection prevented a deadlock",
            ) from exc
        raise exc

    @classmethod
    async def prepare_restaurant_reservation(
        cls,
        db: AsyncSession,
        reservation: DomainReservation,
        *,
        restaurant_id: int,
    ) -> DomainReservation:
        db.info.pop(_AVAILABILITY_GUARD_KEY, None)
        await _configure_lock_timeout(db)
        requested_end = _restaurant_end_time(
            reservation.start_time,
            reservation.duration_min,
            reservation.end_time,
        )
        request_source = _request_source(reservation)
        endpoint = _endpoint_name(reservation)
        start_dt, end_dt = _restaurant_window(
            reservation.reservation_date,
            reservation.start_time,
            requested_end,
        )
        check_started = time_module.perf_counter()
        total_lock_wait_ms = 0
        conflict_count = 0
        effective_table_id = reservation.table_id
        await cls._record_check_started(
            type="restaurant",
            request_source=request_source,
            endpoint=endpoint,
            entity_id=restaurant_id,
            table_id=effective_table_id,
            room_id=None,
            room_type_id=None,
            start=start_dt,
            end=end_dt,
            check_in=None,
            check_out=None,
            conflict_count=0,
            duration_ms=0,
            lock_wait_ms=None,
        )
        if requested_end <= reservation.start_time:
            duration_ms = _elapsed_ms(check_started)
            await cls._record_check_finished(
                "reservation_availability_check_failed",
                reservation_type="restaurant",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                table_id=effective_table_id,
                room_id=None,
                room_type_id=None,
                start=start_dt,
                end=end_dt,
                check_in=None,
                check_out=None,
                conflict_count=0,
                duration_ms=duration_ms,
                lock_wait_ms=0,
                status_code=400,
                error="Reservation end_time must be after start_time",
            )
            raise HTTPException(
                status_code=400,
                detail="Reservation end_time must be after start_time",
            )

        try:
            if reservation.table_id is not None:
                lock_wait_ms = await cls._lock_table(
                    db,
                    restaurant_id=restaurant_id,
                    table_id=reservation.table_id,
                )
                total_lock_wait_ms += lock_wait_ms
                await cls._log_lock(
                    reservation_type="restaurant",
                    request_source=request_source,
                    endpoint=endpoint,
                    entity_id=restaurant_id,
                    table_id=reservation.table_id,
                    room_id=None,
                    room_type_id=None,
                    start=start_dt,
                    end=end_dt,
                    check_in=None,
                    check_out=None,
                    wait_ms=lock_wait_ms,
                )
                conflict_count, conflict_duration_ms = await cls._restaurant_table_conflict_count(
                    db,
                    restaurant_id=restaurant_id,
                    table_id=reservation.table_id,
                    reservation_date=reservation.reservation_date,
                    start_time=reservation.start_time,
                    end_time=requested_end,
                )
                if conflict_count:
                    await cls._record_conflict(
                        reservation_type="restaurant",
                        request_source=request_source,
                        endpoint=endpoint,
                        entity_id=restaurant_id,
                        table_id=reservation.table_id,
                        room_id=None,
                        room_type_id=None,
                        start=start_dt,
                        end=end_dt,
                        check_in=None,
                        check_out=None,
                        conflict_count=conflict_count,
                        duration_ms=conflict_duration_ms,
                        lock_wait_ms=total_lock_wait_ms,
                        time_range=_restaurant_time_range(
                            reservation.reservation_date,
                            reservation.start_time,
                            requested_end,
                        ),
                    )
                    raise HTTPException(
                        status_code=409,
                        detail="Table is already booked for the requested time",
                    )
                prepared = reservation.copy_with(restaurant_id=restaurant_id)
            else:
                assigned_table_id, lock_wait_ms = await cls._assign_available_table(
                    db,
                    restaurant=reservation,
                    restaurant_id=restaurant_id,
                    party_size=reservation.party_size or 1,
                    reservation_date=reservation.reservation_date,
                    start_time=reservation.start_time,
                    end_time=requested_end,
                    request_source=request_source,
                    endpoint=endpoint,
                    start_dt=start_dt,
                    end_dt=end_dt,
                )
                total_lock_wait_ms += lock_wait_ms
                effective_table_id = assigned_table_id
                if assigned_table_id is None:
                    prepared = reservation.copy_with(restaurant_id=restaurant_id)
                else:
                    prepared = reservation.copy_with(
                        restaurant_id=restaurant_id,
                        table_id=assigned_table_id,
                    )

            cls._set_guard(db, "restaurant")
            duration_ms = _elapsed_ms(check_started)
            await cls._record_check_finished(
                "reservation_availability_check_passed",
                reservation_type="restaurant",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                table_id=effective_table_id,
                room_id=None,
                room_type_id=None,
                start=start_dt,
                end=end_dt,
                check_in=None,
                check_out=None,
                conflict_count=conflict_count,
                duration_ms=duration_ms,
                lock_wait_ms=total_lock_wait_ms,
            )
            return prepared
        except HTTPException as exc:
            duration_ms = _elapsed_ms(check_started)
            await cls._record_check_finished(
                "reservation_availability_check_failed",
                reservation_type="restaurant",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                table_id=effective_table_id,
                room_id=None,
                room_type_id=None,
                start=start_dt,
                end=end_dt,
                check_in=None,
                check_out=None,
                conflict_count=conflict_count,
                duration_ms=duration_ms,
                lock_wait_ms=total_lock_wait_ms,
                status_code=exc.status_code,
                error=str(exc.detail),
            )
            raise
        except DBAPIError as exc:
            await cls._handle_lock_exception(
                exc=exc,
                reservation_type="restaurant",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                table_id=effective_table_id,
                room_id=None,
                room_type_id=None,
                start=start_dt,
                end=end_dt,
                check_in=None,
                check_out=None,
                duration_ms=_elapsed_ms(check_started),
                lock_wait_ms=total_lock_wait_ms,
            )
            raise

    @classmethod
    async def prepare_hotel_reservation(
        cls,
        db: AsyncSession,
        reservation: DomainReservation,
        *,
        property_id: int,
        room_type: RoomType | None,
        room_type_label: str,
    ) -> DomainReservation:
        db.info.pop(_AVAILABILITY_GUARD_KEY, None)
        await _configure_lock_timeout(db)
        request_source = _request_source(reservation)
        endpoint = _endpoint_name(reservation)
        check_started = time_module.perf_counter()
        total_lock_wait_ms = 0
        conflict_count = 0
        effective_room_id = reservation.room
        effective_room_type_id = room_type.id if room_type is not None else reservation.room_type_id
        await cls._record_check_started(
            type="hotel",
            request_source=request_source,
            endpoint=endpoint,
            entity_id=property_id,
            table_id=None,
            room_id=effective_room_id,
            room_type_id=effective_room_type_id,
            start=None,
            end=None,
            check_in=reservation.check_in,
            check_out=reservation.check_out,
            conflict_count=0,
            duration_ms=0,
            lock_wait_ms=None,
        )

        try:
            if reservation.room:
                normalized_room_number = normalize_room_number(reservation.room)
                inventory_category = room_category_for_room(normalized_room_number)
                if inventory_category is None:
                    raise HTTPException(status_code=404, detail="Room not found")
                room_record, row_lock_wait_ms = await cls._lock_room_by_number(
                    db,
                    property_id=property_id,
                    room_number=normalized_room_number,
                )
                total_lock_wait_ms += row_lock_wait_ms
                await cls._log_lock(
                    reservation_type="hotel",
                    request_source=request_source,
                    endpoint=endpoint,
                    entity_id=property_id,
                    table_id=None,
                    room_id=normalized_room_number,
                    room_type_id=effective_room_type_id,
                    start=None,
                    end=None,
                    check_in=reservation.check_in,
                    check_out=reservation.check_out,
                    wait_ms=row_lock_wait_ms,
                )
                if room_record is None:
                    raise HTTPException(status_code=404, detail="Room not found")
                room_inventory_category = room_category_for_room(room_record.room_number)
                if room_inventory_category is None:
                    raise HTTPException(status_code=404, detail="Room not found")
                if room_type is not None and room_record.room_type_id != room_type.id:
                    raise HTTPException(
                        status_code=400,
                        detail="Room does not belong to the selected room type",
                    )
                if room_type is not None:
                    room_type_category = normalize_room_category(room_type.name)
                    if room_type_category is None or room_inventory_category != room_type_category:
                        raise HTTPException(
                            status_code=400,
                            detail="Room does not belong to the selected room type",
                        )
                if room_type is not None:
                    candidate_rooms, candidate_lock_wait_ms = await cls._locked_rooms_for_type(
                        db,
                        property_id=property_id,
                        room_type_id=room_type.id,
                        room_numbers=inventory_room_numbers(room_inventory_category),
                    )
                    total_lock_wait_ms += candidate_lock_wait_ms
                    await cls._log_lock(
                        reservation_type="hotel",
                        request_source=request_source,
                        endpoint=endpoint,
                        entity_id=property_id,
                        table_id=None,
                        room_id=reservation.room,
                        room_type_id=room_type.id,
                        start=None,
                        end=None,
                        check_in=reservation.check_in,
                        check_out=reservation.check_out,
                        wait_ms=candidate_lock_wait_ms,
                    )
                    overlapping, conflict_duration_ms = await cls._overlapping_hotel_reservations(
                        db,
                        property_id=property_id,
                        check_in=reservation.check_in,
                        check_out=reservation.check_out,
                        room_type_id=room_type.id,
                    )
                    conflict_count = len(overlapping)
                    if candidate_rooms and conflict_count >= len(candidate_rooms):
                        await cls._record_conflict(
                            reservation_type="hotel",
                            request_source=request_source,
                            endpoint=endpoint,
                            entity_id=property_id,
                            table_id=None,
                            room_id=reservation.room,
                            room_type_id=room_type.id,
                            start=None,
                            end=None,
                            check_in=reservation.check_in,
                            check_out=reservation.check_out,
                            conflict_count=conflict_count,
                            duration_ms=conflict_duration_ms,
                            lock_wait_ms=total_lock_wait_ms,
                            time_range=_hotel_time_range(reservation.check_in, reservation.check_out),
                        )
                        raise HTTPException(
                            status_code=409,
                            detail="No rooms available for the requested dates",
                        )
                advisory_started = time_module.perf_counter()
                await _acquire_transaction_lock(
                    db,
                    "hotel-room",
                    property_id,
                    normalized_room_number,
                )
                advisory_wait_ms = _elapsed_ms(advisory_started)
                total_lock_wait_ms += advisory_wait_ms
                await cls._log_lock(
                    reservation_type="hotel",
                    request_source=request_source,
                    endpoint=endpoint,
                    entity_id=property_id,
                    table_id=None,
                    room_id=normalized_room_number,
                    room_type_id=effective_room_type_id,
                    start=None,
                    end=None,
                    check_in=reservation.check_in,
                    check_out=reservation.check_out,
                    wait_ms=advisory_wait_ms,
                )
                room_conflict_count, room_conflict_duration_ms = await cls._hotel_room_conflict_count(
                    db,
                    property_id=property_id,
                    room_number=normalized_room_number,
                    check_in=reservation.check_in,
                    check_out=reservation.check_out,
                )
                if room_conflict_count:
                    conflict_count = room_conflict_count
                    await cls._record_conflict(
                        reservation_type="hotel",
                        request_source=request_source,
                        endpoint=endpoint,
                        entity_id=property_id,
                        table_id=None,
                        room_id=normalized_room_number,
                        room_type_id=effective_room_type_id,
                        start=None,
                        end=None,
                        check_in=reservation.check_in,
                        check_out=reservation.check_out,
                        conflict_count=room_conflict_count,
                        duration_ms=room_conflict_duration_ms,
                        lock_wait_ms=total_lock_wait_ms,
                        time_range=_hotel_time_range(reservation.check_in, reservation.check_out),
                    )
                    raise HTTPException(
                        status_code=409,
                        detail="Room is already booked for the requested dates",
                    )
                prepared = reservation.copy_with(
                    property_id=property_id,
                    room=normalized_room_number,
                    room_type_id=room_type.id if room_type is not None else reservation.room_type_id,
                    room_type_label=room_type_label,
                )
            else:
                if room_type is None:
                    raise HTTPException(
                        status_code=400,
                        detail="room_type_id or room_type_label is required for availability",
                    )

                assigned_room, lock_wait_ms = await cls._assign_available_room(
                    db,
                    property_id=property_id,
                    room_type=room_type,
                    check_in=reservation.check_in,
                    check_out=reservation.check_out,
                    request_source=request_source,
                    endpoint=endpoint,
                )
                total_lock_wait_ms += lock_wait_ms
                effective_room_id = assigned_room
                prepared = reservation.copy_with(
                    property_id=property_id,
                    room=assigned_room,
                    room_type_id=room_type.id,
                    room_type_label=room_type_label,
                )

            cls._set_guard(db, "hotel")
            duration_ms = _elapsed_ms(check_started)
            await cls._record_check_finished(
                "reservation_availability_check_passed",
                reservation_type="hotel",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=property_id,
                table_id=None,
                room_id=effective_room_id,
                room_type_id=effective_room_type_id,
                start=None,
                end=None,
                check_in=reservation.check_in,
                check_out=reservation.check_out,
                conflict_count=conflict_count,
                duration_ms=duration_ms,
                lock_wait_ms=total_lock_wait_ms,
            )
            return prepared
        except HTTPException as exc:
            duration_ms = _elapsed_ms(check_started)
            await cls._record_check_finished(
                "reservation_availability_check_failed",
                reservation_type="hotel",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=property_id,
                table_id=None,
                room_id=effective_room_id,
                room_type_id=effective_room_type_id,
                start=None,
                end=None,
                check_in=reservation.check_in,
                check_out=reservation.check_out,
                conflict_count=conflict_count,
                duration_ms=duration_ms,
                lock_wait_ms=total_lock_wait_ms,
                status_code=exc.status_code,
                error=str(exc.detail),
            )
            raise
        except DBAPIError as exc:
            await cls._handle_lock_exception(
                exc=exc,
                reservation_type="hotel",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=property_id,
                table_id=None,
                room_id=effective_room_id,
                room_type_id=effective_room_type_id,
                start=None,
                end=None,
                check_in=reservation.check_in,
                check_out=reservation.check_out,
                duration_ms=_elapsed_ms(check_started),
                lock_wait_ms=total_lock_wait_ms,
            )
            raise

    @staticmethod
    async def _lock_table(db: AsyncSession, *, restaurant_id: int, table_id: int) -> int:
        started = time_module.perf_counter()
        table = await db.scalar(
            select(Table)
            .where(Table.id == table_id, Table.restaurant_id == restaurant_id)
            .with_for_update()
        )
        wait_ms = _elapsed_ms(started)
        if table is None:
            raise HTTPException(status_code=404, detail="Table not found")
        return wait_ms

    @classmethod
    async def _assign_available_table(
        cls,
        db: AsyncSession,
        *,
        restaurant: DomainReservation,
        restaurant_id: int,
        party_size: int,
        reservation_date: date,
        start_time: time,
        end_time: time,
        request_source: str,
        endpoint: str,
        start_dt: datetime,
        end_dt: datetime,
    ) -> tuple[int | None, int]:
        lock_started = time_module.perf_counter()
        candidate_result = await db.execute(
            select(Table)
            .where(
                Table.restaurant_id == restaurant_id,
                Table.capacity >= party_size,
                Table.is_active.is_(True),
                Table.status == "available",
            )
            .order_by(Table.capacity, Table.id)
            .with_for_update()
        )
        lock_wait_ms = _elapsed_ms(lock_started)
        candidate_tables = list(candidate_result.scalars().all())

        for table in candidate_tables:
            conflict_count, conflict_duration_ms = await cls._restaurant_table_conflict_count(
                db,
                restaurant_id=restaurant_id,
                table_id=table.id,
                reservation_date=reservation_date,
                start_time=start_time,
                end_time=end_time,
            )
            if conflict_count == 0:
                if lock_wait_ms:
                    await cls._log_lock(
                        reservation_type="restaurant",
                        request_source=request_source,
                        endpoint=endpoint,
                        entity_id=restaurant_id,
                        table_id=table.id,
                        room_id=None,
                        room_type_id=None,
                        start=start_dt,
                        end=end_dt,
                        check_in=None,
                        check_out=None,
                        wait_ms=lock_wait_ms,
                    )
                return table.id, lock_wait_ms
            await cls._record_conflict(
                reservation_type="restaurant",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                table_id=table.id,
                room_id=None,
                room_type_id=None,
                start=start_dt,
                end=end_dt,
                check_in=None,
                check_out=None,
                conflict_count=conflict_count,
                duration_ms=conflict_duration_ms,
                lock_wait_ms=lock_wait_ms,
                time_range=_restaurant_time_range(reservation_date, start_time, end_time),
            )
        if lock_wait_ms:
            await cls._log_lock(
                reservation_type="restaurant",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=restaurant_id,
                table_id=restaurant.table_id,
                room_id=None,
                room_type_id=None,
                start=start_dt,
                end=end_dt,
                check_in=None,
                check_out=None,
                wait_ms=lock_wait_ms,
            )
        return None, lock_wait_ms

    @staticmethod
    async def _restaurant_table_conflict_count(
        db: AsyncSession,
        *,
        restaurant_id: int,
        table_id: int,
        reservation_date: date,
        start_time: time,
        end_time: time,
    ) -> tuple[int, int]:
        started = time_module.perf_counter()
        existing_rows = (
            await db.execute(
                select(RestaurantReservationRecord).where(
                    RestaurantReservationRecord.restaurant_id == restaurant_id,
                    RestaurantReservationRecord.table_id == table_id,
                    RestaurantReservationRecord.reservation_date == reservation_date,
                    RestaurantReservationRecord.status.in_(ACTIVE_RESTAURANT_STATUSES),
                )
            )
        ).scalars().all()

        conflict_count = 0
        for existing in existing_rows:
            existing_end = _restaurant_end_time(
                existing.start_time,
                existing.duration_min,
                existing.end_time,
            )
            if restaurant_intervals_overlap(
                start_time,
                end_time,
                existing.start_time,
                existing_end,
            ):
                conflict_count += 1
        return conflict_count, _elapsed_ms(started)

    @classmethod
    async def _assign_available_room(
        cls,
        db: AsyncSession,
        *,
        property_id: int,
        room_type: RoomType,
        check_in: date,
        check_out: date,
        request_source: str,
        endpoint: str,
    ) -> tuple[str, int]:
        room_category = normalize_room_category(room_type.name)
        if room_category is None:
            raise HTTPException(status_code=400, detail="Room type not found")
        candidate_rooms, lock_wait_ms = await cls._locked_rooms_for_type(
            db,
            property_id=property_id,
            room_type_id=room_type.id,
            room_numbers=inventory_room_numbers(room_category),
        )
        if not candidate_rooms:
            raise HTTPException(
                status_code=409,
                detail="No rooms available for the requested room type",
            )

        if lock_wait_ms:
            await cls._log_lock(
                reservation_type="hotel",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=property_id,
                table_id=None,
                room_id=None,
                room_type_id=room_type.id,
                start=None,
                end=None,
                check_in=check_in,
                check_out=check_out,
                wait_ms=lock_wait_ms,
            )

        overlapping, conflict_duration_ms = await cls._overlapping_hotel_reservations(
            db,
            property_id=property_id,
            check_in=check_in,
            check_out=check_out,
            room_type_id=room_type.id,
        )
        if len(overlapping) >= len(candidate_rooms):
            await cls._record_conflict(
                reservation_type="hotel",
                request_source=request_source,
                endpoint=endpoint,
                entity_id=property_id,
                table_id=None,
                room_id=None,
                room_type_id=room_type.id,
                start=None,
                end=None,
                check_in=check_in,
                check_out=check_out,
                conflict_count=len(overlapping),
                duration_ms=conflict_duration_ms,
                lock_wait_ms=lock_wait_ms,
                time_range=_hotel_time_range(check_in, check_out),
            )
            raise HTTPException(
                status_code=409,
                detail="No rooms available for the requested dates",
            )

        occupied_rooms = {existing.room for existing in overlapping if existing.room}
        for room in candidate_rooms:
            if room.room_number not in occupied_rooms:
                return room.room_number, lock_wait_ms

        raise HTTPException(
            status_code=409,
            detail="No rooms available for the requested dates",
        )

    @staticmethod
    async def _hotel_room_conflict_count(
        db: AsyncSession,
        *,
        property_id: int,
        room_number: str,
        check_in: date,
        check_out: date,
    ) -> tuple[int, int]:
        started = time_module.perf_counter()
        existing_rows = (
            await db.execute(
                select(HotelReservationRecord).where(
                    HotelReservationRecord.property_id == property_id,
                    HotelReservationRecord.room == room_number,
                    HotelReservationRecord.status.notin_(INACTIVE_HOTEL_STATUSES),
                )
            )
        ).scalars().all()

        conflict_count = 0
        for existing in existing_rows:
            if hotel_date_ranges_overlap(
                check_in,
                check_out,
                existing.check_in,
                existing.check_out,
            ):
                conflict_count += 1
        return conflict_count, _elapsed_ms(started)

    @staticmethod
    async def _lock_room_by_number(
        db: AsyncSession,
        *,
        property_id: int,
        room_number: str,
    ) -> tuple[Room | None, int]:
        started = time_module.perf_counter()
        room = await db.scalar(
            select(Room)
            .where(
                Room.property_id == property_id,
                Room.room_number == normalize_room_number(room_number),
            )
            .with_for_update()
        )
        return room, _elapsed_ms(started)

    @staticmethod
    async def _locked_rooms_for_type(
        db: AsyncSession,
        *,
        property_id: int,
        room_type_id: int,
        room_numbers: list[str] | None = None,
    ) -> tuple[list[Room], int]:
        started = time_module.perf_counter()
        stmt = (
            select(Room)
            .where(
                Room.property_id == property_id,
                Room.room_type_id == room_type_id,
            )
            .with_for_update()
        )
        if room_numbers is not None:
            normalized_numbers = [normalize_room_number(room_number) for room_number in room_numbers]
            stmt = stmt.where(Room.room_number.in_(normalized_numbers))
        result = await db.execute(stmt)
        rows = list(result.scalars().all())
        if room_numbers is None:
            rows.sort(key=lambda room: (room.room_number, room.id))
        else:
            order = {normalize_room_number(room_number): index for index, room_number in enumerate(room_numbers)}
            rows.sort(key=lambda room: (order.get(normalize_room_number(room.room_number), len(order)), room.id))
        return rows, _elapsed_ms(started)

    @staticmethod
    async def _overlapping_hotel_reservations(
        db: AsyncSession,
        *,
        property_id: int,
        check_in: date,
        check_out: date,
        room_type_id: int,
    ) -> tuple[list[HotelReservationRecord], int]:
        started = time_module.perf_counter()
        rows = (
            await db.execute(
                select(HotelReservationRecord).where(
                    HotelReservationRecord.property_id == property_id,
                    HotelReservationRecord.room_type_id == room_type_id,
                    HotelReservationRecord.status.notin_(INACTIVE_HOTEL_STATUSES),
                )
            )
        ).scalars().all()
        overlapping = [
            row
            for row in rows
            if hotel_date_ranges_overlap(
                check_in,
                check_out,
                row.check_in,
                row.check_out,
            )
        ]
        return overlapping, _elapsed_ms(started)
