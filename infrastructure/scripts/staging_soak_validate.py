from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from redis.asyncio import from_url as redis_from_url

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth.models import Restaurant
from app.auth.models import User, UserRole
from app.auth.utils import hash_password
from app.database import async_session
from app.hms.models import HotelProperty, Room, RoomType
from app.reservations.models import FloorSection, Table


@dataclass
class ResponseSnapshot:
    status_code: int
    body: dict[str, Any]
    latency_ms: int


async def _json_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    **kwargs: Any,
) -> ResponseSnapshot:
    started = time.perf_counter()
    response = await client.request(method, url, **kwargs)
    latency_ms = max(int((time.perf_counter() - started) * 1000), 0)
    body: dict[str, Any]
    if response.headers.get("content-type", "").startswith("application/json"):
        body = response.json()
    else:
        body = {"raw": response.text}
    return ResponseSnapshot(status_code=response.status_code, body=body, latency_ms=latency_ms)


async def _seed_restaurant_fixture(suffix: str) -> tuple[int, int]:
    async with async_session() as session:
        restaurant = Restaurant(
            name=f"Stage11 Restaurant {suffix}",
            address="Validation Strasse 1",
            city="Berlin",
            state="BE",
            zip_code="10115",
            phone=f"555{suffix[:4]}",
        )
        session.add(restaurant)
        await session.flush()

        section = FloorSection(name=f"Stage11 Section {suffix}", restaurant_id=restaurant.id)
        session.add(section)
        await session.flush()

        table = Table(
            restaurant_id=restaurant.id,
            section_id=section.id,
            table_number=f"S11-{suffix[:4]}",
            capacity=2,
            status="available",
            is_active=True,
        )
        session.add(table)
        await session.commit()
        return restaurant.id, table.id


async def _seed_hotel_fixture(suffix: str) -> tuple[int, int]:
    async with async_session() as session:
        property_record = HotelProperty(
            name=f"Stage11 Hotel {suffix}",
            address="Validation Allee 1",
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

        rooms = [
            Room(
                property_id=property_record.id,
                room_number=f"S11-{suffix[:2].upper()}-{index}",
                room_type_id=room_type.id,
                status="available",
            )
            for index in range(1, 3)
        ]
        session.add_all(rooms)
        await session.commit()
        return property_record.id, room_type.id


async def _seed_admin_user(suffix: str, restaurant_id: int) -> tuple[str, str]:
    email = f"phase11-admin-{suffix}@example.com"
    password = f"Phase11-{suffix}-Password!"
    async with async_session() as session:
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=f"Phase 11 Admin {suffix}",
            role=UserRole.admin,
            is_active=True,
            restaurant_id=restaurant_id,
        )
        session.add(user)
        await session.commit()
    return email, password


def _slot_summary(payload: dict[str, Any], start_time: str) -> dict[str, Any] | None:
    for slot in payload.get("slots", []):
        if slot.get("start_time") == start_time:
            return slot
    return None


def _room_type_summary(payload: dict[str, Any], room_type_id: int) -> dict[str, Any] | None:
    for room_type in payload.get("room_types", []):
        if room_type.get("room_type_id") == room_type_id:
            return room_type
    return None


async def _wait_for_restaurant_change(
    client: httpx.AsyncClient,
    base_url: str,
    *,
    restaurant_id: int,
    reservation_date: str,
    start_time: str,
    expected_table_options: int,
    attempts: int = 10,
) -> ResponseSnapshot:
    last_response: ResponseSnapshot | None = None
    for _ in range(attempts):
        last_response = await _json_request(
            client,
            "GET",
            f"{base_url}/api/availability",
            params={
                "restaurant_id": restaurant_id,
                "date": reservation_date,
                "party_size": 2,
            },
        )
        slot = _slot_summary(last_response.body, start_time)
        if slot and int(slot.get("table_options") or 0) == expected_table_options:
            return last_response
        await asyncio.sleep(0.1)
    assert last_response is not None
    return last_response


