"""Tests for MCP server tool registration and handler dispatch."""

import json
import logging
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.integrations.mcp_server as mcp_module
import app.reservations.idempotency as idempotency_module
import app.security.rate_limit as rate_limit_module
from app.auth.models import Restaurant
from app.database import async_session
from app.email_inbox.models import EmailThread
from app.hms.models import HotelProperty, Room, RoomType
from app.hms.room_inventory import inventory_room_numbers, room_category_display_label
from app.integrations.mcp_server import (
    handle_call_tool,
    handle_list_tools,
    mcp_app,
    mcp_server,
    sse,
)
from app.main import app
from app.observability.metrics import api_metrics
from app.reservations.domain import Reservation as DomainReservation
from app.reservations.models import FloorSection, Table
from app.reservations.unified_service import ReservationCreateResult


@pytest.mark.asyncio
async def test_list_tools_returns_nine_tools() -> None:
    tools = await handle_list_tools()
    assert len(tools) == 9
    names = {t.name for t in tools}
    assert names == {
        "check_table_availability",
        "create_gastronomy_reservation",
        "get_restaurant_availability",
        "book_room",
        "get_hotel_availability",
        "get_filtered_emails",
        "generate_reply",
        "send_reply",
        "cancel_reservation",
    }


@pytest.mark.asyncio
async def test_list_tools_have_required_schema_fields() -> None:
    tools = await handle_list_tools()
    for tool in tools:
        assert tool.description
        schema = tool.inputSchema
        assert "properties" in schema
        assert "required" in schema


@pytest.mark.asyncio
async def test_call_unknown_tool_returns_error() -> None:
    result = await handle_call_tool("nonexistent_tool", {})
    assert len(result) == 1
    assert "Error" in result[0].text or "Unknown" in result[0].text


@pytest.mark.asyncio
async def test_removed_create_reservation_tool_returns_unknown_tool_error() -> None:
    result = await handle_call_tool(
        "create_reservation",
        {
            "name": "Test User",
            "phone": "555-0100",
            "date": "2026-03-20",
            "time": "19:00",
            "party_size": 2,
        },
    )
    assert len(result) == 1
    assert "Unknown tool" in result[0].text


@pytest.mark.asyncio
async def test_check_table_availability_bad_date_format() -> None:
    result = await handle_call_tool(
        "check_table_availability",
        {"date": "15-03-2026", "time": "19:00", "party_size": 4},
    )
    assert len(result) == 1
    assert "Error" in result[0].text or "Invalid" in result[0].text


class _FakeSession:
    def __init__(self) -> None:
        self.committed = False
        self.rolled_back = False

    async def commit(self) -> None:
        self.committed = True

    async def rollback(self) -> None:
        self.rolled_back = True


class _FakeSessionContext:
    def __init__(self, session: _FakeSession) -> None:
        self.session = session

    async def __aenter__(self) -> _FakeSession:
        return self.session

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


@pytest.mark.asyncio
async def test_create_gastronomy_reservation_routes_through_unified_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_session = _FakeSession()
    captured = {}

    async def fake_create_reservation(session, payload, **kwargs):
        captured["session"] = session
        captured["payload"] = payload
        return ReservationCreateResult(
            reservation=DomainReservation(
                id=77,
                type="restaurant",
                restaurant_id=payload.restaurant_id,
                guest_name="Ada",
                guest_phone=payload.guest_phone,
                party_size=payload.party_size,
                reservation_date=payload.reservation_date,
                start_time=payload.start_time,
                source=payload.source,
            ),
        )

    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(fake_session))
    monkeypatch.setattr(mcp_module.ReservationService, "create_reservation", fake_create_reservation)
    monkeypatch.setattr(
        mcp_module,
        "serialize_created_reservation",
        lambda result: {"id": result.reservation.id, "guest_name": "Ada"},
    )

    result = await handle_call_tool(
        "create_gastronomy_reservation",
        {
            "restaurant_id": 7,
            "guest_name": "Ada",
            "guest_phone": "555-0100",
            "party_size": 2,
            "reservation_date": "2026-04-01",
            "start_time": "19:00:00",
        },
    )

    body = json.loads(result[0].text)
    assert body == {
        "ok": True,
        "tool": "create_gastronomy_reservation",
        "reservation_kind": "restaurant",
        "reservation": {"id": 77, "guest_name": "Ada"},
    }
    assert captured["session"] is fake_session
    assert captured["payload"].kind == "restaurant"
    assert captured["payload"].restaurant_id == 7
    assert captured["payload"].source == "mcp"
    assert fake_session.committed is True
    assert fake_session.rolled_back is False


