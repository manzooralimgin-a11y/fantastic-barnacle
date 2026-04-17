from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import service as ai_service
from app.billing.schemas import TableOrderCreate
from app.billing.service import create_order
from app.billing.models import OrderItem, TableOrder
from app.hms.models import (
    HousekeepingTask,
    HotelFolio,
    HotelFolioLine,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
    RoomType,
)
from app.observability.metrics import api_metrics


pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_ai_hotel_snapshot_and_query_use_live_hotel_data(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_seed,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await api_metrics.reset()
    await ai_service.snapshot_cache_store.invalidate(property_id=None)
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    tomorrow = today + timedelta(days=1)

    property_record = HotelProperty(
        name="AI Hotel",
        address="River 7",
        city="Magdeburg",
        country="DE",
        timezone="UTC",
        currency="EUR",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=150.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    occupied_room = Room(
        property_id=property_record.id,
        room_number="201",
        room_type_id=room_type.id,
        status="occupied",
    )
    available_room = Room(
        property_id=property_record.id,
        room_number="202",
        room_type_id=room_type.id,
        status="available",
    )
    db_session.add_all([occupied_room, available_room])
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Ava Lang",
        guest_email="ava@example.com",
        guest_phone="111",
        phone="111",
        check_in=today,
        check_out=tomorrow,
        status="checked_in",
        total_amount=150.0,
        currency="EUR",
        booking_id="QA-AI-001",
        room="201",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
    )
    db_session.add(reservation)
    await db_session.flush()

    stay = HotelStay(
        property_id=property_record.id,
        reservation_id=reservation.id,
        room_id=occupied_room.id,
        status="checked_in",
        planned_check_in=today,
        planned_check_out=tomorrow,
        actual_check_in_at=now_utc,
    )
    db_session.add(stay)
    await db_session.flush()

    folio = HotelFolio(
        property_id=property_record.id,
        stay_id=stay.id,
        reservation_id=reservation.id,
        folio_number="FOL-AI-001",
        currency="EUR",
        status="open",
        subtotal=150.0,
        tax_amount=0.0,
        discount_amount=0.0,
        total=150.0,
        balance_due=150.0,
    )
    db_session.add(folio)
    await db_session.flush()

    folio_line = HotelFolioLine(
        folio_id=folio.id,
        charge_type="room",
        description="Room night",
        quantity=1,
        unit_price=150.0,
        total_price=150.0,
        service_date=today,
        status="posted",
    )
    db_session.add(folio_line)

    housekeeping_task = HousekeepingTask(
        property_id=property_record.id,
        room_id=available_room.id,
        task_type="cleaning",
        title="Turn room 202",
        priority="high",
        status="pending",
        due_date=today,
        task_source="owner_app",
    )
    db_session.add(housekeeping_task)

    order = TableOrder(
        restaurant_id=tenant_seed.restaurant_a_id,
        status="open",
        order_type="dine_in",
        subtotal=35.0,
        tax_amount=0.0,
        total=35.0,
        guest_name="Owner AI",
        created_at=now_utc,
    )
    db_session.add(order)
    await db_session.flush()

    db_session.add(
        OrderItem(
            restaurant_id=tenant_seed.restaurant_a_id,
            order_id=order.id,
            menu_item_id=tenant_seed.menu_item_a_id,
            item_name="Breakfast",
            quantity=1,
            unit_price=35.0,
            total_price=35.0,
            status="pending",
            course_number=1,
        )
    )
    await db_session.commit()

    snapshot_response = await client.get(
        f"/api/ai/hotel-snapshot?property_id={property_record.id}"
    )
    assert snapshot_response.status_code == 200
    snapshot_payload = snapshot_response.json()
    assert snapshot_payload["summary"]["occupied_rooms"] == 1
    assert snapshot_payload["summary"]["total_rooms"] == 2
    assert snapshot_payload["summary"]["checkouts_tomorrow"] == 1
    assert snapshot_payload["summary"]["revenue_today"] == 185.0
    assert snapshot_payload["summary"]["restaurant_orders_today"] == 1
    assert snapshot_payload["folios"]["open_count"] == 1
    assert snapshot_payload["housekeeping"]["due_today"] == 1

    direct_query_response = await client.post(
        "/api/ai/query",
        json={
            "question": "How many rooms are occupied?",
            "property_id": property_record.id,
            "history": [{"role": "user", "content": "How many rooms are occupied?"}],
        },
    )
    assert direct_query_response.status_code == 200
    direct_payload = direct_query_response.json()
    assert direct_payload["route"] == "direct_db"
    assert direct_payload["model"] == "direct_db"
    assert direct_payload["used_fallback"] is False
    assert direct_payload["route_confidence"] >= 0.88
    assert "Live occupancy" in direct_payload["answer"]
    assert direct_payload["highlights"]["occupied_rooms"] == 1
    assert direct_payload["snapshot_cache_status"] in {"local_hit", "redis_hit", "fresh"}

    async def fake_openai_call(*, question, history, llm_snapshot, user_context):
        assert question == "What should I watch operationally today?"
        if history:
            assert history[-1].content == "What should I watch operationally today?"
        serialized = str(llm_snapshot)
        assert "Ava Lang" not in serialized
        assert "QA-AI-001" not in serialized
        assert "FOL-AI-001" not in serialized
        assert llm_snapshot["executive_summary"]["occupied_rooms"] == 1
        assert llm_snapshot["finance"]["revenue_today"] == 185.0
        assert user_context is not None
        return "1 room is occupied right now. Today's revenue is €185.00."

    monkeypatch.setattr(
        "app.ai.service._call_openai_responses_api",
        fake_openai_call,
    )

    ai_query_response = await client.post(
        "/api/ai/query",
        json={
            "question": "What should I watch operationally today?",
            "property_id": property_record.id,
            "history": [{"role": "user", "content": "What should I watch operationally today?"}],
        },
    )
    assert ai_query_response.status_code == 200
    ai_payload = ai_query_response.json()
    assert ai_payload["route"] == "llm"
    assert ai_payload["answer"] == "1 room is occupied right now. Today's revenue is €185.00."
    assert ai_payload["used_fallback"] is False
    assert ai_payload["highlights"]["occupied_rooms"] == 1
    assert ai_payload["highlights"]["revenue_today"] == 185.0
    assert ai_payload["route_confidence"] == 0.55

    stream_response = await client.post(
        "/api/ai/query/stream",
        json={
            "question": "How many rooms are occupied?",
            "property_id": property_record.id,
        },
        headers={"x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )
    assert stream_response.status_code == 200
    assert stream_response.headers["content-type"].startswith("text/event-stream")
    assert "event: status" in stream_response.text
    assert "event: result" in stream_response.text
    assert "Pulling the live hotel snapshot" in stream_response.text
    assert "Live occupancy" in stream_response.text

    metrics_response = await client.get("/api/ai/metrics")
    assert metrics_response.status_code == 200
    metrics_payload = metrics_response.json()
    assert metrics_payload["overall"]["count"] >= 2
    assert metrics_payload["per_route"]["direct_db"]["count"] >= 1
    assert metrics_payload["per_route"]["llm"]["count"] >= 1
    assert "ai.query.route.direct_db" in metrics_payload["events"]

    snapshot_key = ai_service._build_snapshot_cache_key(property_record.id)
    cached_snapshot, cache_status = await ai_service.snapshot_cache_store.get(snapshot_key)
    assert cached_snapshot is not None
    assert cache_status in {"local_hit", "redis_hit"}

    await create_order(
        db_session,
        tenant_seed.restaurant_a_id,
        TableOrderCreate(
            table_id=tenant_seed.table_a_id,
            order_type="dine_in",
            guest_name="Cache Bust",
        ),
    )
    await db_session.commit()
    await ai_service.flush_pending_ai_snapshot_invalidations(db_session)
    cached_snapshot_after, _cache_status_after = await ai_service.snapshot_cache_store.get(snapshot_key)
    assert cached_snapshot_after is None

    dashboard_query_response = await client.post(
        "/api/dashboard/query",
        json={"query": "How many rooms are occupied?"},
    )
    assert dashboard_query_response.status_code == 200
    dashboard_payload = dashboard_query_response.json()
    assert "Live occupancy" in dashboard_payload["answer"]
    assert dashboard_payload["data"]["occupied_rooms"] == 1


async def test_ai_query_falls_back_when_daily_token_limit_is_exceeded(
    client: AsyncClient,
    db_session: AsyncSession,
    tenant_seed,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await api_metrics.reset()
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()
    tomorrow = today + timedelta(days=1)

    property_record = HotelProperty(
        name="Budget Hotel",
        address="River 8",
        city="Magdeburg",
        country="DE",
        timezone="UTC",
        currency="EUR",
    )
    db_session.add(property_record)
    await db_session.flush()

    room_type = RoomType(
        property_id=property_record.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=150.0,
    )
    db_session.add(room_type)
    await db_session.flush()

    room = Room(
        property_id=property_record.id,
        room_number="301",
        room_type_id=room_type.id,
        status="occupied",
    )
    db_session.add(room)
    await db_session.flush()

    reservation = HotelReservation(
        property_id=property_record.id,
        guest_name="Budget Guest",
        guest_email="budget@example.com",
        guest_phone="222",
        phone="222",
        check_in=today,
        check_out=tomorrow,
        status="checked_in",
        total_amount=150.0,
        currency="EUR",
        booking_id="QA-AI-002",
        room="301",
        room_type_id=room_type.id,
        room_type_label="Komfort",
        adults=2,
        children=0,
    )
    db_session.add(reservation)
    await db_session.flush()

    db_session.add(
        HotelStay(
            property_id=property_record.id,
            reservation_id=reservation.id,
            room_id=room.id,
            status="checked_in",
            planned_check_in=today,
            planned_check_out=tomorrow,
            actual_check_in_at=now_utc,
        )
    )
    await db_session.commit()

    monkeypatch.setattr(ai_service.settings, "ai_daily_token_limit_per_tenant", 10)

    async def fake_budget_get(_key: str) -> int:
        return 10

    monkeypatch.setattr(ai_service.tenant_token_budget_store, "get", fake_budget_get)

    response = await client.post(
        "/api/ai/query",
        json={
            "question": "What should I watch operationally today?",
            "property_id": property_record.id,
        },
        headers={"x-test-restaurant-id": str(tenant_seed.restaurant_a_id)},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["route"] == "budget_fallback"
    assert payload["used_fallback"] is True
    assert payload["error"] == "daily_token_limit_exceeded"
    assert payload["token_budget_remaining"] == 0
    assert "token budget has been reached" in payload["answer"]
