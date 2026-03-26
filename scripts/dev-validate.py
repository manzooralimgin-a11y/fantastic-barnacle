#!/usr/bin/env python3
import argparse
import asyncio
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from mcp import ClientSession  # noqa: E402
from mcp.client.sse import sse_client  # noqa: E402


def http_get_text(url: str, headers: dict[str, str] | None = None, timeout: float = 15) -> str:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode()


def http_get_json(url: str, headers: dict[str, str] | None = None, timeout: float = 15):
    return json.loads(http_get_text(url, headers=headers, timeout=timeout))


def http_get_stream_prefix(url: str, timeout: float = 5, bytes_to_read: int = 512) -> str:
    completed = subprocess.run(
        [
            "curl",
            "-sS",
            "-N",
            "--max-time",
            str(int(timeout)),
            url,
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    output = completed.stdout or completed.stderr
    return output[:bytes_to_read]


def http_post_json(
    url: str,
    payload: dict,
    headers: dict[str, str] | None = None,
    timeout: float = 15,
):
    request_headers = {"Content-Type": "application/json", **(headers or {})}
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers=request_headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() if exc.fp is not None else "{}"
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"detail": body}
        return exc.code, parsed


def wait_for_url(url: str, timeout_seconds: int = 120) -> tuple[bool, str]:
    deadline = time.time() + timeout_seconds
    last_error = ""
    while time.time() < deadline:
        try:
            body = http_get_text(url, timeout=5)
            return True, body
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
            time.sleep(1)
    return False, last_error


def choose_restaurant_slot(base_url: str, restaurant_id: int) -> dict:
    for offset in range(120, 150):
        booking_date = (date.today() + timedelta(days=offset)).isoformat()
        payload = http_get_json(
            f"{base_url}/api/availability?restaurant_id={restaurant_id}&date={booking_date}&party_size=2"
        )
        for slot in payload["slots"]:
            if slot["available"]:
                return {
                    "date": booking_date,
                    "slot": slot,
                    "payload": payload,
                }
    raise RuntimeError("Could not find an available restaurant slot for validation")


def choose_hotel_room_type(base_url: str, property_id: int) -> dict:
    for offset in range(180, 220):
        check_in = date.today() + timedelta(days=offset)
        check_out = check_in + timedelta(days=2)
        payload = http_get_json(
            f"{base_url}/api/availability?property_id={property_id}&check_in={check_in.isoformat()}&check_out={check_out.isoformat()}"
        )
        for room_type in payload["room_types"]:
            if room_type["available_rooms"] > 0 and room_type["name"].lower() != "tagung":
                return {
                    "check_in": check_in.isoformat(),
                    "check_out": check_out.isoformat(),
                    "room_type": room_type,
                    "payload": payload,
                }
    raise RuntimeError("Could not find an available hotel room type for validation")


def backend_login(base_url: str, email: str, password: str) -> str:
    status, payload = http_post_json(
        f"{base_url}/api/auth/login",
        {"email": email, "password": password},
    )
    if status != 200:
        raise RuntimeError(f"Backend login failed: {status} {payload}")
    return payload["access_token"]


def run_ui_check(runtime: dict, restaurant_selection: dict, hotel_selection: dict) -> dict:
    ts = str(int(time.time()))
    restaurant_name = f"Local Landing Restaurant {ts}"
    hotel_name = f"Local Landing Hotel {ts}"
    tagung_name = f"Local Landing Tagung {ts}"
    command = [
        "node",
        str(ROOT / "scripts" / "dev-ui-check.mjs"),
        "--hotel-url",
        runtime["hotel_url"],
        "--restaurant-url",
        runtime["restaurant_url"],
        "--frontend-url",
        runtime["frontend_url"],
        "--restaurant-name",
        restaurant_name,
        "--hotel-name",
        hotel_name,
        "--tagung-name",
        tagung_name,
        "--restaurant-date",
        restaurant_selection["date"],
        "--restaurant-time",
        restaurant_selection["slot"]["start_time"],
        "--hotel-check-in",
        hotel_selection["check_in"],
        "--hotel-check-out",
        hotel_selection["check_out"],
        "--hotel-room-type",
        hotel_selection["room_type"]["name"],
        "--hotel-room-type-id",
        str(hotel_selection["room_type"]["room_type_id"]),
        "--admin-email",
        runtime["admin_email"],
        "--admin-password",
        runtime["admin_password"],
        "--expected-restaurant-api",
        "http://localhost:8000/api",
    ]
    try:
        completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(
            "UI validation failed.\n"
            f"stdout:\n{exc.stdout or '<empty>'}\n"
            f"stderr:\n{exc.stderr or '<empty>'}"
        ) from exc
    payload = json.loads(completed.stdout.strip())
    payload["names"] = {
        "restaurant": restaurant_name,
        "hotel": hotel_name,
        "tagung": tagung_name,
    }
    return payload


def read_backend_log(log_path: Path) -> str:
    if not log_path.exists():
        return ""
    return log_path.read_text(encoding="utf-8", errors="ignore")


async def run_mcp_validation(runtime: dict, restaurant_id: int, property_id: int, room_type_name: str) -> dict:
    endpoint_text = http_get_stream_prefix(runtime["mcp_url"], timeout=5)
    if "/mcp/voicebooker/messages" not in endpoint_text:
        raise RuntimeError("MCP SSE endpoint did not advertise /mcp/voicebooker/messages")
    if "/mcp/voicebooker/mcp/voicebooker/messages" in endpoint_text:
        raise RuntimeError("MCP SSE endpoint advertised a duplicated transport path")

    async with sse_client(runtime["mcp_url"], timeout=10, sse_read_timeout=30) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            listed = await session.list_tools()
            tool_names = {tool.name for tool in listed.tools}
            expected = {
                "create_gastronomy_reservation",
                "book_room",
            }
            if not expected.issubset(tool_names):
                raise RuntimeError(f"MCP tools missing: expected {expected}, got {tool_names}")

            shared_key = f"mcp-local-{int(time.time())}"
            reservation_date = (date.today() + timedelta(days=160)).isoformat()
            create_args = {
                "restaurant_id": restaurant_id,
                "guest_name": f"MCP Restaurant {shared_key}",
                "guest_phone": "+49 40 555 1500",
                "party_size": 2,
                "reservation_date": reservation_date,
                "start_time": "19:00:00",
                "idempotency_key": shared_key,
            }
            first = await session.call_tool("create_gastronomy_reservation", create_args)
            second = await session.call_tool("create_gastronomy_reservation", create_args)
            conflict = await session.call_tool(
                "create_gastronomy_reservation",
                {
                    **create_args,
                    "guest_name": f"MCP Restaurant Conflict {shared_key}",
                },
            )
            hotel_args = {
                "property_id": property_id,
                "room_type_label": room_type_name,
                "guest_name": f"MCP Hotel {shared_key}",
                "guest_phone": "+49 40 555 1600",
                "check_in": (date.today() + timedelta(days=210)).isoformat(),
                "check_out": (date.today() + timedelta(days=212)).isoformat(),
                "idempotency_key": f"{shared_key}-hotel",
            }
            hotel = await session.call_tool("book_room", hotel_args)

    def parse(result):
        text = "".join(getattr(item, "text", "") for item in result.content)
        return json.loads(text)

    first_payload = parse(first)
    second_payload = parse(second)
    conflict_payload = parse(conflict)
    hotel_payload = parse(hotel)

    return {
        "first": first_payload,
        "second": second_payload,
        "conflict": conflict_payload,
        "hotel": hotel_payload,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", default=str(ROOT / ".dev" / "runtime.json"))
    args = parser.parse_args()

    runtime = json.loads(Path(args.runtime).read_text())
    checks: dict[str, object] = {}

    # Health and reachability
    checks["backend_health"] = http_get_json(f"{runtime['backend_url']}/health")
    checks["backend_api_health"] = http_get_json(f"{runtime['backend_url']}/api/health")
    frontend_ok, frontend_payload = wait_for_url(runtime["frontend_url"])
    hotel_ok, hotel_payload = wait_for_url(runtime["hotel_url"])
    restaurant_ok, restaurant_payload = wait_for_url(runtime["restaurant_url"])
    restaurant_health_ok, _ = wait_for_url(f"{runtime['restaurant_url']}/healthz")
    if not (frontend_ok and hotel_ok and restaurant_ok and restaurant_health_ok):
        raise RuntimeError(
            f"Local stack failed health checks: frontend={frontend_payload}, hotel={hotel_payload}, restaurant={restaurant_payload}"
        )
    checks["frontend_root"] = "PASS"
    checks["hotel_root"] = "PASS"
    checks["restaurant_root"] = "PASS"
    checks["restaurant_healthz"] = "PASS"

    restaurant_selection = choose_restaurant_slot(runtime["backend_url"], runtime["restaurant_id"])
    hotel_selection = choose_hotel_room_type(runtime["backend_url"], runtime["property_id"])

    ui = run_ui_check(runtime, restaurant_selection, hotel_selection)
    checks["ui"] = ui

    restaurant_after = http_get_json(
        f"{runtime['backend_url']}/api/availability?restaurant_id={runtime['restaurant_id']}&date={restaurant_selection['date']}&party_size=2"
    )
    hotel_after = http_get_json(
        f"{runtime['backend_url']}/api/availability?property_id={runtime['property_id']}&check_in={hotel_selection['check_in']}&check_out={hotel_selection['check_out']}"
    )
    restaurant_after_slot = next(
        slot for slot in restaurant_after["slots"] if slot["start_time"] == restaurant_selection["slot"]["start_time"]
    )
    hotel_after_room = next(
        room for room in hotel_after["room_types"] if room["room_type_id"] == hotel_selection["room_type"]["room_type_id"]
    )
    checks["availability_before"] = {
        "restaurant": restaurant_selection["slot"],
        "hotel": hotel_selection["room_type"],
    }
    checks["availability_after"] = {
        "restaurant": restaurant_after_slot,
        "hotel": hotel_after_room,
    }
    if restaurant_after_slot["table_options"] >= restaurant_selection["slot"]["table_options"]:
        raise RuntimeError("Restaurant availability did not decrease after landing booking")
    if hotel_after_room["available_rooms"] >= hotel_selection["room_type"]["available_rooms"]:
        raise RuntimeError("Hotel availability did not decrease after landing booking")

    token = backend_login(runtime["backend_url"], runtime["admin_email"], runtime["admin_password"])
    auth_headers = {"Authorization": f"Bearer {token}"}
    hms_reservations = http_get_text(f"{runtime['backend_url']}/api/hms/reservations", headers=auth_headers)
    restaurant_reservations = http_get_text(f"{runtime['backend_url']}/api/reservations", headers=auth_headers)
    for name in [ui["names"]["hotel"], ui["names"]["restaurant"], ui["names"]["tagung"]]:
        haystack = hms_reservations if "Hotel" in name else restaurant_reservations
        if name not in haystack:
            raise RuntimeError(f"Reservation {name} not visible in authenticated backend view")

    mcp_result = asyncio.run(
        run_mcp_validation(
            runtime,
            restaurant_id=runtime["restaurant_id"],
            property_id=runtime["property_id"],
            room_type_name=hotel_selection["room_type"]["name"],
        )
    )
    checks["mcp"] = mcp_result
    if not mcp_result["first"]["ok"] or not mcp_result["hotel"]["ok"]:
        raise RuntimeError("MCP reservation tool calls did not succeed")
    if mcp_result["first"]["reservation"] != mcp_result["second"]["reservation"]:
        raise RuntimeError("MCP idempotent replay did not return the same reservation")
    if mcp_result["conflict"]["status_code"] != 409:
        raise RuntimeError("MCP idempotency conflict did not return 409")

    log_text = read_backend_log(ROOT / ".dev" / "logs" / "backend.log")
    if "reservation_created" not in log_text:
        raise RuntimeError("backend.log is missing reservation_created")
    if "availability_cache_invalidation_triggered" not in log_text:
        raise RuntimeError("backend.log is missing availability_cache_invalidation_triggered")

    output = {
        "run_command": "./scripts/dev-start.sh --validate",
        "urls": {
            "backend": runtime["backend_url"],
            "hotel": runtime["hotel_url"],
            "frontend": runtime["frontend_url"],
            "restaurant": runtime["restaurant_url"],
            "mcp": runtime["mcp_url"],
        },
        "checks": checks,
    }
    print(json.dumps(output, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