@pytest.mark.asyncio
async def test_book_room_routes_through_unified_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_session = _FakeSession()
    captured = {}

    async def fake_create_reservation(session, payload, **kwargs):
        captured["session"] = session
        captured["payload"] = payload
        return ReservationCreateResult(
            reservation=DomainReservation(
                id=88,
                type="hotel",
                property_id=payload.property_id,
                guest_name="Grace",
                guest_phone=payload.guest_phone,
                check_in=payload.check_in,
                check_out=payload.check_out,
                room_type_label=payload.room_type_label or "Komfort",
                booking_id="BK-123",
                source=payload.source,
            ),
        )

    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(fake_session))
    monkeypatch.setattr(mcp_module.ReservationService, "create_reservation", fake_create_reservation)
    monkeypatch.setattr(
        mcp_module,
        "serialize_created_reservation",
        lambda result: {"id": "R-88", "booking_id": result.reservation.booking_id},
    )

    result = await handle_call_tool(
        "book_room",
        {
            "property_id": 9,
            "room_type_label": "Komfort",
            "guest_name": "Grace",
            "guest_phone": "555-0111",
            "check_in": "2026-05-10",
            "check_out": "2026-05-12",
        },
    )

    body = json.loads(result[0].text)
    assert body == {
        "ok": True,
        "tool": "book_room",
        "reservation_kind": "hotel",
        "reservation": {"id": "R-88", "booking_id": "BK-123"},
    }
    assert captured["session"] is fake_session
    assert captured["payload"].kind == "hotel"
    assert captured["payload"].property_id == 9
    assert captured["payload"].source == "mcp"
    assert fake_session.committed is True
    assert fake_session.rolled_back is False


@pytest.mark.asyncio
async def test_create_gastronomy_reservation_validation_error_is_structured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _allow_rate_limit(_tool_name: str) -> None:
        return None

    monkeypatch.setattr(mcp_module, "_enforce_mcp_rate_limit", _allow_rate_limit)
    result = await handle_call_tool(
        "create_gastronomy_reservation",
        {
            "restaurant_id": 7,
            "guest_name": "Ada",
            "party_size": 0,
            "reservation_date": "2026-04-01",
            "start_time": "19:00:00",
        },
    )

    body = json.loads(result[0].text)
    assert body["ok"] is False
    assert body["tool"] == "create_gastronomy_reservation"
    assert body["status_code"] == 422


@pytest.mark.asyncio
async def test_book_room_service_error_is_structured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake_session = _FakeSession()

    async def _allow_rate_limit(_tool_name: str) -> None:
        return None

    async def fake_create_reservation(session, payload, **kwargs):
        raise mcp_module.HTTPException(status_code=400, detail="Room type not found")

    monkeypatch.setattr(mcp_module, "_enforce_mcp_rate_limit", _allow_rate_limit)
    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(fake_session))
    monkeypatch.setattr(mcp_module.ReservationService, "create_reservation", fake_create_reservation)

    result = await handle_call_tool(
        "book_room",
        {
            "property_id": 9,
            "room_type_label": "Unknown",
            "guest_name": "Grace",
            "guest_phone": "555-0111",
            "check_in": "2026-05-10",
            "check_out": "2026-05-12",
        },
    )

    body = json.loads(result[0].text)
    assert body["ok"] is False
    assert body["tool"] == "book_room"
    assert body["error"] == "Room type not found"
    assert body["status_code"] == 400
    assert body["error_code"] == "invalid_request"
    assert body["request_source"] == "mcp"
    assert fake_session.committed is False
    assert fake_session.rolled_back is True


