from __future__ import annotations

from datetime import date, time

from app.hms.models import HotelReservation
from app.reservations.domain import Reservation as DomainReservation
from app.reservations.models import Reservation as RestaurantReservation
from app.reservations.schemas import UnifiedReservationCreate


def test_domain_reservation_maps_restaurant_create_payload() -> None:
    payload = UnifiedReservationCreate(
        kind="restaurant",
        restaurant_id=5,
        guest_name="Ada",
        guest_phone="555-0100",
        party_size=2,
        reservation_date=date(2026, 4, 1),
        start_time=time(19, 0),
        source="online",
    )

    reservation = DomainReservation.from_create_payload(payload)

    assert reservation.type == "restaurant"
    assert reservation.restaurant_id == 5
    assert reservation.guest_name == "Ada"
    assert reservation.source == "online"


def test_domain_reservation_maps_hotel_create_payload() -> None:
    payload = UnifiedReservationCreate(
        kind="hotel",
        property_id=9,
        guest_name="Grace",
        guest_phone="555-0111",
        check_in=date(2026, 5, 10),
        check_out=date(2026, 5, 12),
        room_type_label="Komfort",
        source="mcp",
    )

    reservation = DomainReservation.from_create_payload(payload)

    assert reservation.type == "hotel"
    assert reservation.property_id == 9
    assert reservation.room_type_label == "Komfort"
    assert reservation.source == "mcp"


def test_domain_reservation_maps_restaurant_record() -> None:
    record = RestaurantReservation(
        id=12,
        restaurant_id=7,
        guest_name="Record Guest",
        guest_phone="555-0100",
        guest_email="guest@example.com",
        table_id=3,
        party_size=4,
        reservation_date=date(2026, 4, 2),
        start_time=time(20, 0),
        duration_min=90,
        status="confirmed",
        source="phone",
    )

    reservation = DomainReservation.from_restaurant_record(record)

    assert reservation.type == "restaurant"
    assert reservation.id == 12
    assert reservation.table_id == 3
    assert reservation.party_size == 4


def test_domain_reservation_maps_hotel_record() -> None:
    record = HotelReservation(
        id=22,
        property_id=4,
        guest_name="Hotel Guest",
        guest_email="hotel@example.com",
        guest_phone="555-0200",
        phone="555-0200",
        check_in=date(2026, 6, 1),
        check_out=date(2026, 6, 3),
        status="confirmed",
        total_amount=199.0,
        room_type_label="Suite",
        adults=2,
        children=1,
        booking_id="BK-999",
    )

    reservation = DomainReservation.from_hotel_record(record, source="web")

    assert reservation.type == "hotel"
    assert reservation.id == 22
    assert reservation.property_id == 4
    assert reservation.booking_id == "BK-999"
    assert reservation.source == "web"
