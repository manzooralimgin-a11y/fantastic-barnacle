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


def choose_restaurant_slot(
    base_url: str,
    restaurant_id: int,
    *,
    party_size: int = 2,
    exclude: set[tuple[str, str]] | None = None,
) -> dict:
    excluded = exclude or set()
    for offset in range(120, 150):
        booking_date = (date.today() + timedelta(days=offset)).isoformat()
        payload = http_get_json(
            f"{base_url}/api/availability?restaurant_id={restaurant_id}&date={booking_date}&party_size={party_size}"
        )
        for slot in payload["slots"]:
            signature = (booking_date, slot["start_time"])
            if slot["available"] and signature not in excluded:
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
    restaurant_app_reservation_name = f"Local Restaurant App Reservation {ts}"
    restaurant_app_order_guest = f"Local Restaurant App Order {ts}"
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
        "--restaurant-app-reservation-name",
        restaurant_app_reservation_name,
        "--restaurant-app-order-guest",
        restaurant_app_order_guest,
        "--restaurant-table-code",
        runtime["restaurant_table_code"],
        "--restaurant-app-reservation-date",
        runtime["restaurant_app_slot"]["date"],
        "--restaurant-app-reservation-time",
        runtime["restaurant_app_slot"]["slot"]["start_time"],
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
        "restaurant_app_reservation": restaurant_app_reservation_name,
        "restaurant_app_order": restaurant_app_order_guest,
    }
    return payload


def read_backend_log(log_path: Path) -> str:
    if not log_path.exists():
        return ""
    return log_path.read_text(encoding="utf-8", errors="ignore")