@pytest.mark.asyncio
async def test_book_room_invalid_room_returns_not_found() -> None:
    suffix = uuid4().hex[:8]

    async with async_session() as session:
        property_record = HotelProperty(
            name=f"MCP Invalid Room Hotel {suffix}",
            address="Inventory Street 1",
            city="Berlin",
            country="DE",
        )
        session.add(property_record)
        await session.flush()

        room_type = RoomType(
            property_id=property_record.id,
            name=room_category_display_label("suite"),
            base_occupancy=2,
            max_occupancy=4,
            base_price=199.0,
        )
        session.add(room_type)
        await session.flush()

        session.add(
            Room(
                property_id=property_record.id,
                room_number=inventory_room_numbers("suite")[0],
                room_type_id=room_type.id,
                status="available",
            )
        )
        await session.commit()
        property_id = property_record.id

    result = await handle_call_tool(
        "book_room",
        {
            "property_id": property_id,
            "room_type_label": room_category_display_label("suite"),
            "room": "999",
            "guest_name": "Invalid Room Guest",
            "guest_phone": "555-0112",
            "check_in": "2026-05-10",
            "check_out": "2026-05-12",
        },
    )

    body = json.loads(result[0].text)
    assert body["ok"] is False
    assert body["tool"] == "book_room"
    assert body["status_code"] == 404
    assert body["error"] == "Room not found"
    assert body["error_code"] == "not_found"


@pytest.mark.asyncio
async def test_get_restaurant_availability_returns_structured_slots_and_metrics() -> None:
    await api_metrics.reset()
    try:
        suffix = uuid4().hex[:8]

        async with async_session() as session:
            restaurant = Restaurant(
                name=f"MCP Availability Restaurant {suffix}",
                address="MCP Street 2",
                city="Berlin",
                state="BE",
                zip_code="10115",
                phone=f"556{suffix[:4]}",
            )
            session.add(restaurant)
            await session.flush()

            section = FloorSection(
                name=f"MCP Availability Section {suffix}",
                restaurant_id=restaurant.id,
            )
            session.add(section)
            await session.flush()

            table = Table(
                restaurant_id=restaurant.id,
                section_id=section.id,
                table_number=f"A-{suffix[:4]}",
                capacity=4,
            )
            session.add(table)
            await session.commit()

            restaurant_id = restaurant.id

        result = await handle_call_tool(
            "get_restaurant_availability",
            {
                "restaurant_id": restaurant_id,
                "date": "2026-12-10",
                "party_size": 2,
            },
        )

        body = json.loads(result[0].text)
        assert body["ok"] is True
        assert body["tool"] == "get_restaurant_availability"
        assert body["availability"]["type"] == "restaurant"
        assert isinstance(body["availability"]["slots"], list)
        assert any(slot["start_time"] == "18:00" for slot in body["availability"]["slots"])

        metrics = await api_metrics.business_snapshot()
        assert metrics["availability.query.total"] == 1
        assert metrics["availability.query.total.source.mcp"] == 1
    finally:
        await api_metrics.reset()


