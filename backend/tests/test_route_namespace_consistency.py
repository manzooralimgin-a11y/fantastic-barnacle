from __future__ import annotations

from fastapi.routing import APIRoute

from app.main import app


def _route_map() -> dict[str, set[str]]:
    route_map: dict[str, set[str]] = {}
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        methods = {method for method in route.methods if method not in {"HEAD", "OPTIONS"}}
        route_map.setdefault(route.path, set()).update(methods)
    return route_map


def test_public_routes_use_explicit_public_namespaces() -> None:
    route_map = _route_map()

    expected_public_routes = {
        "/api/public/hotel/rooms": {"GET"},
        "/api/public/hotel/availability": {"GET"},
        "/api/public/restaurant/menu": {"GET"},
        "/api/public/restaurant/table/{code}": {"GET"},
        "/api/public/restaurant/order": {"POST"},
        "/api/public/billing/receipt/{token}": {"GET"},
        "/api/public/signage/display/{screen_code}": {"GET"},
    }

    for path, methods in expected_public_routes.items():
        assert path in route_map
        assert methods.issubset(route_map[path])


def test_legacy_public_routes_are_removed_from_private_api_namespaces() -> None:
    route_map = _route_map()

    legacy_public_paths = {
        "/api/public/restaurant/reserve",
        "/api/public/hotel/book",
        "/api/public/landing/reservations",
        "/api/public/landing/event-bookings",
        "/api/public/landing/tagungen",
        "/api/landing/reservations/",
        "/api/landing/reservations",
        "/api/event-bookings/",
        "/api/event-bookings",
        "/api/tagungen/",
        "/api/tagungen",
        "/api/billing/receipt/{token}",
        "/api/signage/display/{screen_code}",
    }

    for path in legacy_public_paths:
        assert path not in route_map


def test_canonical_and_hms_reservation_create_routes_are_registered() -> None:
    route_map = _route_map()

    assert "POST" in route_map["/api/reservations"]
    assert "POST" in route_map["/api/reservations/"]
    assert "POST" in route_map["/api/hms/reservations"]


def test_qr_guest_and_qr_admin_routes_are_separated() -> None:
    route_map = _route_map()

    expected_public_qr = {
        "/api/qr/table/{code}": {"GET"},
        "/api/qr/menu": {"GET"},
        "/api/qr/menu/{code}": {"GET"},
        "/api/qr/order": {"POST"},
        "/api/qr/order/{order_id}/status": {"GET"},
    }
    expected_admin_qr = {
        "/api/qr/admin/tables/{table_id}/qr-code": {"POST"},
        "/api/qr/admin/tables/{table_id}/qr-codes": {"GET"},
    }
    removed_legacy_admin_qr = {
        "/api/qr/tables/{table_id}/qr-code",
        "/api/qr/tables/{table_id}/qr-codes",
    }

    for path, methods in expected_public_qr.items():
        assert path in route_map
        assert methods.issubset(route_map[path])

    for path, methods in expected_admin_qr.items():
        assert path in route_map
        assert methods.issubset(route_map[path])

    for path in removed_legacy_admin_qr:
        assert path not in route_map