async def _wait_for_hotel_change(
    client: httpx.AsyncClient,
    base_url: str,
    *,
    property_id: int,
    room_type_id: int,
    check_in: str,
    check_out: str,
    expected_available_rooms: int,
    attempts: int = 10,
) -> ResponseSnapshot:
    last_response: ResponseSnapshot | None = None
    for _ in range(attempts):
        last_response = await _json_request(
            client,
            "GET",
            f"{base_url}/api/availability",
            params={
                "property_id": property_id,
                "check_in": check_in,
                "check_out": check_out,
                "adults": 2,
                "children": 0,
            },
        )
        room_type = _room_type_summary(last_response.body, room_type_id)
        if room_type and int(room_type.get("available_rooms") or 0) == expected_available_rooms:
            return last_response
        await asyncio.sleep(0.1)
    assert last_response is not None
    return last_response


def _startup_guard_blocked(backend_python: str, redis_url: str) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "staging",
            "SECRET_KEY": "phase11-startup-secret",
            "REDIS_URL": redis_url,
            "CELERY_BROKER_URL": redis_url.replace("/0", "/1"),
            "CELERY_RESULT_BACKEND": redis_url.replace("/0", "/2"),
            "STARTUP_VALIDATION_ENFORCED": "true",
            "STARTUP_VALIDATION_REQUIRE_REDIS": "true",
            "STARTUP_VALIDATION_REQUIRE_MIGRATIONS": "true",
        }
    )
    code = (
        "import asyncio\n"
        "from app.main import app\n"
        "async def main():\n"
        "    async with app.router.lifespan_context(app):\n"
        "        pass\n"
        "asyncio.run(main())\n"
    )
    completed = subprocess.run(
        [backend_python, "-c", code],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
    )
    return {
        "blocked": completed.returncode != 0,
        "returncode": completed.returncode,
        "stderr": completed.stderr.strip()[-400:],
    }