@pytest.mark.asyncio
async def test_get_hotel_availability_returns_structured_room_types() -> None:
    suffix = uuid4().hex[:8]

    async with async_session() as session:
        property_record = HotelProperty(
            name=f"MCP Availability Hotel {suffix}",
            address="MCP Hotel Street 1",
            city="Hamburg",
            country="DE",
        )
        session.add(property_record)
        await session.flush()

        room_type = RoomType(
            property_id=property_record.id,
            name=room_category_display_label("suite"),
            base_occupancy=2,
            max_occupancy=4,
            base_price=199.0,
        )
        session.add(room_type)
        await session.flush()

        session.add(
            Room(
                property_id=property_record.id,
                room_number=inventory_room_numbers("suite")[0],
                room_type_id=room_type.id,
                status="available",
            )
        )
        await session.commit()

        property_id = property_record.id
        room_type_id = room_type.id

    result = await handle_call_tool(
        "get_hotel_availability",
        {
            "property_id": property_id,
            "check_in": "2026-12-11",
            "check_out": "2026-12-13",
            "adults": 2,
            "children": 0,
        },
    )

    body = json.loads(result[0].text)
    assert body["ok"] is True
    assert body["tool"] == "get_hotel_availability"
    assert body["availability"]["type"] == "hotel"
    room_type_entry = next(
        item for item in body["availability"]["room_types"] if item["room_type_id"] == room_type_id
    )
    assert room_type_entry["available_rooms"] == len(inventory_room_numbers("suite"))


@pytest.mark.asyncio
async def test_mcp_availability_tools_are_rate_limited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await rate_limit_module.reset_rate_limit_counters()

    async def failing_redis():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(rate_limit_module, "get_redis", failing_redis)
    monkeypatch.setattr(mcp_module.settings, "mcp_availability_rate_limit_per_minute", 1)

    first = await handle_call_tool(
        "check_table_availability",
        {"date": "2026-12-15", "time": "19:00", "party_size": 2},
    )
    second = await handle_call_tool(
        "check_table_availability",
        {"date": "2026-12-15", "time": "19:00", "party_size": 2},
    )

    assert "Error" in first[0].text or "Unfortunately" in first[0].text or "Yes!" in first[0].text
    body = json.loads(second[0].text)
    assert body["ok"] is False
    assert body["status_code"] == 429
    assert body["error"] == "Too many MCP tool calls"

    metrics = await api_metrics.business_snapshot()
    assert metrics["integration.mcp.rate_limited"] == 1

    await rate_limit_module.reset_rate_limit_counters()


def test_mcp_app_has_sse_and_messages_routes() -> None:
    route_paths = {r.path for r in mcp_app.routes}
    assert "/" in route_paths
    assert "/events" in route_paths
    assert "/sse" in route_paths
    assert "/messages" in route_paths


def test_mcp_server_name() -> None:
    assert mcp_server.name == "gestronomy-voicebooker-mcp"


def test_mcp_transport_uses_relative_message_endpoint() -> None:
    assert sse._endpoint == "/messages"


def test_mcp_head_probe_returns_ok_without_touching_stream_transport() -> None:
    with TestClient(app) as client:
        response = client.head("/mcp/voicebooker/")

    assert response.status_code == 200
    assert response.text == ""


@pytest.mark.asyncio
async def test_mcp_reservation_records_availability_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await api_metrics.reset()
    try:
        async def _allow_rate_limit(_tool_name: str) -> None:
            return None

        monkeypatch.setattr(mcp_module, "_enforce_mcp_rate_limit", _allow_rate_limit)
        suffix = uuid4().hex[:8]

        async with async_session() as session:
            restaurant = Restaurant(
                name=f"MCP Restaurant {suffix}",
                address="MCP Street 1",
                city="Berlin",
                state="BE",
                zip_code="10115",
                phone=f"555{suffix[:4]}",
            )
            session.add(restaurant)
            await session.flush()

            section = FloorSection(
                name=f"MCP Section {suffix}",
                restaurant_id=restaurant.id,
            )
            session.add(section)
            await session.flush()

            table = Table(
                restaurant_id=restaurant.id,
                section_id=section.id,
                table_number=f"M-{suffix[:4]}",
                capacity=4,
            )
            session.add(table)
            await session.commit()

            restaurant_id = restaurant.id
            table_id = table.id

        result = await handle_call_tool(
            "create_gastronomy_reservation",
            {
                "restaurant_id": restaurant_id,
                "guest_name": "MCP Metrics Guest",
                "guest_phone": "555-0600",
                "party_size": 2,
                "reservation_date": "2026-12-01",
                "start_time": "19:00:00",
                "table_id": table_id,
            },
        )

        body = json.loads(result[0].text)
        assert body["ok"] is True

        metrics = await api_metrics.business_snapshot()
        assert metrics["reservation.availability.check.total"] == 1
        assert metrics["reservation.availability.check.total.source.mcp"] == 1
        assert metrics["reservation.create.success"] == 1
    finally:
        await api_metrics.reset()