def ensure_restaurant_table_code(base_url: str, auth_headers: dict[str, str]) -> dict:
    tables = http_get_json(f"{base_url}/api/reservations/tables", headers=auth_headers)
    active_tables = [
        table
        for table in tables
        if table.get("is_active")
        and table.get("status") == "available"
        and (table.get("capacity") or 0) > 0
    ]
    if not active_tables:
        active_tables = [table for table in tables if table.get("is_active")]
    if not active_tables:
        raise RuntimeError("No active restaurant tables available for QR ordering validation")

    table = active_tables[0]
    codes = http_get_json(
        f"{base_url}/api/qr/admin/tables/{table['id']}/qr-codes",
        headers=auth_headers,
    )
    active_code = next((code for code in codes if code.get("is_active")), None)
    if active_code is None:
        status, active_code = http_post_json(
            f"{base_url}/api/qr/admin/tables/{table['id']}/qr-code",
            {},
            headers=auth_headers,
        )
        if status != 200:
            raise RuntimeError(f"Failed to create QR code for table {table['id']}: {status} {active_code}")

    return {
        "table_id": table["id"],
        "table_number": table["table_number"],
        "code": active_code["code"],
    }


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
    restaurant_app_slot = choose_restaurant_slot(
        runtime["backend_url"],
        runtime["restaurant_id"],
        exclude={(restaurant_selection["date"], restaurant_selection["slot"]["start_time"])},
    )
    hotel_selection = choose_hotel_room_type(runtime["backend_url"], runtime["property_id"])

    token = backend_login(runtime["backend_url"], runtime["admin_email"], runtime["admin_password"])
    auth_headers = {"Authorization": f"Bearer {token}"}
    restaurant_table = ensure_restaurant_table_code(runtime["backend_url"], auth_headers)
    runtime["restaurant_table_code"] = restaurant_table["code"]
    runtime["restaurant_table_number"] = restaurant_table["table_number"]
    runtime["restaurant_app_slot"] = restaurant_app_slot

    ui = run_ui_check(runtime, restaurant_selection, hotel_selection)
    checks["ui"] = ui
    if not ui["restaurantApp"]["ok"]:
        raise RuntimeError("Restaurant guest app did not use the expected local backend API")
    if not ui["restaurantApp"]["orderId"]:
        raise RuntimeError("Restaurant guest app did not return a live order id")
    if not ui["restaurantApp"]["reservationId"]:
        raise RuntimeError("Restaurant guest app did not return a reservation id")

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
    restaurant_app_after = http_get_json(
        f"{runtime['backend_url']}/api/availability?restaurant_id={runtime['restaurant_id']}&date={restaurant_app_slot['date']}&party_size=2"
    )
    restaurant_app_after_slot = next(
        slot for slot in restaurant_app_after["slots"] if slot["start_time"] == restaurant_app_slot["slot"]["start_time"]
    )
    checks["availability_before"] = {
        "restaurant": restaurant_selection["slot"],
        "restaurant_app": restaurant_app_slot["slot"],
        "hotel": hotel_selection["room_type"],
    }
    checks["availability_after"] = {
        "restaurant": restaurant_after_slot,
        "restaurant_app": restaurant_app_after_slot,
        "hotel": hotel_after_room,
    }
    if restaurant_after_slot["table_options"] >= restaurant_selection["slot"]["table_options"]:
        raise RuntimeError("Restaurant availability did not decrease after landing booking")
    if restaurant_app_after_slot["table_options"] >= restaurant_app_slot["slot"]["table_options"]:
        raise RuntimeError("Restaurant availability did not decrease after restaurant app booking")
    if hotel_after_room["available_rooms"] >= hotel_selection["room_type"]["available_rooms"]:
        raise RuntimeError("Hotel availability did not decrease after landing booking")

    hms_reservations = http_get_text(f"{runtime['backend_url']}/api/hms/reservations", headers=auth_headers)
    restaurant_reservations = http_get_text(f"{runtime['backend_url']}/api/reservations", headers=auth_headers)
    for name in [
        ui["names"]["hotel"],
        ui["names"]["restaurant"],
        ui["names"]["tagung"],
        ui["names"]["restaurant_app_reservation"],
    ]:
        haystack = hms_reservations if "Hotel" in name else restaurant_reservations
        if name not in haystack:
            raise RuntimeError(f"Reservation {name} not visible in authenticated backend view")

    order_id = ui["restaurantApp"]["orderId"]
    order_detail = http_get_json(
        f"{runtime['backend_url']}/api/billing/orders/{order_id}",
        headers=auth_headers,
    )
    order_items = http_get_json(
        f"{runtime['backend_url']}/api/billing/orders/{order_id}/items",
        headers=auth_headers,
    )
    checks["restaurant_app_order_before_kitchen"] = {
        "order": order_detail,
        "items": order_items,
        "table": restaurant_table,
    }
    if order_detail["guest_name"] != ui["names"]["restaurant_app_order"]:
        raise RuntimeError("Restaurant guest app order guest name mismatch in billing order")
    if order_detail["status"] != "pending":
        raise RuntimeError("Restaurant guest app order should enter billing as pending before kitchen handoff")
    if not order_items:
        raise RuntimeError("Restaurant guest app order has no persisted order items")

    live_orders_before = http_get_json(
        f"{runtime['backend_url']}/api/billing/orders/live",
        headers=auth_headers,
    )
    if any(order["id"] == order_id for order in live_orders_before):
        raise RuntimeError("Pending restaurant guest app order unexpectedly appeared in live waiter orders before kitchen handoff")

    kitchen_status, sent_order = http_post_json(
        f"{runtime['backend_url']}/api/billing/orders/{order_id}/send-to-kitchen",
        {},
        headers=auth_headers,
    )
    if kitchen_status != 200:
        raise RuntimeError(f"Failed to send restaurant guest order to kitchen: {kitchen_status} {sent_order}")

    live_orders_after_send = http_get_json(
        f"{runtime['backend_url']}/api/billing/orders/live",
        headers=auth_headers,
    )
    if not any(order["id"] == order_id for order in live_orders_after_send):
        raise RuntimeError("Restaurant guest app order did not appear in live waiter orders after kitchen handoff")

    kds_orders = http_get_json(
        f"{runtime['backend_url']}/api/billing/kds/orders",
        headers=auth_headers,
    )
    kds_match = next((order for order in kds_orders if order["order_id"] == order_id), None)
    if kds_match is None:
        raise RuntimeError("Restaurant guest app order did not appear in the kitchen board after handoff")
    checks["restaurant_app_order_after_kitchen"] = {
        "sent_order": sent_order,
        "live_order_visible": True,
        "kds_order": kds_match,
    }

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
