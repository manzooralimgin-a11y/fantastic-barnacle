from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time as time_module
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth.models import Restaurant
from app.database import async_session
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType
from app.integrations.mcp_server import handle_call_tool
from app.main import app
from app.observability.metrics import api_metrics
from app.reservations.models import FloorSection, Reservation, Table
from app.reservations.read_availability import AvailabilityReadService

for noisy_logger in (
    "app.requests",
    "app.reservations.read_availability",
    "app.reservations.availability",
    "app.reservations.cache",
    "app.reservations.unified",
    "app.reservations.idempotency",
    "app.security.rate_limit",
    "app.integrations.mcp_server",
    "app.audit",
    "app.errors",
    "httpx",
):
    logging.getLogger(noisy_logger).setLevel(logging.WARNING)


@dataclass
class RequestResult:
    status_code: int
    latency_ms: int
    detail: str | None = None


def _summarize_results(results: list[RequestResult]) -> dict[str, object]:
    latencies = sorted(result.latency_ms for result in results)
    status_counts: dict[str, int] = {}
    for result in results:
        status_counts[str(result.status_code)] = status_counts.get(str(result.status_code), 0) + 1

    def _percentile(pct: float) -> float:
        if not latencies:
            return 0.0
        index = max(0, min(len(latencies) - 1, int(len(latencies) * pct) - 1))
        return round(float(latencies[index]), 2)

    return {
        "requests": len(results),
        "status_counts": status_counts,
        "latency_ms": {
            "avg": round(sum(latencies) / max(len(latencies), 1), 2) if latencies else 0.0,
            "p50": _percentile(0.50),
            "p95": _percentile(0.95),
            "p99": _percentile(0.99),
            "max": round(float(latencies[-1]), 2) if latencies else 0.0,
        },
    }


async def _timed_request(client: AsyncClient, method: str, url: str, **kwargs) -> RequestResult:
    started = time_module.perf_counter()
    response = await client.request(method, url, **kwargs)
    latency_ms = max(int((time_module.perf_counter() - started) * 1000), 0)
    detail = None
    if response.headers.get("content-type", "").startswith("application/json"):
        detail = response.json().get("detail")
    return RequestResult(status_code=response.status_code, latency_ms=latency_ms, detail=detail)


async def _timed_mcp_call(tool_name: str, arguments: dict[str, object]) -> RequestResult:
    started = time_module.perf_counter()
    response_parts = await handle_call_tool(tool_name, arguments)
    latency_ms = max(int((time_module.perf_counter() - started) * 1000), 0)
    detail = None
    status_code = 200
    if response_parts:
        try:
            body = json.loads(response_parts[0].text)
        except Exception:  # pragma: no cover - defensive parsing
            body = None
        if isinstance(body, dict):
            detail = body.get("detail") or body.get("error")
            if body.get("ok") is False:
                status_code = int(body.get("status_code") or 500)
            elif tool_name in {"create_gastronomy_reservation", "book_room"}:
                status_code = 201
    return RequestResult(status_code=status_code, latency_ms=latency_ms, detail=detail)


def _load_headers(index: int) -> dict[str, str]:
    return {"x-forwarded-for": f"10.0.{index // 250}.{(index % 250) + 1}"}


async def _seed_restaurant_setup(suffix: str) -> tuple[int, list[int]]:
    async with async_session() as session:
        restaurant = Restaurant(
            name=f"Load Test Restaurant {suffix}",
            address="Load Street 1",
            city="Berlin",
            state="BE",
            zip_code="10115",
            phone=f"555{suffix[:4]}",
        )
        session.add(restaurant)
        await session.flush()

        section = FloorSection(name=f"Load Section {suffix}", restaurant_id=restaurant.id)
        session.add(section)
        await session.flush()

        tables: list[Table] = []
        for index, capacity in enumerate([2, 4, 4, 6, 6], start=1):
            tables.append(
                Table(
                    restaurant_id=restaurant.id,
                    section_id=section.id,
                    table_number=f"L-{suffix[:4]}-{index}",
                    capacity=capacity,
                    status="available",
                    is_active=True,
                )
            )
        session.add_all(tables)
        await session.commit()
        return restaurant.id, [table.id for table in tables]


