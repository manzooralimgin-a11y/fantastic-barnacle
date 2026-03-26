import asyncio
import logging
import json
import time as time_module
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from starlette.applications import Starlette
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import Response

import mcp.types as types
from mcp.server import Server
from mcp.server.sse import SseServerTransport

from app.config import settings
from app.database import async_session
from app.email_inbox.service import (
    generate_reply_for_thread,
    list_filtered_email_threads,
    send_reply_for_thread,
    serialize_email_thread,
)
from app.integrations.schemas import (
    FilteredEmailsInput,
    GastronomyReservationInput,
    GenerateEmailReplyInput,
    HotelAvailabilityInput,
    HotelReservationInput,
    RestaurantAvailabilityInput,
    SendEmailReplyInput,
)
from app.middleware.request_id import reset_idempotency_key, set_idempotency_key
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.cache import (
    discard_pending_availability_invalidations,
    flush_pending_availability_invalidations,
    schedule_restaurant_availability_invalidation,
)
from app.reservations.consistency import (
    discard_pending_consistency_checks,
    flush_pending_consistency_checks,
)
from app.reservations.idempotency import (
    IdempotencyClaim,
    IdempotencyReplay,
    ReservationIdempotencyService,
)
from app.reservations.read_availability import AvailabilityReadService
from app.reservations.schemas import UnifiedReservationCreate
from app.reservations.unified_service import ReservationService, serialize_created_reservation
from app.security.rate_limit import enforce_named_rate_limit
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from app.reservations.models import Reservation, Table

logger = logging.getLogger(__name__)
_mcp_client_id: ContextVar[str] = ContextVar("mcp_client_id", default="local")
_mcp_active_calls = 0
_mcp_overload_lock = asyncio.Lock()


@dataclass(slots=True)
class _McpOverloadState:
    consecutive_trips: int = 0
    open_until: float = 0.0


_mcp_overload_state = _McpOverloadState()

# Initialize the MCP Server Instance
mcp_server = Server("gestronomy-voicebooker-mcp")

# SseServerTransport takes the *relative* URL path that handles POST messages.
# The Starlette sub-app is mounted at /mcp/voicebooker in main.py,
# so the POST endpoint is advertised as /mcp/voicebooker/messages by the transport.
sse = SseServerTransport("/messages")


# --- AI Tool Implementations ---

async def check_table_availability(date: str, time: str, party_size: int) -> str:
    """Checks if the restaurant has an available table for a specific date, time, and party size."""
    async with async_session() as session:
        try:
            req_datetime = datetime.strptime(f"{date} {time}", "%Y-%m-%d %H:%M")
        except ValueError:
            return "Error: Invalid date/time format. Use YYYY-MM-DD for date and HH:MM for time."

        tables_res = await session.execute(
            select(Table).where(Table.capacity >= party_size, Table.is_active.is_(True))
        )
        available_tables = tables_res.scalars().all()

        if not available_tables:
            return f"Unfortunately, we do not have tables that can accommodate a party of {party_size}."

        conflicts_res = await session.execute(
            select(Reservation).where(
                Reservation.reservation_date == req_datetime.date(),
                Reservation.status.in_(["confirmed", "seated", "arrived"]),
            )
        )
        existing_res = conflicts_res.scalars().all()

        if len(existing_res) >= len(available_tables):
            return f"I'm sorry, we are fully booked on {date} around {time}. No tables available."

        return f"Yes! We currently have availability on {date} at {time} for {party_size} guests."


async def cancel_reservation(reservation_id: int) -> str:
    """Cancels an existing reservation by its ID."""
    async with async_session() as session:
        result = await session.execute(
            select(Reservation).where(Reservation.id == reservation_id)
        )
        res = result.scalar_one_or_none()

        if not res:
            return f"Error: Reservation with ID {reservation_id} not found."

        res.status = "cancelled"
        schedule_restaurant_availability_invalidation(
            session,
            restaurant_id=res.restaurant_id,
            reservation_date=res.reservation_date,
            reason="reservation_cancelled",
            request_source="mcp",
        )
        await session.commit()
        await flush_pending_availability_invalidations(session)

        return f"Reservation {reservation_id} for {res.guest_name} has been successfully cancelled."


def _json_text(payload: dict[str, Any]) -> list[types.TextContent]:
    return [types.TextContent(type="text", text=json.dumps(payload, default=str))]