@pytest.mark.asyncio
async def test_mcp_booking_idempotency_replays_same_result(
    monkeypatch: pytest.MonkeyPatch,
    fake_shared_redis_backend,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await rate_limit_module.reset_rate_limit_counters()
    caplog.set_level(logging.INFO, logger="app.integrations.mcp_server")
    fake_session = _FakeSession()
    call_count = {"count": 0}

    async def _get_redis():
        return fake_shared_redis_backend

    async def fake_create_reservation(session, payload, **kwargs):
        call_count["count"] += 1
        return ReservationCreateResult(
            reservation=DomainReservation(
                id=99,
                type="restaurant",
                restaurant_id=payload.restaurant_id,
                guest_name="Ada",
                guest_phone=payload.guest_phone,
                party_size=payload.party_size,
                reservation_date=payload.reservation_date,
                start_time=payload.start_time,
                source=payload.source,
            ),
        )

    monkeypatch.setattr(idempotency_module, "get_redis", _get_redis)
    monkeypatch.setattr(mcp_module.settings, "mcp_booking_rate_limit_per_minute", 100)
    monkeypatch.setattr(mcp_module.settings, "mcp_booking_rate_limit_burst_per_10_seconds", 100)
    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(fake_session))
    monkeypatch.setattr(mcp_module.ReservationService, "create_reservation", fake_create_reservation)
    monkeypatch.setattr(
        mcp_module,
        "serialize_created_reservation",
        lambda result: {"id": result.reservation.id, "guest_name": "Ada"},
    )

    arguments = {
        "restaurant_id": 7,
        "guest_name": "Ada",
        "guest_phone": "555-0100",
        "party_size": 2,
        "reservation_date": "2026-04-01",
        "start_time": "19:00:00",
        "idempotency_key": "mcp-replay-1",
        "confidence": 0.92,
        "intent_source": "agent",
    }
    first = await handle_call_tool("create_gastronomy_reservation", arguments)
    second = await handle_call_tool("create_gastronomy_reservation", arguments)

    first_body = json.loads(first[0].text)
    second_body = json.loads(second[0].text)
    assert first_body == second_body
    assert call_count["count"] == 1
    events = [json.loads(record.getMessage()) for record in caplog.records]
    assert any(event.get("event") == "mcp_idempotency_hit" for event in events)