async def _seed_hotel_setup(suffix: str) -> tuple[int, int, list[str]]:
    async with async_session() as session:
        property_record = HotelProperty(
            name=f"Load Hotel {suffix}",
            address="Load Hotel Street 1",
            city="Hamburg",
            country="DE",
        )
        session.add(property_record)
        await session.flush()

        room_type = RoomType(
            property_id=property_record.id,
            name=f"Komfort {suffix}",
            base_occupancy=2,
            max_occupancy=4,
            base_price=149.0,
        )
        session.add(room_type)
        await session.flush()

        rooms: list[Room] = []
        for index in range(1, 6):
            rooms.append(
                Room(
                    property_id=property_record.id,
                    room_number=f"{suffix[:2].upper()}{500 + index}",
                    room_type_id=room_type.id,
                    status="available",
                )
            )
        session.add_all(rooms)
        await session.commit()
        return property_record.id, room_type.id, [room.room_number for room in rooms]


async def _scenario_high_read(client: AsyncClient, restaurant_id: int) -> dict[str, object]:
    await AvailabilityReadService.clear_cache()
    await api_metrics.reset()
    reservation_date = date.today() + timedelta(days=14)

    await _timed_request(
        client,
        "GET",
        "/api/availability",
        params={
            "restaurant_id": restaurant_id,
            "date": reservation_date.isoformat(),
            "party_size": 2,
        },
        headers=_load_headers(999),
    )

    async def _call(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "GET",
            "/api/availability",
            params={
                "restaurant_id": restaurant_id,
                "date": reservation_date.isoformat(),
                "party_size": 2,
            },
            headers=_load_headers(index),
        )

    results = await asyncio.gather(*(_call(index) for index in range(200)))
    metrics = await api_metrics.business_snapshot()
    return {
        **_summarize_results(results),
        "cache": {
            "hits": metrics.get("availability.cache.hit", 0),
            "misses": metrics.get("availability.cache.miss", 0),
        },
    }


async def _scenario_mixed_load(
    client: AsyncClient,
    *,
    restaurant_id: int,
    table_ids: list[int],
    property_id: int,
    room_type_id: int,
) -> dict[str, object]:
    await AvailabilityReadService.clear_cache()
    await api_metrics.reset()
    suffix = uuid4().hex[:6]
    reservation_date = date.today() + timedelta(days=21)
    check_in = date.today() + timedelta(days=30)

    await _timed_request(
        client,
        "GET",
        "/api/availability",
        params={
            "restaurant_id": restaurant_id,
            "date": reservation_date.isoformat(),
            "party_size": 2,
        },
        headers=_load_headers(700),
    )
    await _timed_request(
        client,
        "GET",
        "/api/availability",
        params={
            "property_id": property_id,
            "check_in": check_in.isoformat(),
            "check_out": (check_in + timedelta(days=2)).isoformat(),
            "adults": 2,
            "children": 0,
        },
        headers=_load_headers(701),
    )

    async def _restaurant_read(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "GET",
            "/api/availability",
            params={
                "restaurant_id": restaurant_id,
                "date": reservation_date.isoformat(),
                "party_size": 2,
            },
            headers=_load_headers(index),
        )

    async def _hotel_read(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "GET",
            "/api/availability",
            params={
                "property_id": property_id,
                "check_in": check_in.isoformat(),
                "check_out": (check_in + timedelta(days=2)).isoformat(),
                "adults": 2,
                "children": 0,
            },
            headers=_load_headers(index + 500),
        )

    async def _restaurant_write(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "POST",
            "/api/reservations",
            json={
                "kind": "restaurant",
                "restaurant_id": restaurant_id,
                "guest_name": f"Mixed Restaurant Guest {suffix}-{index}",
                "guest_phone": "555-1000",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "start_time": f"{18 + (index % 3):02d}:00:00",
                "duration_min": 60,
                "table_id": table_ids[index % len(table_ids)],
            },
            headers=_load_headers(index + 1000),
        )

    async def _hotel_write(index: int) -> RequestResult:
        offset = index % 5
        return await _timed_request(
            client,
            "POST",
            "/api/reservations",
            json={
                "kind": "hotel",
                "property_id": property_id,
                "room_type_id": room_type_id,
                "guest_name": f"Mixed Hotel Guest {suffix}-{index}",
                "guest_phone": "555-2000",
                "check_in": (check_in + timedelta(days=offset * 3)).isoformat(),
                "check_out": (check_in + timedelta(days=offset * 3 + 2)).isoformat(),
            },
            headers=_load_headers(index + 1200),
        )

    tasks = [*(_restaurant_read(index) for index in range(120))]
    tasks.extend(_hotel_read(index) for index in range(40))
    tasks.extend(_restaurant_write(index) for index in range(15))
    tasks.extend(_hotel_write(index) for index in range(10))
    results = await asyncio.gather(*tasks)

    metrics = await api_metrics.business_snapshot()
    return {
        **_summarize_results(results),
        "cache": {
            "hits": metrics.get("availability.cache.hit", 0),
            "misses": metrics.get("availability.cache.miss", 0),
            "invalidations": metrics.get("availability.cache.invalidation.total", 0),
        },
        "booking_results": {
            "success": sum(1 for result in results if result.status_code == 201),
            "conflicts": sum(1 for result in results if result.status_code == 409),
        },
    }