def _error_code_for_exception(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return {
            400: "invalid_request",
            404: "not_found",
            409: "conflict",
            422: "validation_error",
            429: "rate_limited",
            503: "service_unavailable",
        }.get(exc.status_code, "tool_error")
    if isinstance(exc, ValidationError):
        return "validation_error"
    return "internal_error"


def _tool_error_payload(
    name: str,
    exc: Exception,
    *,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    if isinstance(exc, HTTPException):
        return {
            "ok": False,
            "tool": name,
            "error": exc.detail,
            "status_code": exc.status_code,
            "error_code": _error_code_for_exception(exc),
            "retryable": exc.status_code in {409, 429, 503},
            "request_source": "mcp",
            "idempotency_key": idempotency_key,
        }
    if isinstance(exc, ValidationError):
        return {
            "ok": False,
            "tool": name,
            "error": exc.errors(),
            "status_code": 422,
            "error_code": "validation_error",
            "retryable": False,
            "request_source": "mcp",
            "idempotency_key": idempotency_key,
        }
    return {
        "ok": False,
        "tool": name,
        "error": str(exc),
        "status_code": 500,
        "error_code": "internal_error",
        "retryable": False,
        "request_source": "mcp",
        "idempotency_key": idempotency_key,
    }


def _get_mcp_client_identifier(request: Request | None = None) -> str:
    if request is not None:
        forwarded_for = request.headers.get("x-forwarded-for", "").strip()
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        if request.client and request.client.host:
            return request.client.host
    return _mcp_client_id.get()


def _mcp_bucket_limit(tool_name: str) -> tuple[str, int]:
    if tool_name in {
        "get_restaurant_availability",
        "get_hotel_availability",
        "check_table_availability",
    }:
        return "mcp_availability", settings.mcp_availability_rate_limit_per_minute
    if tool_name in {
        "create_gastronomy_reservation",
        "book_room",
        "cancel_reservation",
    }:
        return "mcp_booking", settings.mcp_booking_rate_limit_per_minute
    return "mcp", settings.mcp_rate_limit_per_minute


async def _maybe_close_mcp_overload_circuit() -> None:
    global _mcp_overload_state
    now = time_module.monotonic()
    if _mcp_overload_state.open_until <= 0 or now < _mcp_overload_state.open_until:
        return
    previous_trips = _mcp_overload_state.consecutive_trips
    _mcp_overload_state = _McpOverloadState()
    await api_metrics.record_business_event("integration.mcp.circuit_closed")
    log_event(
        logger,
        logging.INFO,
        "circuit_closed",
        component="mcp_tool_overload",
        previous_trips=previous_trips,
    )


async def _trip_mcp_overload_circuit(*, tool_name: str, reason: str) -> None:
    global _mcp_overload_state
    _mcp_overload_state.consecutive_trips += 1
    if _mcp_overload_state.consecutive_trips < settings.mcp_overload_trip_threshold:
        return
    _mcp_overload_state.open_until = (
        time_module.monotonic() + settings.mcp_overload_circuit_cooldown_seconds
    )
    await api_metrics.record_business_event("integration.mcp.circuit_open")
    log_event(
        logger,
        logging.ERROR,
        "circuit_opened",
        component="mcp_tool_overload",
        tool=tool_name,
        reason=reason,
        cooldown_seconds=settings.mcp_overload_circuit_cooldown_seconds,
    )


@asynccontextmanager
async def _mcp_execution_slot(tool_name: str):
    global _mcp_active_calls
    await _maybe_close_mcp_overload_circuit()
    if time_module.monotonic() < _mcp_overload_state.open_until:
        raise HTTPException(status_code=503, detail="MCP tool service temporarily overloaded")

    async with _mcp_overload_lock:
        if _mcp_active_calls >= settings.mcp_overload_active_call_threshold:
            await api_metrics.record_business_event("integration.mcp.overload")
            await _trip_mcp_overload_circuit(tool_name=tool_name, reason="active_call_threshold")
            raise HTTPException(status_code=503, detail="MCP tool service temporarily overloaded")
        _mcp_active_calls += 1

    try:
        yield
    finally:
        async with _mcp_overload_lock:
            _mcp_active_calls = max(_mcp_active_calls - 1, 0)


async def _enforce_mcp_rate_limit(tool_name: str) -> None:
    client_id = _get_mcp_client_identifier()
    bucket_name, limit = _mcp_bucket_limit(tool_name)
    burst_limit = settings.mcp_rate_limit_burst_per_10_seconds
    if bucket_name == "mcp_booking":
        burst_limit = settings.mcp_booking_rate_limit_burst_per_10_seconds
    elif bucket_name == "mcp_availability":
        burst_limit = settings.mcp_availability_rate_limit_burst_per_10_seconds
    allowed, retry_after = await enforce_named_rate_limit(
        bucket_name=bucket_name,
        identifier=client_id,
        limit=limit,
        burst_limit=burst_limit,
        sustained_limit=limit,
        request_source=f"mcp:{tool_name}",
    )
    if allowed:
        return
    await api_metrics.record_business_event("integration.mcp.rate_limited")
    await api_metrics.record_business_event(f"integration.mcp.rate_limited.tool.{tool_name}")
    log_event(
        logger,
        logging.WARNING,
        "voicebooker_mcp_rate_limited",
        tool=tool_name,
        client_id=client_id,
        bucket=bucket_name,
        retry_after=retry_after,
    )
    log_event(
        logger,
        logging.WARNING,
        "rate_limit_triggered",
        rate_limit_source=f"mcp:{tool_name}",
        tool=tool_name,
        client_id=client_id,
        retry_after=retry_after,
    )
    await _trip_mcp_overload_circuit(tool_name=tool_name, reason="rate_limit")
    raise HTTPException(status_code=429, detail="Too many MCP tool calls")


async def _create_reservation_via_service(
    tool_name: str,
    payload: UnifiedReservationCreate,
    *,
    idempotency_key: str | None = None,
    confidence: float | None = None,
    intent_source: str | None = None,
) -> dict[str, Any]:
    idempotency_token = set_idempotency_key(idempotency_key)
    claim: IdempotencyClaim | None = None
    try:
        log_event(
            logger,
            logging.INFO,
            "voicebooker_mcp_reservation_requested",
            tool=tool_name,
            request_source="mcp",
            idempotency_key=idempotency_key,
            confidence=confidence,
            intent_source=intent_source,
        )
        try:
            claim_or_replay = await ReservationIdempotencyService.claim_or_replay(
                scope=f"mcp:{tool_name}",
                key=idempotency_key,
                request_payload=payload.model_dump(mode="json", exclude_none=True),
                request_source="mcp",
                endpoint=f"mcp:{tool_name}",
            )
        except HTTPException as exc:
            if exc.status_code == 409 and "Idempotency-Key" in str(exc.detail):
                log_event(
                    logger,
                    logging.WARNING,
                    "mcp_idempotency_conflict",
                    tool=tool_name,
                    request_source="mcp",
                    idempotency_key=idempotency_key,
                    intent_source=intent_source,
                    error=str(exc.detail),
                )
            raise
        if isinstance(claim_or_replay, IdempotencyReplay):
            log_event(
                logger,
                logging.INFO,
                "mcp_idempotency_hit",
                tool=tool_name,
                request_source="mcp",
                idempotency_key=idempotency_key,
                intent_source=intent_source,
                status_code=claim_or_replay.status_code,
            )
            return claim_or_replay.response
        if isinstance(claim_or_replay, IdempotencyClaim):
            claim = claim_or_replay

        async with async_session() as session:
            try:
                result = await ReservationService.create_reservation(
                    session,
                    payload,
                )
                await session.commit()
                await flush_pending_availability_invalidations(session)
                await flush_pending_consistency_checks(session)
            except Exception:
                await session.rollback()
                discard_pending_availability_invalidations(session)
                discard_pending_consistency_checks(session)
                await ReservationIdempotencyService.release(
                    claim=claim,
                    request_source="mcp",
                    endpoint=f"mcp:{tool_name}",
                    error="reservation_create_failed",
                )
                raise

        response_payload = {
            "ok": True,
            "tool": tool_name,
            "reservation_kind": result.reservation_kind,
            "reservation": serialize_created_reservation(result),
        }
        await ReservationIdempotencyService.complete_or_log(
            claim=claim,
            response=response_payload,
            status_code=200,
            reservation_kind=result.reservation_kind,
            request_source="mcp",
            endpoint=f"mcp:{tool_name}",
        )
        return response_payload
    finally:
        reset_idempotency_key(idempotency_token)


async def _get_availability_via_service(
    tool_name: str,
    *,
    service_call,
) -> dict[str, Any]:
    async with async_session() as session:
        availability = await service_call(session)

    return {
        "ok": True,
        "tool": tool_name,
        "availability": availability,
    }


async def create_gastronomy_reservation(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = GastronomyReservationInput.model_validate(arguments)
    payload = UnifiedReservationCreate.model_validate(validated.to_unified_payload())
    return await _create_reservation_via_service(
        "create_gastronomy_reservation",
        payload,
        idempotency_key=validated.idempotency_key,
        confidence=validated.confidence,
        intent_source=validated.intent_source,
    )


async def book_room(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = HotelReservationInput.model_validate(arguments)
    payload = UnifiedReservationCreate.model_validate(validated.to_unified_payload())
    return await _create_reservation_via_service(
        "book_room",
        payload,
        idempotency_key=validated.idempotency_key,
        confidence=validated.confidence,
        intent_source=validated.intent_source,
    )


async def get_restaurant_availability(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = RestaurantAvailabilityInput.model_validate(arguments)
    return await _get_availability_via_service(
        "get_restaurant_availability",
        service_call=lambda session: AvailabilityReadService.get_restaurant_availability(
            session,
            restaurant_id=validated.restaurant_id,
            reservation_date=validated.date,
            party_size=validated.party_size,
            request_source="mcp",
        ),
    )


async def get_hotel_availability(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = HotelAvailabilityInput.model_validate(arguments)
    return await _get_availability_via_service(
        "get_hotel_availability",
        service_call=lambda session: AvailabilityReadService.get_hotel_availability(
            session,
            property_id=validated.property_id,
            check_in=validated.check_in,
            check_out=validated.check_out,
            adults=validated.adults,
            children=validated.children,
            request_source="mcp",
        ),
    )


async def get_filtered_emails(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = FilteredEmailsInput.model_validate(arguments)
    async with async_session() as session:
        response = await list_filtered_email_threads(session, limit=validated.limit)
    return {
        "ok": True,
        "tool": "get_filtered_emails",
        "emails": [item.model_dump(mode="json") for item in response.items],
        "total": response.total,
    }


async def generate_email_reply(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = GenerateEmailReplyInput.model_validate(arguments)
    async with async_session() as session:
        try:
            thread = await generate_reply_for_thread(
                session,
                thread_id=validated.thread_id,
                source="mcp",
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return {
        "ok": True,
        "tool": "generate_reply",
        "thread": serialize_email_thread(thread).model_dump(mode="json"),
    }


async def send_email_reply_tool(arguments: dict[str, Any]) -> dict[str, Any]:
    validated = SendEmailReplyInput.model_validate(arguments)
    async with async_session() as session:
        try:
            thread = await send_reply_for_thread(
                session,
                thread_id=validated.thread_id,
                source="mcp",
                replied_by_user_id=None,
                reply_content=validated.reply_content,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return {
        "ok": True,
        "tool": "send_reply",
        "thread": serialize_email_thread(thread).model_dump(mode="json"),
    }


# --- MCP Tool Registrations ---


@mcp_server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="check_table_availability",
            description="Checks if the restaurant has an available table for a specific date (YYYY-MM-DD), time (HH:MM), and party size.",
            inputSchema={
                "type": "object",
                "properties": {
                    "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                    "time": {"type": "string", "description": "Time in HH:MM format (24 hour)"},
                    "party_size": {"type": "integer", "description": "Number of guests"},
                },
                "required": ["date", "time", "party_size"],
            },
        ),
        types.Tool(
            name="create_gastronomy_reservation",
            description="Creates a restaurant reservation through the unified reservation service.",
            inputSchema=GastronomyReservationInput.model_json_schema(),
        ),
        types.Tool(
            name="get_restaurant_availability",
            description="Returns structured restaurant availability slots through the shared availability service.",
            inputSchema=RestaurantAvailabilityInput.model_json_schema(),
        ),
        types.Tool(
            name="book_room",
            description="Creates a hotel room booking through the unified reservation service.",
            inputSchema=HotelReservationInput.model_json_schema(),
        ),
        types.Tool(
            name="get_hotel_availability",
            description="Returns structured hotel room-type availability through the shared availability service.",
            inputSchema=HotelAvailabilityInput.model_json_schema(),
        ),
        types.Tool(
            name="get_filtered_emails",
            description="Returns only reservation-related inbox emails that passed filtering.",
            inputSchema={
                **FilteredEmailsInput.model_json_schema(),
                "required": [],
            },
        ),
        types.Tool(
            name="generate_reply",
            description="Generates a reservation reply draft for a filtered email thread.",
            inputSchema=GenerateEmailReplyInput.model_json_schema(),
        ),
        types.Tool(
            name="send_reply",
            description="Sends a generated reservation reply for a filtered email thread.",
            inputSchema=SendEmailReplyInput.model_json_schema(),
        ),
        types.Tool(
            name="cancel_reservation",
            description="Cancels an existing reservation in the system using its unique ID.",
            inputSchema={
                "type": "object",
                "properties": {
                    "reservation_id": {
                        "type": "integer",
                        "description": "The unique ID of the reservation to cancel",
                    }
                },
                "required": ["reservation_id"],
            },
        ),
    ]


@mcp_server.call_tool()
async def handle_call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
    args = arguments or {}
    idempotency_key = args.get("idempotency_key") if isinstance(args, dict) else None
    idempotency_token = set_idempotency_key(idempotency_key)
    tool_identity = None
    mcp_client_token = None
    if isinstance(args, dict):
        raw_intent_source = args.get("intent_source")
        if isinstance(raw_intent_source, str) and raw_intent_source.strip():
            tool_identity = f"mcp:{raw_intent_source.strip()[:64]}"
    if tool_identity:
        mcp_client_token = _mcp_client_id.set(tool_identity)
    try:
        async with _mcp_execution_slot(name):
            await _enforce_mcp_rate_limit(name)
            if name == "check_table_availability":
                result = await check_table_availability(**args)
            elif name == "create_gastronomy_reservation":
                return _json_text(await create_gastronomy_reservation(args))
            elif name == "get_restaurant_availability":
                return _json_text(await get_restaurant_availability(args))
            elif name == "book_room":
                return _json_text(await book_room(args))
            elif name == "get_hotel_availability":
                return _json_text(await get_hotel_availability(args))
            elif name == "get_filtered_emails":
                return _json_text(await get_filtered_emails(args))
            elif name == "generate_reply":
                return _json_text(await generate_email_reply(args))
            elif name == "send_reply":
                return _json_text(await send_email_reply_tool(args))
            elif name == "cancel_reservation":
                result = await cancel_reservation(**args)
            else:
                return [types.TextContent(type="text", text=f"Error: Unknown tool {name}")]

        return [types.TextContent(type="text", text=str(result))]
    except (HTTPException, ValidationError) as exc:
        await api_metrics.record_business_event("integration.mcp.failure")
        log_event(
            logger,
            logging.WARNING,
            "voicebooker_mcp_failure",
            tool=name,
            error=str(exc),
        )
        return _json_text(_tool_error_payload(name, exc, idempotency_key=idempotency_key))
    except Exception as e:
        await api_metrics.record_business_event("integration.mcp.failure")
        log_event(
            logger,
            logging.ERROR,
            "voicebooker_mcp_failure",
            tool=name,
            error=str(e),
        )
        return _json_text(_tool_error_payload(name, e, idempotency_key=idempotency_key))
    finally:
        if mcp_client_token is not None:
            _mcp_client_id.reset(mcp_client_token)
        reset_idempotency_key(idempotency_token)


# --- ASGI Transport Endpoints ---
# These use raw Starlette handlers to pass the real ASGI scope/receive/send
# to the MCP SSE transport — FastAPI's Request object doesn't expose the raw send callable.


async def handle_sse(request: Request) -> Response:
    """SSE connection point for VoiceBooker's MCP Client."""
    logger.info("MCP SSE connection initiated from %s", request.client)
    async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
        await mcp_server.run(
            streams[0], streams[1], mcp_server.create_initialization_options()
        )
    return Response()


async def handle_messages(request: Request) -> Response:
    """Endpoint where the VoiceBooker MCP Client sends JSON-RPC messages."""
    logger.info("MCP message received from %s", request.client)
    token = _mcp_client_id.set(_get_mcp_client_identifier(request))
    try:
        await sse.handle_post_message(request.scope, request.receive, request._send)
    finally:
        _mcp_client_id.reset(token)
    return Response()


# Starlette sub-application — mounted in main.py via `app.mount("/mcp/voicebooker", mcp_app)`
mcp_app = Starlette(
    routes=[
        Route("/", endpoint=handle_sse),
        Route("/events", endpoint=handle_sse),
        Route("/sse", endpoint=handle_sse),
        Route("/messages", endpoint=handle_messages, methods=["POST"]),
    ],
)