@pytest.mark.asyncio
async def test_mcp_idempotency_rejects_payload_mismatch(
    monkeypatch: pytest.MonkeyPatch,
    fake_shared_redis_backend,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await rate_limit_module.reset_rate_limit_counters()
    caplog.set_level(logging.INFO, logger="app.integrations.mcp_server")
    fake_session = _FakeSession()

    async def _get_redis():
        return fake_shared_redis_backend

    async def fake_create_reservation(session, payload, **kwargs):
        return ReservationCreateResult(
            reservation=DomainReservation(
                id=101,
                type="restaurant",
                restaurant_id=payload.restaurant_id,
                guest_name="Ada",
                guest_phone=payload.guest_phone,
                party_size=payload.party_size,
                reservation_date=payload.reservation_date,
                start_time=payload.start_time,
                source=payload.source,
            ),
        )

    monkeypatch.setattr(idempotency_module, "get_redis", _get_redis)
    monkeypatch.setattr(mcp_module.settings, "mcp_booking_rate_limit_per_minute", 100)
    monkeypatch.setattr(mcp_module.settings, "mcp_booking_rate_limit_burst_per_10_seconds", 100)
    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(fake_session))
    monkeypatch.setattr(mcp_module.ReservationService, "create_reservation", fake_create_reservation)
    monkeypatch.setattr(
        mcp_module,
        "serialize_created_reservation",
        lambda result: {"id": result.reservation.id, "guest_name": "Ada"},
    )

    first = await handle_call_tool(
        "create_gastronomy_reservation",
        {
            "restaurant_id": 7,
            "guest_name": "Ada",
            "guest_phone": "555-0100",
            "party_size": 2,
            "reservation_date": "2026-04-01",
            "start_time": "19:00:00",
            "idempotency_key": "mcp-mismatch-1",
        },
    )
    second = await handle_call_tool(
        "create_gastronomy_reservation",
        {
            "restaurant_id": 7,
            "guest_name": "Ada",
            "guest_phone": "555-0100",
            "party_size": 4,
            "reservation_date": "2026-04-01",
            "start_time": "19:00:00",
            "idempotency_key": "mcp-mismatch-1",
        },
    )

    assert json.loads(first[0].text)["ok"] is True
    second_body = json.loads(second[0].text)
    assert second_body["ok"] is False
    assert second_body["status_code"] == 409
    assert second_body["error_code"] == "conflict"
    events = [json.loads(record.getMessage()) for record in caplog.records]
    assert any(event.get("event") == "mcp_idempotency_conflict" for event in events)


@pytest.mark.asyncio
async def test_mcp_idempotency_claim_is_released_after_failure(
    monkeypatch: pytest.MonkeyPatch,
    fake_shared_redis_backend,
) -> None:
    await rate_limit_module.reset_rate_limit_counters()
    fake_session = _FakeSession()
    call_count = {"count": 0}

    async def _get_redis():
        return fake_shared_redis_backend

    async def fake_create_reservation(session, payload, **kwargs):
        call_count["count"] += 1
        if call_count["count"] == 1:
            raise mcp_module.HTTPException(status_code=503, detail="temporary failure")
        return ReservationCreateResult(
            reservation=DomainReservation(
                id=111,
                type="restaurant",
                restaurant_id=payload.restaurant_id,
                guest_name="Ada",
                guest_phone=payload.guest_phone,
                party_size=payload.party_size,
                reservation_date=payload.reservation_date,
                start_time=payload.start_time,
                source=payload.source,
            ),
        )

    monkeypatch.setattr(idempotency_module, "get_redis", _get_redis)
    monkeypatch.setattr(mcp_module.settings, "mcp_booking_rate_limit_per_minute", 100)
    monkeypatch.setattr(mcp_module.settings, "mcp_booking_rate_limit_burst_per_10_seconds", 100)
    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(fake_session))
    monkeypatch.setattr(mcp_module.ReservationService, "create_reservation", fake_create_reservation)
    monkeypatch.setattr(
        mcp_module,
        "serialize_created_reservation",
        lambda result: {"id": result.reservation.id, "guest_name": "Ada"},
    )

    arguments = {
        "restaurant_id": 7,
        "guest_name": "Ada",
        "guest_phone": "555-0100",
        "party_size": 2,
        "reservation_date": "2026-04-01",
        "start_time": "19:00:00",
        "idempotency_key": "mcp-release-1",
    }
    first = await handle_call_tool("create_gastronomy_reservation", arguments)
    second = await handle_call_tool("create_gastronomy_reservation", arguments)

    first_body = json.loads(first[0].text)
    second_body = json.loads(second[0].text)
    assert first_body["ok"] is False
    assert first_body["status_code"] == 503
    assert second_body["ok"] is True
    assert call_count["count"] == 2