async def _scenario_high_contention(
    client: AsyncClient,
    *,
    restaurant_id: int,
    table_id: int,
    property_id: int,
    room_type_id: int,
) -> dict[str, object]:
    await AvailabilityReadService.clear_cache()
    await api_metrics.reset()
    suffix = uuid4().hex[:6]
    reservation_date = date.today() + timedelta(days=40)

    async def _restaurant_attempt(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "POST",
            "/api/reservations",
            json={
                "kind": "restaurant",
                "restaurant_id": restaurant_id,
                "guest_name": f"Contention Restaurant {suffix}-{index}",
                "guest_phone": "555-3000",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "start_time": "19:00:00",
                "duration_min": 90,
                "table_id": table_id,
            },
            headers=_load_headers(index + 1500),
        )

    async def _hotel_attempt(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "POST",
            "/api/reservations",
            json={
                "kind": "hotel",
                "property_id": property_id,
                "room_type_id": room_type_id,
                "guest_name": f"Contention Hotel {suffix}-{index}",
                "guest_phone": "555-4000",
                "check_in": "2027-01-20",
                "check_out": "2027-01-22",
            },
            headers=_load_headers(index + 1700),
        )

    restaurant_results = await asyncio.gather(*(_restaurant_attempt(i) for i in range(40)))
    hotel_results = await asyncio.gather(*(_hotel_attempt(i) for i in range(40)))

    async with async_session() as session:
        restaurant_rows = (
            await session.execute(
                select(Reservation).where(
                    Reservation.guest_name.like(f"Contention Restaurant {suffix}-%")
                )
            )
        ).scalars().all()
        hotel_rows = (
            await session.execute(
                select(HotelReservation).where(
                    HotelReservation.guest_name.like(f"Contention Hotel {suffix}-%")
                )
            )
        ).scalars().all()

    return {
        "restaurant": {
            **_summarize_results(restaurant_results),
            "persisted_rows": len(restaurant_rows),
        },
        "hotel": {
            **_summarize_results(hotel_results),
            "persisted_rows": len(hotel_rows),
        },
    }


