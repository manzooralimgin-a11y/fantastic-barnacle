from __future__ import annotations

import logging
import secrets
import string
import time as time_module
from dataclasses import dataclass
from typing import Any

import stripe
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.hms.models import HotelProperty, HotelReservation as HotelReservationRecord, RoomType
from app.hms.room_inventory import (
    normalize_room_category,
    room_category_config,
    room_category_display_label,
    room_category_for_room,
)
from app.middleware.request_id import get_request_path
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.availability import ReservationAvailabilityService
from app.reservations.cache import (
    schedule_hotel_availability_invalidation,
    schedule_restaurant_availability_invalidation,
)
from app.reservations.consistency import schedule_consistency_verification
from app.reservations.domain import Reservation as DomainReservation
from app.reservations.models import Reservation as RestaurantReservationRecord
from app.reservations.schemas import ReservationCreate, ReservationRead, UnifiedReservationCreate
from app.shared.audit import log_human_action
from app.websockets.connection_manager import manager

logger = logging.getLogger("app.reservations.unified")
_AVAILABILITY_GUARD_KEY = "reservation_availability_checked"

if settings.stripe_api_key:
    stripe.api_key = settings.stripe_api_key

@dataclass(slots=True)
class ReservationCreateResult:
    reservation: DomainReservation
    total_amount: float | None = None
    client_secret: str | None = None


    @property
    def reservation_kind(self) -> str:
        return self.reservation.type

    @property
    def record(self) -> DomainReservation:
        return self.reservation


def serialize_created_reservation(result: ReservationCreateResult) -> dict[str, Any]:
    if result.reservation_kind == "restaurant":
        return ReservationRead.model_validate(
            result.reservation.to_restaurant_response()
        ).model_dump(mode="json")

    return hotel_reservation_to_dict(
        result.reservation,
        client_secret=result.client_secret,
    )


def hotel_reservation_to_dict(
    reservation: HotelReservationRecord | DomainReservation,
    *,
    client_secret: str | None = None,
) -> dict[str, Any]:
    canonical = (
        reservation
        if isinstance(reservation, DomainReservation)
        else DomainReservation.from_hotel_record(reservation)
    )
    return canonical.to_hotel_response(client_secret=client_secret)