@pytest.mark.asyncio
async def test_get_filtered_emails_tool_returns_reservation_threads_only() -> None:
    suffix = uuid4().hex[:8]
    now = datetime.utcnow()

    async with async_session() as session:
        session.add_all(
            [
                EmailThread(
                    external_email_id=f"mcp-filter-res-{suffix}",
                    sender="Alice <alice@example.com>",
                    subject="Room offer",
                    body="Need a room offer",
                    received_at=now,
                    raw_email={
                        "id": f"mcp-filter-res-{suffix}",
                        "from": "Alice <alice@example.com>",
                        "subject": "Room offer",
                        "body": "Need a room offer",
                        "received_at": now.isoformat(),
                    },
                    category="reservation",
                    status="processed",
                    summary="Room offer",
                    extracted_data={"intent": "hotel"},
                ),
                EmailThread(
                    external_email_id=f"mcp-filter-spam-{suffix}",
                    sender="Spam <spam@example.com>",
                    subject="SEO",
                    body="marketing",
                    received_at=now,
                    raw_email={
                        "id": f"mcp-filter-spam-{suffix}",
                        "from": "Spam <spam@example.com>",
                        "subject": "SEO",
                        "body": "marketing",
                        "received_at": now.isoformat(),
                    },
                    category="spam",
                    status="ignored",
                    summary="SEO",
                ),
            ]
        )
        await session.commit()

    result = await handle_call_tool("get_filtered_emails", {"limit": 20})
    body = json.loads(result[0].text)
    assert body["ok"] is True
    assert body["tool"] == "get_filtered_emails"
    ids = {item["external_email_id"] for item in body["emails"]}
    assert any(identifier.startswith("mcp-filter-res-") for identifier in ids)
    assert not any(identifier.startswith("mcp-filter-spam-") for identifier in ids)


@pytest.mark.asyncio
async def test_generate_and_send_reply_tools_route_through_email_inbox_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[tuple[str, int]] = []

    async def fake_generate_reply(session, *, thread_id: int, source: str):
        events.append(("generate", thread_id))
        thread = EmailThread(
            external_email_id="thread-1",
            sender="Alice <alice@example.com>",
            subject="Room inquiry",
            body="Need room",
            received_at=datetime.utcnow(),
            raw_email={},
            category="reservation",
            status="processed",
            reply_generated=True,
            reply_content="Draft",
        )
        thread.id = thread_id
        return thread

    async def fake_send_reply(session, *, thread_id: int, source: str, replied_by_user_id, reply_content=None):
        events.append(("send", thread_id))
        thread = EmailThread(
            external_email_id="thread-1",
            sender="Alice <alice@example.com>",
            subject="Room inquiry",
            body="Need room",
            received_at=datetime.utcnow(),
            raw_email={},
            category="reservation",
            status="processed",
            reply_generated=True,
            reply_sent=True,
            reply_content=reply_content or "Draft",
        )
        thread.id = thread_id
        return thread

    monkeypatch.setattr(mcp_module, "async_session", lambda: _FakeSessionContext(_FakeSession()))
    monkeypatch.setattr(mcp_module, "generate_reply_for_thread", fake_generate_reply)
    monkeypatch.setattr(mcp_module, "send_reply_for_thread", fake_send_reply)

    generated = await handle_call_tool("generate_reply", {"thread_id": 41})
    sent = await handle_call_tool("send_reply", {"thread_id": 41})

    generated_body = json.loads(generated[0].text)
    sent_body = json.loads(sent[0].text)
    assert generated_body["ok"] is True
    assert generated_body["tool"] == "generate_reply"
    assert sent_body["ok"] is True
    assert sent_body["tool"] == "send_reply"
    assert events == [("generate", 41), ("send", 41)]