async def _scenario_rest_mcp_mixed(
    client: AsyncClient,
    *,
    restaurant_id: int,
    table_ids: list[int],
    property_id: int,
    room_type_id: int,
) -> dict[str, object]:
    await AvailabilityReadService.clear_cache()
    await api_metrics.reset()
    suffix = uuid4().hex[:6]
    reservation_date = date.today() + timedelta(days=28)
    check_in = date.today() + timedelta(days=45)

    async def _rest_read(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "GET",
            "/api/availability",
            params={
                "restaurant_id": restaurant_id,
                "date": reservation_date.isoformat(),
                "party_size": 2,
            },
            headers=_load_headers(index + 2000),
        )

    async def _rest_write(index: int) -> RequestResult:
        return await _timed_request(
            client,
            "POST",
            "/api/reservations",
            json={
                "kind": "restaurant",
                "restaurant_id": restaurant_id,
                "guest_name": f"REST MCP Restaurant {suffix}-{index}",
                "guest_phone": "555-5000",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "start_time": f"{18 + (index % 4):02d}:00:00",
                "duration_min": 60,
                "table_id": table_ids[index % len(table_ids)],
            },
            headers=_load_headers(index + 2200),
        )

    async def _mcp_restaurant_availability(index: int) -> RequestResult:
        return await _timed_mcp_call(
            "get_restaurant_availability",
            {
                "restaurant_id": restaurant_id,
                "date": reservation_date.isoformat(),
                "party_size": 2,
            },
        )

    async def _mcp_hotel_availability(index: int) -> RequestResult:
        offset = index % 3
        return await _timed_mcp_call(
            "get_hotel_availability",
            {
                "property_id": property_id,
                "check_in": (check_in + timedelta(days=offset * 3)).isoformat(),
                "check_out": (check_in + timedelta(days=offset * 3 + 2)).isoformat(),
                "adults": 2,
                "children": 0,
            },
        )

    async def _mcp_restaurant_write(index: int) -> RequestResult:
        return await _timed_mcp_call(
            "create_gastronomy_reservation",
            {
                "restaurant_id": restaurant_id,
                "guest_name": f"MCP Restaurant {suffix}-{index}",
                "guest_phone": "555-6000",
                "party_size": 2,
                "reservation_date": reservation_date.isoformat(),
                "start_time": f"{20 + (index % 2):02d}:00:00",
                "table_id": table_ids[(index + 1) % len(table_ids)],
                "idempotency_key": f"mcp-rest-{suffix}-r-{index}",
            },
        )

    async def _mcp_hotel_write(index: int) -> RequestResult:
        offset = index % 5
        return await _timed_mcp_call(
            "book_room",
            {
                "property_id": property_id,
                "room_type_id": room_type_id,
                "guest_name": f"MCP Hotel {suffix}-{index}",
                "guest_phone": "555-7000",
                "check_in": (check_in + timedelta(days=offset * 3)).isoformat(),
                "check_out": (check_in + timedelta(days=offset * 3 + 2)).isoformat(),
                "idempotency_key": f"mcp-rest-{suffix}-h-{index}",
            },
        )

    tasks = [*(_rest_read(index) for index in range(40))]
    tasks.extend(_mcp_restaurant_availability(index) for index in range(12))
    tasks.extend(_mcp_hotel_availability(index) for index in range(12))
    tasks.extend(_rest_write(index) for index in range(6))
    tasks.extend(_mcp_restaurant_write(index) for index in range(4))
    tasks.extend(_mcp_hotel_write(index) for index in range(4))
    results = await asyncio.gather(*tasks)
    metrics = await api_metrics.business_snapshot()
    return {
        **_summarize_results(results),
        "booking_results": {
            "success": sum(1 for result in results if result.status_code == 201),
            "conflicts": sum(1 for result in results if result.status_code == 409),
        },
        "cache": {
            "hits": metrics.get("availability.cache.hit", 0),
            "misses": metrics.get("availability.cache.miss", 0),
            "invalidations": metrics.get("availability.cache.invalidation.total", 0),
        },
        "sources": {
            "availability_query_total": metrics.get("availability.query.total", 0),
            "availability_query_mcp": metrics.get("availability.query.total.source.mcp", 0),
            "reservation_create_canonical": metrics.get("reservation.create.source.canonical", 0),
            "reservation_create_mcp": metrics.get("reservation.create.source.mcp", 0),
        },
    }


async def _build_client(base_url: str | None) -> AsyncClient:
    if base_url:
        return AsyncClient(base_url=base_url, timeout=10.0)
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://testserver", timeout=10.0)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Reservation/availability load test runner")
    parser.add_argument("--base-url", default=None, help="Optional deployed API base URL")
    args = parser.parse_args()

    suffix = uuid4().hex[:8]
    restaurant_id, table_ids = await _seed_restaurant_setup(suffix)
    property_id, room_type_id, _room_numbers = await _seed_hotel_setup(suffix)

    async with await _build_client(args.base_url) as client:
        summary = {
            "mode": "asgi" if args.base_url is None else "http",
            "read_load": await _scenario_high_read(client, restaurant_id),
            "mixed_load": await _scenario_mixed_load(
                client,
                restaurant_id=restaurant_id,
                table_ids=table_ids,
                property_id=property_id,
                room_type_id=room_type_id,
            ),
            "rest_mcp_mixed_load": await _scenario_rest_mcp_mixed(
                client,
                restaurant_id=restaurant_id,
                table_ids=table_ids,
                property_id=property_id,
                room_type_id=room_type_id,
            ),
            "high_contention": await _scenario_high_contention(
                client,
                restaurant_id=restaurant_id,
                table_id=table_ids[0],
                property_id=property_id,
                room_type_id=room_type_id,
            ),
        }

    print(json.dumps(summary, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