def _run_mcp_tool(
    backend_python: str,
    redis_url: str,
    tool_name: str,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "staging",
            "SECRET_KEY": "phase11-secret-key",
            "REDIS_URL": redis_url,
            "CELERY_BROKER_URL": redis_url.replace("/0", "/1"),
            "CELERY_RESULT_BACKEND": redis_url.replace("/0", "/2"),
            "STARTUP_VALIDATION_ENFORCED": "true",
            "STARTUP_VALIDATION_REQUIRE_REDIS": "true",
            "STARTUP_VALIDATION_REQUIRE_MIGRATIONS": "true",
        }
    )
    code = (
        "import asyncio, json, sys\n"
        "import app.main  # ensure all ORM models are registered like the real app\n"
        "from app.integrations.mcp_server import handle_call_tool\n"
        f"tool_name = {tool_name!r}\n"
        f"arguments = {arguments!r}\n"
        "async def main():\n"
        "    result = await handle_call_tool(tool_name, arguments)\n"
        "    print(result[0].text)\n"
        "asyncio.run(main())\n"
    )
    completed = subprocess.run(
        [backend_python, "-c", code],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    payload = completed.stdout.strip().splitlines()[-1] if completed.stdout.strip() else "{}"
    try:
        body = json.loads(payload)
    except json.JSONDecodeError:
        body = {"raw": payload, "stderr": completed.stderr.strip()}
    body["_returncode"] = completed.returncode
    return body


async def main() -> None:
    parser = argparse.ArgumentParser(description="Phase 11 staging soak validator")
    parser.add_argument("--instance-a", default="http://127.0.0.1:8101")
    parser.add_argument("--instance-b", default="http://127.0.0.1:8102")
    parser.add_argument("--redis-url", default="redis://127.0.0.1:6381/0")
    parser.add_argument(
        "--backend-python",
        default=str(BACKEND_DIR / ".venv" / "bin" / "python"),
    )
    args = parser.parse_args()

    suffix = uuid4().hex[:8]
    restaurant_id, table_id = await _seed_restaurant_fixture(suffix)
    property_id, room_type_id = await _seed_hotel_fixture(suffix)
    admin_email, admin_password = await _seed_admin_user(suffix, restaurant_id)
    reservation_date = (date.today() + timedelta(days=14)).isoformat()
    mcp_reservation_date = (date.today() + timedelta(days=16)).isoformat()
    hotel_check_in = (date.today() + timedelta(days=21)).isoformat()
    hotel_check_out = (date.today() + timedelta(days=23)).isoformat()
    redis = redis_from_url(args.redis_url, encoding="utf-8", decode_responses=True)

    async with httpx.AsyncClient(timeout=30.0) as client:
        health_a = await _json_request(client, "GET", f"{args.instance_a}/api/health")
        health_b = await _json_request(client, "GET", f"{args.instance_b}/api/health")
        login = await _json_request(
            client,
            "POST",
            f"{args.instance_a}/api/auth/login",
            json={"email": admin_email, "password": admin_password},
        )
        auth_headers = {"Authorization": f"Bearer {login.body['access_token']}"}

        idempotency_payload = {
            "kind": "restaurant",
            "restaurant_id": restaurant_id,
            "guest_name": f"Stage11 Idempotent {suffix}",
            "guest_phone": "555-1100",
            "party_size": 2,
            "reservation_date": reservation_date,
            "start_time": "18:00:00",
            "duration_min": 60,
            "table_id": table_id,
        }
        idem_key = f"stage11-idem-{suffix}"
        idem_first = await _json_request(
            client,
            "POST",
            f"{args.instance_a}/api/reservations",
            json=idempotency_payload,
            headers={"Idempotency-Key": idem_key},
        )
        idem_second = await _json_request(
            client,
            "POST",
            f"{args.instance_b}/api/reservations",
            json=idempotency_payload,
            headers={"Idempotency-Key": idem_key},
        )
        idem_conflict = await _json_request(
            client,
            "POST",
            f"{args.instance_b}/api/reservations",
            json={**idempotency_payload, "guest_name": f"Mismatch {suffix}"},
            headers={"Idempotency-Key": idem_key},
        )

        restaurant_before = await _json_request(
            client,
            "GET",
            f"{args.instance_b}/api/availability",
            params={
                "restaurant_id": restaurant_id,
                "date": reservation_date,
                "party_size": 2,
            },
        )
        restaurant_booking = await _json_request(
            client,
            "POST",
            f"{args.instance_a}/api/reservations",
            json={
                "kind": "restaurant",
                "restaurant_id": restaurant_id,
                "guest_name": f"Stage11 Cache {suffix}",
                "guest_phone": "555-1200",
                "party_size": 2,
                "reservation_date": reservation_date,
                "start_time": "19:00:00",
                "duration_min": 60,
                "table_id": table_id,
            },
        )
        restaurant_after = await _wait_for_restaurant_change(
            client,
            args.instance_b,
            restaurant_id=restaurant_id,
            reservation_date=reservation_date,
            start_time="19:00",
            expected_table_options=0,
        )

        hotel_before = await _json_request(
            client,
            "GET",
            f"{args.instance_a}/api/availability",
            params={
                "property_id": property_id,
                "check_in": hotel_check_in,
                "check_out": hotel_check_out,
                "adults": 2,
                "children": 0,
            },
        )
        hotel_booking = await _json_request(
            client,
            "POST",
            f"{args.instance_b}/api/reservations",
            json={
                "kind": "hotel",
                "property_id": property_id,
                "room_type_id": room_type_id,
                "guest_name": f"Stage11 Hotel {suffix}",
                "guest_phone": "555-1300",
                "check_in": hotel_check_in,
                "check_out": hotel_check_out,
            },
        )
        hotel_after = await _wait_for_hotel_change(
            client,
            args.instance_a,
            property_id=property_id,
            room_type_id=room_type_id,
            check_in=hotel_check_in,
            check_out=hotel_check_out,
            expected_available_rooms=1,
        )

        await redis.execute_command("CLIENT", "PAUSE", 800, "ALL")
        degraded_read = await _json_request(
            client,
            "GET",
            f"{args.instance_a}/api/availability",
            params={
                "restaurant_id": restaurant_id,
                "date": reservation_date,
                "party_size": 2,
            },
        )
        degraded_write = await _json_request(
            client,
            "POST",
            f"{args.instance_b}/api/reservations",
            json={
                "kind": "restaurant",
                "restaurant_id": restaurant_id,
                "guest_name": f"Stage11 Degraded {suffix}",
                "guest_phone": "555-1400",
                "party_size": 2,
                "reservation_date": reservation_date,
                "start_time": "20:30:00",
                "duration_min": 60,
            },
        )

        metrics_a = await _json_request(
            client,
            "GET",
            f"{args.instance_a}/api/metrics",
            headers=auth_headers,
            params={"window_minutes": 5},
        )
        metrics_b = await _json_request(
            client,
            "GET",
            f"{args.instance_b}/api/metrics",
            headers=auth_headers,
            params={"window_minutes": 5},
        )
        consistency_a = await _json_request(
            client,
            "GET",
            f"{args.instance_a}/internal/reservations/system-consistency-check",
            headers=auth_headers,
            params={"window_hours": 1},
        )
        consistency_b = await _json_request(
            client,
            "GET",
            f"{args.instance_b}/internal/reservations/system-consistency-check",
            headers=auth_headers,
            params={"window_hours": 1},
        )

    await redis.aclose()

    startup_guard = _startup_guard_blocked(args.backend_python, "redis://127.0.0.1:6399/0")
    mcp_arguments = {
        "restaurant_id": restaurant_id,
        "guest_name": f"MCP Stage11 {suffix}",
        "guest_phone": "555-1500",
        "party_size": 2,
        "reservation_date": mcp_reservation_date,
        "start_time": "19:00:00",
        "table_id": table_id,
        "idempotency_key": f"stage11-mcp-{suffix}",
        "intent_source": f"stage11-soak-{suffix}",
    }
    mcp_first = _run_mcp_tool(
        args.backend_python,
        args.redis_url,
        "create_gastronomy_reservation",
        mcp_arguments,
    )
    mcp_second = _run_mcp_tool(
        args.backend_python,
        args.redis_url,
        "create_gastronomy_reservation",
        mcp_arguments,
    )
    mcp_mismatch = _run_mcp_tool(
        args.backend_python,
        args.redis_url,
        "create_gastronomy_reservation",
        {**mcp_arguments, "guest_name": f"MCP Mismatch {suffix}"},
    )

    result = {
        "instances": {
            "a": {"base_url": args.instance_a, "health": health_a.body, "status_code": health_a.status_code},
            "b": {"base_url": args.instance_b, "health": health_b.body, "status_code": health_b.status_code},
        },
        "admin_auth": {
            "login_status": login.status_code,
            "token_type": login.body.get("token_type"),
        },
        "startup_guard": startup_guard,
        "idempotency": {
            "same_payload": {
                "instance_a_status": idem_first.status_code,
                "instance_b_status": idem_second.status_code,
                "same_response": idem_first.body == idem_second.body,
                "reservation_id": idem_first.body.get("id"),
            },
            "payload_mismatch": {
                "status_code": idem_conflict.status_code,
                "detail": idem_conflict.body.get("detail"),
            },
            "mcp_same_payload": {
                "first_ok": mcp_first.get("ok"),
                "second_ok": mcp_second.get("ok"),
                "same_response": mcp_first == mcp_second,
                "reservation": mcp_first.get("reservation"),
            },
            "mcp_payload_mismatch": {
                "ok": mcp_mismatch.get("ok"),
                "status_code": mcp_mismatch.get("status_code"),
                "error": mcp_mismatch.get("error"),
            },
        },
        "cache_invalidation": {
            "restaurant": {
                "before": _slot_summary(restaurant_before.body, "19:00"),
                "booking_status": restaurant_booking.status_code,
                "after": _slot_summary(restaurant_after.body, "19:00"),
            },
            "hotel": {
                "before": _room_type_summary(hotel_before.body, room_type_id),
                "booking_status": hotel_booking.status_code,
                "after": _room_type_summary(hotel_after.body, room_type_id),
            },
        },
        "redis_degradation": {
            "availability_read": {
                "status_code": degraded_read.status_code,
                "latency_ms": degraded_read.latency_ms,
            },
            "reservation_write": {
                "status_code": degraded_write.status_code,
                "latency_ms": degraded_write.latency_ms,
                "detail": degraded_write.body.get("detail"),
            },
        },
        "metrics": {
            "instance_a": {
                "latency_ms": metrics_a.latency_ms,
                "business_events": metrics_a.body.get("business_events", {}),
            },
            "instance_b": {
                "latency_ms": metrics_b.latency_ms,
                "business_events": metrics_b.body.get("business_events", {}),
            },
        },
        "consistency": {
            "instance_a": consistency_a.body,
            "instance_b": consistency_b.body,
        },
    }
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(main())