class ReservationService:
    @classmethod
    async def create_reservation(
        cls,
        db: AsyncSession,
        payload: UnifiedReservationCreate | dict[str, Any],
        *,
        actor_user: Any | None = None,
        broadcast: bool = True,
        broadcast_event_type: str | None = None,
    ) -> ReservationCreateResult:
        normalized: UnifiedReservationCreate | None = None
        reservation: DomainReservation | None = None
        started = time_module.perf_counter()

        await cls._increment_counter("reservation.create.total")

        try:
            validation_started = time_module.perf_counter()
            normalized = cls._validate_payload(payload)
            reservation = DomainReservation.from_create_payload(normalized)
            metric_source = reservation.source or "service"
            request_path = get_request_path()
            if request_path == "/api/reservations":
                metric_source = "canonical"
            elif request_path.startswith("/mcp/") or reservation.source == "mcp":
                metric_source = "mcp"
            await cls._increment_counter(
                f"reservation.create.source.{metric_source}"
            )
            await api_metrics.record_business_timing(
                "reservation.create.validation_ms",
                max(int((time_module.perf_counter() - validation_started) * 1000), 0),
            )
        except HTTPException as exc:
            await cls._increment_counter("reservation.create.failure")
            cls._log_failure(
                payload=reservation or payload,
                normalized=reservation,
                actor_user=actor_user,
                error=exc.detail,
                status_code=exc.status_code,
                validation_failure=exc.status_code in {400, 422},
            )
            raise

        try:
            if normalized.kind == "hotel":
                result = await cls._create_hotel_reservation(
                    db,
                    reservation,
                    broadcast=broadcast,
                    broadcast_event_type=broadcast_event_type,
                )
            else:
                result = await cls._create_restaurant_reservation(
                    db,
                    reservation,
                    actor_user=actor_user,
                    broadcast=broadcast,
                    broadcast_event_type=broadcast_event_type,
                )
        except HTTPException as exc:
            await cls._increment_counter("reservation.create.failure")
            cls._log_failure(
                payload=reservation or payload,
                normalized=reservation,
                actor_user=actor_user,
                error=exc.detail,
                status_code=exc.status_code,
                validation_failure=exc.status_code in {400, 422},
            )
            raise
        except Exception as exc:
            await cls._increment_counter("reservation.create.failure")
            cls._log_failure(
                payload=reservation or payload,
                normalized=reservation,
                actor_user=actor_user,
                error=str(exc),
                status_code=500,
                validation_failure=False,
            )
            raise

        await cls._increment_counter("reservation.create.success")
        await cls._increment_counter(f"reservation.create.entity.{result.reservation_kind}")
        await api_metrics.record_business_timing(
            "reservation.create.total_ms",
            max(int((time_module.perf_counter() - started) * 1000), 0),
        )
        cls._log_success(
            result=result,
            normalized=reservation,
        )
        return result

    @staticmethod
    def _validate_payload(
        payload: UnifiedReservationCreate | dict[str, Any],
    ) -> UnifiedReservationCreate:
        if isinstance(payload, UnifiedReservationCreate):
            return payload
        try:
            return UnifiedReservationCreate.model_validate(payload)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc

    @staticmethod
    def _entity_type(
        payload: DomainReservation | UnifiedReservationCreate | dict[str, Any],
        normalized: DomainReservation | None,
    ) -> str | None:
        if normalized is not None:
            return normalized.type
        if isinstance(payload, DomainReservation):
            return payload.type
        if isinstance(payload, UnifiedReservationCreate):
            return payload.kind
        if isinstance(payload, dict):
            reservation_type = payload.get("type") or payload.get("kind")
            return reservation_type if isinstance(reservation_type, str) else None
        return None

    @staticmethod
    def _context_fields(
        *,
        payload: DomainReservation | UnifiedReservationCreate | dict[str, Any],
        normalized: DomainReservation | None,
        actor_user: Any | None = None,
        record: DomainReservation | None = None,
    ) -> dict[str, Any]:
        restaurant_id = None
        property_id = None
        if record is not None:
            restaurant_id = record.restaurant_id
            property_id = record.property_id
        elif normalized is not None:
            restaurant_id = normalized.restaurant_id or getattr(actor_user, "restaurant_id", None)
            property_id = normalized.property_id
        elif isinstance(payload, DomainReservation):
            restaurant_id = payload.restaurant_id or getattr(actor_user, "restaurant_id", None)
            property_id = payload.property_id
        elif isinstance(payload, UnifiedReservationCreate):
            restaurant_id = payload.restaurant_id or getattr(actor_user, "restaurant_id", None)
            property_id = payload.property_id
        elif isinstance(payload, dict):
            restaurant_id = payload.get("restaurant_id") or getattr(actor_user, "restaurant_id", None)
            property_id = payload.get("property_id")

        return {
            "restaurant_id": restaurant_id,
            "hotel_id": property_id,
            "property_id": property_id,
        }

    @classmethod
    def _log_success(
        cls,
        *,
        result: ReservationCreateResult,
        normalized: DomainReservation,
    ) -> None:
        context = cls._context_fields(
            payload=normalized,
            normalized=normalized,
            record=result.reservation,
        )
        log_event(
            logger,
            logging.INFO,
            "reservation_created",
            entity_type=result.reservation_kind,
            success=True,
            source=result.reservation.source,
            reservation_id=result.reservation.id,
            **context,
        )

    @classmethod
    def _log_failure(
        cls,
        *,
        payload: DomainReservation | UnifiedReservationCreate | dict[str, Any],
        normalized: DomainReservation | None,
        actor_user: Any | None,
        error: Any,
        status_code: int,
        validation_failure: bool,
    ) -> None:
        context = cls._context_fields(
            payload=payload,
            normalized=normalized,
            actor_user=actor_user,
        )
        entity_type = cls._entity_type(payload, normalized)
        fields = {
            "source": normalized.source if normalized is not None else "canonical",
            "entity_type": entity_type,
            "success": False,
            "status_code": status_code,
            "error": error,
            **context,
        }
        if validation_failure:
            log_event(logger, logging.WARNING, "reservation_validation_failed", **fields)
        log_event(logger, logging.ERROR, "reservation_create_failed", **fields)

    @staticmethod
    async def _increment_counter(metric_name: str) -> None:
        try:
            await api_metrics.record_business_event(metric_name)
        except Exception:
            logger.debug("Failed to record reservation metric %s", metric_name, exc_info=True)

    @classmethod
    async def _create_restaurant_reservation(
        cls,
        db: AsyncSession,
        reservation: DomainReservation,
        *,
        actor_user: Any | None,
        broadcast: bool,
        broadcast_event_type: str | None,
    ) -> ReservationCreateResult:
        restaurant_id = await cls._resolve_restaurant_id(
            db,
            reservation,
            actor_user=actor_user,
        )
        availability_started = time_module.perf_counter()
        reservation = await ReservationAvailabilityService.prepare_restaurant_reservation(
            db,
            reservation,
            restaurant_id=restaurant_id,
        )
        await api_metrics.record_business_timing(
            "reservation.create.availability_ms",
            max(int((time_module.perf_counter() - availability_started) * 1000), 0),
        )

        reservation_payload = ReservationCreate(
            guest_id=reservation.guest_id,
            guest_name=reservation.guest_name,
            guest_phone=reservation.guest_phone,
            guest_email=str(reservation.guest_email) if reservation.guest_email else None,
            table_id=reservation.table_id,
            party_size=reservation.party_size or 1,
            reservation_date=reservation.reservation_date,
            start_time=reservation.start_time,
            end_time=reservation.end_time,
            duration_min=reservation.duration_min,
            status=reservation.status or "confirmed",
            special_requests=reservation.special_requests,
            notes=reservation.notes,
            source=reservation.source,
        )
        cls._require_availability_guard(db, "restaurant")
        persistence_started = time_module.perf_counter()
        persisted_record = await cls._insert_restaurant_reservation(
            db,
            restaurant_id=restaurant_id,
            payload=reservation_payload,
        )
        await api_metrics.record_business_timing(
            "reservation.create.persistence_ms",
            max(int((time_module.perf_counter() - persistence_started) * 1000), 0),
        )
        persisted = DomainReservation.from_restaurant_record(persisted_record)
        schedule_restaurant_availability_invalidation(
            db,
            restaurant_id=restaurant_id,
            reservation_date=persisted.reservation_date,
            reason="reservation_created",
            request_source=persisted.source,
        )
        schedule_consistency_verification(
            db,
            reservation_type="restaurant",
            restaurant_id=restaurant_id,
            reservation_date=persisted.reservation_date,
            request_source=persisted.source,
        )

        if broadcast:
            event_type = broadcast_event_type or "NEW_RESERVATION"
            broadcast_started = time_module.perf_counter()
            await manager.broadcast(
                {
                    "type": event_type,
                    "reservation_id": persisted.id,
                    "guest_name": persisted.guest_name,
                    "party_size": persisted.party_size,
                    "reservation_date": str(persisted.reservation_date),
                    "start_time": str(persisted.start_time),
                },
                restaurant_id=restaurant_id,
            )
            await api_metrics.record_business_timing(
                "reservation.create.broadcast_ms",
                max(int((time_module.perf_counter() - broadcast_started) * 1000), 0),
            )

        return ReservationCreateResult(reservation=persisted)

    @staticmethod
    async def _insert_restaurant_reservation(
        db: AsyncSession,
        *,
        restaurant_id: int,
        payload: ReservationCreate,
    ) -> RestaurantReservationRecord:
        reservation_data = payload.model_dump()
        reservation = RestaurantReservationRecord(**reservation_data, restaurant_id=restaurant_id)
        db.add(reservation)
        await db.flush()
        await log_human_action(
            db,
            action="reservation_created",
            detail=f"Created reservation for {reservation.guest_name}",
            entity_type="reservations",
            entity_id=reservation.id,
            source_module="reservations",
            restaurant_id=restaurant_id,
        )
        await db.refresh(reservation)
        return reservation

    @classmethod
    async def _create_hotel_reservation(
        cls,
        db: AsyncSession,
        reservation: DomainReservation,
        *,
        broadcast: bool,
        broadcast_event_type: str | None,
    ) -> ReservationCreateResult:
        property_id = await cls._resolve_property_id(
            db,
            reservation,
        )

        room_type, room_type_label, total_amount = await cls._resolve_hotel_room_type(
            db,
            property_id=property_id,
            reservation=reservation,
        )
        availability_started = time_module.perf_counter()
        reservation = await ReservationAvailabilityService.prepare_hotel_reservation(
            db,
            reservation,
            property_id=property_id,
            room_type=room_type,
            room_type_label=room_type_label,
        )
        await api_metrics.record_business_timing(
            "reservation.create.availability_ms",
            max(int((time_module.perf_counter() - availability_started) * 1000), 0),
        )

        booking_id = cls._generate_booking_id(reservation.booking_id_prefix)
        room_number = reservation.room
        if not room_number:
            raise RuntimeError("Hotel reservation room must be assigned before insert")
        canonical_phone = reservation.guest_phone

        persisted_record = HotelReservationRecord(
            property_id=property_id,
            guest_name=reservation.guest_name,
            guest_email=str(reservation.guest_email) if reservation.guest_email else None,
            guest_phone=canonical_phone,
            phone=canonical_phone,
            check_in=reservation.check_in,
            check_out=reservation.check_out,
            status=(reservation.status or "confirmed").replace("-", "_"),
            total_amount=total_amount,
            notes=reservation.notes,
            room_type_id=room_type.id if room_type is not None else None,
            payment_status=cls._hotel_payment_status(reservation),
            booking_id=booking_id,
            anrede=reservation.anrede,
            room=room_number,
            room_type_label=room_type_label,
            adults=reservation.adults,
            children=reservation.children,
            zahlungs_methode=reservation.zahlungs_methode,
            zahlungs_status=reservation.zahlungs_status or "offen",
            special_requests=reservation.special_requests,
        )
        cls._require_availability_guard(db, "hotel")
        persistence_started = time_module.perf_counter()
        db.add(persisted_record)
        await db.flush()

        client_secret = None
        if reservation.create_payment_intent and settings.stripe_api_key:
            try:
                intent = stripe.PaymentIntent.create(
                    amount=int(total_amount * 100),
                    currency="eur",
                    metadata={
                        "booking_id": persisted_record.booking_id,
                        "reservation_id": persisted_record.id,
                        "type": "hotel_booking",
                    },
                )
                persisted_record.stripe_payment_intent_id = intent.id
                client_secret = intent.client_secret
            except Exception as exc:
                logger.warning("Stripe payment intent creation failed: %s", exc)

        await db.flush()
        await db.refresh(persisted_record)
        await api_metrics.record_business_timing(
            "reservation.create.persistence_ms",
            max(int((time_module.perf_counter() - persistence_started) * 1000), 0),
        )
        persisted = DomainReservation.from_hotel_record(
            persisted_record,
            source=reservation.source,
        )
        schedule_hotel_availability_invalidation(
            db,
            property_id=property_id,
            check_in=persisted.check_in,
            check_out=persisted.check_out,
            reason="reservation_created",
            request_source=persisted.source,
        )
        schedule_consistency_verification(
            db,
            reservation_type="hotel",
            property_id=property_id,
            check_in=persisted.check_in,
            check_out=persisted.check_out,
            request_source=persisted.source,
        )

        if broadcast:
            event_type = broadcast_event_type or "NEW_HOTEL_BOOKING"
            broadcast_started = time_module.perf_counter()
            await manager.broadcast(
                {
                    "type": event_type,
                    "booking": {
                        "id": persisted.id,
                        "booking_id": persisted.booking_id,
                        "guest_name": persisted.guest_name,
                        "room_type_id": persisted.room_type_id,
                        "check_in": str(persisted.check_in),
                        "check_out": str(persisted.check_out),
                        "total_amount": float(persisted.total_amount or 0.0),
                    },
                },
                restaurant_id=property_id,
            )
            await api_metrics.record_business_timing(
                "reservation.create.broadcast_ms",
                max(int((time_module.perf_counter() - broadcast_started) * 1000), 0),
            )

        return ReservationCreateResult(
            reservation=persisted,
            total_amount=total_amount,
            client_secret=client_secret,
        )

    @classmethod
    async def _resolve_restaurant_id(
        cls,
        db: AsyncSession,
        reservation: DomainReservation,
        *,
        actor_user: Any | None,
    ) -> int:
        actor_restaurant_id = getattr(actor_user, "restaurant_id", None)
        if reservation.restaurant_id is not None:
            if (
                actor_restaurant_id not in (None, 0)
                and reservation.restaurant_id != actor_restaurant_id
            ):
                raise HTTPException(status_code=403, detail="Restaurant scope mismatch")
            return reservation.restaurant_id

        if actor_restaurant_id not in (None, 0):
            return int(actor_restaurant_id)

        raise HTTPException(status_code=400, detail="restaurant_id is required")

    @classmethod
    async def _resolve_property_id(
        cls,
        db: AsyncSession,
        reservation: DomainReservation,
    ) -> int:
        property_id = reservation.property_id
        if property_id is None:
            raise HTTPException(status_code=400, detail="property_id is required")

        prop = (
            await db.execute(select(HotelProperty).where(HotelProperty.id == property_id))
        ).scalar_one_or_none()
        if not prop:
            raise HTTPException(status_code=404, detail="Hotel property not found")
        return property_id

    @classmethod
    async def _resolve_hotel_room_type(
        cls,
        db: AsyncSession,
        *,
        property_id: int,
        reservation: DomainReservation,
    ) -> tuple[RoomType | None, str, float]:
        nights = (reservation.check_out - reservation.check_in).days
        if nights <= 0:
            raise HTTPException(status_code=400, detail="Check-out must be after check-in")

        room_type: RoomType | None = None
        resolved_category: str | None = None
        if reservation.room is not None:
            resolved_category = room_category_for_room(reservation.room)
            if resolved_category is None:
                raise HTTPException(status_code=404, detail="Room not found")

        if reservation.room_type_id is not None:
            room_type = (
                await db.execute(select(RoomType).where(RoomType.id == reservation.room_type_id))
            ).scalar_one_or_none()
            if not room_type:
                raise HTTPException(status_code=404, detail="Room type not found")
            if room_type.property_id != property_id:
                raise HTTPException(
                    status_code=400,
                    detail="Room type does not belong to the selected property",
                )
            room_type_category = normalize_room_category(room_type.name)
            if room_type_category is None:
                raise HTTPException(status_code=400, detail="Room type not found")
            if reservation.room_type_label:
                requested_category = normalize_room_category(reservation.room_type_label)
                if requested_category is None:
                    raise HTTPException(status_code=400, detail="Room type not found")
                if requested_category != room_type_category:
                    raise HTTPException(
                        status_code=400,
                        detail="room_type_label does not match room_type_id",
                    )
            if resolved_category is not None and resolved_category != room_type_category:
                raise HTTPException(
                    status_code=400,
                    detail="Room does not belong to the selected room type",
                )
            resolved_category = room_type_category
        elif reservation.room_type_label:
            requested_category = normalize_room_category(reservation.room_type_label)
            if requested_category is None:
                raise HTTPException(status_code=400, detail="Room type not found")
            if resolved_category is not None and resolved_category != requested_category:
                raise HTTPException(
                    status_code=400,
                    detail="Room does not belong to the selected room type",
                )
            resolved_category = requested_category

        if resolved_category is None:
            raise HTTPException(
                status_code=400,
                detail="room_type_id or room_type_label is required",
            )

        if room_type is None:
            room_type = await cls._match_room_type_for_category(
                db,
                property_id=property_id,
                category_key=resolved_category,
            )
            if room_type is None:
                raise HTTPException(status_code=404, detail="Room type not found")

        category_config = room_category_config(resolved_category)
        base_rate = float(room_type.base_price or category_config.base_price)
        resolved_label = room_category_display_label(resolved_category)

        total_amount = float(base_rate) * nights
        return room_type, resolved_label, total_amount

    @staticmethod
    async def _match_room_type_for_category(
        db: AsyncSession,
        *,
        property_id: int,
        category_key: str,
    ) -> RoomType | None:
        room_types = (
            await db.execute(select(RoomType).where(RoomType.property_id == property_id))
        ).scalars().all()
        for room_type in room_types:
            if normalize_room_category(room_type.name) == category_key:
                return room_type
        return None

    @staticmethod
    def _generate_booking_id(prefix: str) -> str:
        chars = string.ascii_uppercase + string.digits
        return prefix.upper() + "-" + "".join(secrets.choice(chars) for _ in range(8))

    @staticmethod
    def _hotel_payment_status(reservation: DomainReservation) -> str:
        if reservation.zahlungs_status and reservation.zahlungs_status.lower() == "bezahlt":
            return "paid"
        return "pending"

    @staticmethod
    def _require_availability_guard(db: AsyncSession, reservation_type: str) -> None:
        guard = db.info.pop(_AVAILABILITY_GUARD_KEY, None)
        if guard != reservation_type:
            raise RuntimeError(
                f"Availability check must run before inserting {reservation_type} reservations"
            )
