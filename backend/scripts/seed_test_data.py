from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from sqlalchemy import delete, func, or_, select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth.models import Restaurant, User, UserRole
from app.auth.utils import hash_password
from app.billing.models import Bill, KDSStationConfig, OrderItem, Payment, TableOrder
from app.core.models import AgentAction
from app.dashboard.models import Alert, KPISnapshot
from app.database import async_session
from app.guests.models import GuestProfile, LoyaltyAccount, Order, Promotion
from app.hms.models import (
    HotelFolio,
    HotelFolioLine,
    HotelFolioPayment,
    HotelInvoice,
    HotelInvoiceLine,
    HotelMessageEvent,
    HotelMessageThread,
    HotelProperty,
    HotelReservation,
    HotelStay,
    Room,
    RoomType,
    StayOccupant,
)
from app.hms.rbac import ensure_hotel_rbac_bootstrap
from app.hms.room_inventory import ROOM_CATEGORY_CONFIG, ROOM_INVENTORY, room_category_display_label
from app.menu.models import MenuCategory, MenuItem, MenuModifier
from app.reservations.models import FloorSection, QRTableCode, Reservation, Table, TableSession

PASSWORD = "MGIntegration123!"
TEST_EMAIL_DOMAIN = "mg.test"
TEST_PROPERTY_NAME = "MG Integration Test Hotel"
TEST_RESTAURANT_NAME = "MG Integration Test Restaurant"
MANIFEST_PATH = BACKEND_DIR / "scripts" / "seed_test_data.manifest.json"
NOW = datetime.now(timezone.utc)
TODAY = date.today()


@dataclass(slots=True)
class ReservationSpec:
    booking_id: str
    guest_index: int
    room_category: str
    room_number: str
    check_in: date
    check_out: date
    reservation_status: str
    stay_status: str
    payment_status: str
    notes: str | None = None


GUEST_ROWS = [
    ("Lena Meyer", "lena.meyer@mg.test", "+49 391 555 1001"),
    ("Jonas Richter", "jonas.richter@mg.test", "+49 391 555 1002"),
    ("Clara Vogel", "clara.vogel@mg.test", "+49 391 555 1003"),
    ("Tobias Brandt", "tobias.brandt@mg.test", "+49 391 555 1004"),
    ("Amelie Koch", "amelie.koch@mg.test", "+49 391 555 1005"),
    ("Noah Fischer", "noah.fischer@mg.test", "+49 391 555 1006"),
    ("Sophie Becker", "sophie.becker@mg.test", "+49 391 555 1007"),
    ("Mila Hartmann", "mila.hartmann@mg.test", "+49 391 555 1008"),
    ("Finn Schreiber", "finn.schreiber@mg.test", "+49 391 555 1009"),
    ("Emma Weiss", "emma.weiss@mg.test", "+49 391 555 1010"),
]

MENU_BLUEPRINT = [
    ("Starters", "Chef-curated first plates", "#C8A951", "🥗", [
        ("Beetroot Carpaccio", "Smoked yoghurt, hazelnut, dill oil", 11.5),
        ("Elbe Burrata", "Tomato confit, basil, sourdough crumbs", 13.0),
    ]),
    ("Mains", "Seasonal signatures from the pass", "#2F7D62", "🍽️", [
        ("Market Fish", "Spring vegetables, beurre blanc", 28.0),
        ("Braised Short Rib", "Celeriac puree, jus, shallot", 31.5),
        ("Wild Mushroom Risotto", "Parmesan, chive, lemon", 22.0),
        ("Hotel Club Sandwich", "Chicken, bacon, fries", 18.5),
    ]),
    ("Desserts", "Pastry and coffee service", "#A76F4E", "🍰", [
        ("Burnt Cheesecake", "Cherry compote, vanilla cream", 9.5),
        ("Chocolate Torte", "Salted caramel, espresso gelato", 10.0),
    ]),
    ("Drinks", "House bar and cellar favourites", "#4B6CB7", "🍷", [
        ("Elb Spritz", "Aperitivo, sparkling wine, grapefruit", 10.5),
        ("Still Water 0.75L", "House-filtered table water", 5.0),
    ]),
]


def build_reservation_specs() -> list[ReservationSpec]:
    room_sequence = [
        ("komfort", "203"),
        ("komfort", "204"),
        ("komfort", "207"),
        ("komfort_plus", "201"),
        ("suite", "206"),
        ("komfort_plus", "202"),
        ("komfort", "209"),
        ("suite", "306"),
        ("4_pax", "205"),
        ("komfort_plus", "301"),
        ("komfort", "210"),
        ("suite", "401"),
        ("komfort_plus", "302"),
        ("komfort", "303"),
        ("komfort_plus", "311"),
        ("komfort", "304"),
        ("4_pax", "305"),
        ("komfort_plus", "312"),
        ("suite", "306"),
        ("komfort", "307"),
    ]

    specs: list[ReservationSpec] = []
    occupied_offsets = [(-1, 2), (-2, 1), (-1, 3), (0, 2), (-3, 1)]
    upcoming_offsets = [(2, 5), (3, 6), (4, 7), (5, 8), (6, 9)]
    checked_out_offsets = [(-5, -2), (-4, -1), (-7, -3)]
    other_offsets = [(1, 4), (2, 4), (7, 10), (8, 12), (9, 11), (10, 13), (12, 15)]

    index = 0
    for check_in_offset, check_out_offset in occupied_offsets:
        category, room = room_sequence[index]
        specs.append(
            ReservationSpec(
                booking_id=f"BK{900001 + index:06d}",
                guest_index=index % len(GUEST_ROWS),
                room_category=category,
                room_number=room,
                check_in=TODAY + timedelta(days=check_in_offset),
                check_out=TODAY + timedelta(days=check_out_offset),
                reservation_status="checked_in",
                stay_status="checked_in",
                payment_status="pending" if index == 0 else "paid",
                notes="High-floor quiet room requested.",
            )
        )
        index += 1

    for check_in_offset, check_out_offset in upcoming_offsets:
        category, room = room_sequence[index]
        specs.append(
            ReservationSpec(
                booking_id=f"BK{900001 + index:06d}",
                guest_index=index % len(GUEST_ROWS),
                room_category=category,
                room_number=room,
                check_in=TODAY + timedelta(days=check_in_offset),
                check_out=TODAY + timedelta(days=check_out_offset),
                reservation_status="confirmed",
                stay_status="booked",
                payment_status="pending",
                notes="Arrival expected after 18:00.",
            )
        )
        index += 1

    for check_in_offset, check_out_offset in checked_out_offsets:
        category, room = room_sequence[index]
        specs.append(
            ReservationSpec(
                booking_id=f"BK{900001 + index:06d}",
                guest_index=index % len(GUEST_ROWS),
                room_category=category,
                room_number=room,
                check_in=TODAY + timedelta(days=check_in_offset),
                check_out=TODAY + timedelta(days=check_out_offset),
                reservation_status="checked_out",
                stay_status="checked_out",
                payment_status="paid",
                notes="Stayed for conference package.",
            )
        )
        index += 1

    for check_in_offset, check_out_offset in other_offsets:
        category, room = room_sequence[index]
        specs.append(
            ReservationSpec(
                booking_id=f"BK{900001 + index:06d}",
                guest_index=index % len(GUEST_ROWS),
                room_category=category,
                room_number=room,
                check_in=TODAY + timedelta(days=check_in_offset),
                check_out=TODAY + timedelta(days=check_out_offset),
                reservation_status="confirmed",
                stay_status="booked",
                payment_status="pending",
                notes="Corporate rate booked via landing page.",
            )
        )
        index += 1

    return specs


def split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.split(" ") if part]
    if not parts:
        return "Guest", "Guest"
    if len(parts) == 1:
        return parts[0], parts[0]
    return parts[0], parts[-1]


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


async def delete_existing_test_scope(session) -> None:
    property_record = await session.scalar(
        select(HotelProperty).where(HotelProperty.name == TEST_PROPERTY_NAME)
    )
    if property_record is not None:
        await session.delete(property_record)
        await session.flush()

    restaurant_record = await session.scalar(
        select(Restaurant).where(Restaurant.name == TEST_RESTAURANT_NAME)
    )
    if restaurant_record is not None:
        restaurant_id = restaurant_record.id
        await session.execute(delete(Payment).where(Payment.restaurant_id == restaurant_id))
        await session.execute(delete(Bill).where(Bill.restaurant_id == restaurant_id))
        await session.execute(delete(OrderItem).where(OrderItem.restaurant_id == restaurant_id))
        await session.execute(delete(TableOrder).where(TableOrder.restaurant_id == restaurant_id))
        await session.execute(delete(KDSStationConfig).where(KDSStationConfig.restaurant_id == restaurant_id))
        await session.execute(delete(Order).where(Order.restaurant_id == restaurant_id))
        await session.execute(delete(Promotion).where(Promotion.restaurant_id == restaurant_id))
        await session.execute(delete(LoyaltyAccount).where(LoyaltyAccount.restaurant_id == restaurant_id))
        await session.execute(delete(Reservation).where(Reservation.restaurant_id == restaurant_id))
        await session.execute(delete(TableSession).where(TableSession.restaurant_id == restaurant_id))
        await session.execute(delete(QRTableCode).where(QRTableCode.restaurant_id == restaurant_id))
        await session.execute(delete(Table).where(Table.restaurant_id == restaurant_id))
        await session.execute(delete(FloorSection).where(FloorSection.restaurant_id == restaurant_id))
        await session.execute(delete(MenuItem).where(MenuItem.restaurant_id == restaurant_id))
        await session.execute(delete(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id))
        await session.execute(delete(MenuModifier).where(MenuModifier.restaurant_id == restaurant_id))
        await session.execute(delete(GuestProfile).where(GuestProfile.restaurant_id == restaurant_id))
        await session.delete(restaurant_record)
        await session.flush()

    await session.execute(delete(User).where(User.email.like(f"%@{TEST_EMAIL_DOMAIN}")))
    await session.execute(delete(GuestProfile).where(GuestProfile.email.like(f"%@{TEST_EMAIL_DOMAIN}")))
    await session.execute(
        delete(AgentAction).where(AgentAction.description.like("MG seed:%"))
    )
    await session.execute(
        delete(Alert).where(Alert.title.like("MG seed:%"))
    )
    await session.execute(
        delete(KPISnapshot).where(KPISnapshot.metric_name.like("mg_seed_%"))
    )


async def seed_users(session, restaurant: Restaurant, property_record: HotelProperty) -> dict[str, User]:
    users = {
        "admin": User(
            email="admin@mg.test",
            password_hash=hash_password(PASSWORD),
            full_name="MG Admin",
            role=UserRole.admin,
            restaurant_id=restaurant.id,
            active_property_id=property_record.id,
        ),
        "owner": User(
            email="owner@mg.test",
            password_hash=hash_password(PASSWORD),
            full_name="MG Owner",
            role=UserRole.manager,
            restaurant_id=restaurant.id,
            active_property_id=property_record.id,
        ),
        "waiter": User(
            email="waiter@mg.test",
            password_hash=hash_password(PASSWORD),
            full_name="MG Waiter",
            role=UserRole.staff,
            restaurant_id=restaurant.id,
            active_property_id=property_record.id,
        ),
        "guest_portal": User(
            email="guest.portal@mg.test",
            password_hash=hash_password(PASSWORD),
            full_name="MG Guest Portal",
            role=UserRole.staff,
            restaurant_id=restaurant.id,
            active_property_id=property_record.id,
        ),
    }
    session.add_all(users.values())
    await session.flush()
    await ensure_hotel_rbac_bootstrap(session, users=list(users.values()))
    return users


async def seed_rooms(session, property_record: HotelProperty) -> tuple[dict[str, RoomType], dict[str, Room]]:
    room_types: dict[str, RoomType] = {}
    for category_key, config in ROOM_CATEGORY_CONFIG.items():
        room_type = RoomType(
            property_id=property_record.id,
            name=config.canonical_label,
            base_occupancy=config.base_occupancy,
            max_occupancy=config.max_occupancy,
            base_price=config.base_price,
            description=f"{config.display_label} category for MG integration testing.",
        )
        session.add(room_type)
        room_types[category_key] = room_type
    await session.flush()

    rooms_by_number: dict[str, Room] = {}
    for category_key, room_numbers in ROOM_INVENTORY.items():
        for room_number in room_numbers:
            floor = int(room_number[0]) if room_number[:1].isdigit() else 0
            room = Room(
                property_id=property_record.id,
                room_number=room_number,
                room_type_id=room_types[category_key].id,
                status="available",
                floor=floor or None,
            )
            session.add(room)
            rooms_by_number[room_number] = room
    await session.flush()
    return room_types, rooms_by_number


async def seed_guests(session, restaurant: Restaurant) -> list[GuestProfile]:
    guests: list[GuestProfile] = []
    for index, (name, email, phone) in enumerate(GUEST_ROWS, start=1):
        guest = GuestProfile(
            restaurant_id=restaurant.id,
            name=name,
            email=email,
            phone=phone,
            salutation="Ms." if index % 2 else "Mr.",
            country_code="DE",
            country_name="Germany",
            custom_fields_json={"source": "mg_seed", "vip": index <= 2},
            dietary_json={"preference": "vegetarian" if index % 3 == 0 else "none"},
            flavor_profile_json={"coffee": "black"},
            clv=250 + index * 10,
            churn_risk_score=0.05 * index,
            visit_count=1 + (index % 4),
            last_visit=NOW - timedelta(days=index * 12),
        )
        session.add(guest)
        guests.append(guest)
    await session.flush()
    return guests


def compute_folio_numbers(index: int) -> tuple[str, str]:
    return f"FOL-MG-{index:04d}", f"INV-MG-{index:04d}"


async def seed_hotel_side(
    session,
    property_record: HotelProperty,
    room_types: dict[str, RoomType],
    rooms_by_number: dict[str, Room],
    guests: list[GuestProfile],
) -> tuple[list[HotelReservation], dict[str, object]]:
    specs = build_reservation_specs()
    reservations: list[HotelReservation] = []
    manifest: dict[str, object] = {}

    for index, spec in enumerate(specs, start=1):
        guest = guests[spec.guest_index]
        room_type = room_types[spec.room_category]
        room = rooms_by_number[spec.room_number]
        nights = max((spec.check_out - spec.check_in).days, 1)
        base_amount = round(float(room_type.base_price) * nights, 2)
        service_amount = round(18 + (index % 4) * 7.5, 2)
        minibar_amount = 12.5 if index % 2 == 0 else 0.0
        subtotal = round(base_amount + service_amount + minibar_amount, 2)
        tax_amount = round(subtotal * 0.07, 2)
        total_amount = round(subtotal + tax_amount, 2)

        reservation = HotelReservation(
            property_id=property_record.id,
            guest_id=guest.id,
            billing_guest_id=guest.id,
            guest_name=guest.name or f"Guest {index}",
            guest_email=guest.email,
            guest_phone=guest.phone,
            check_in=spec.check_in,
            check_out=spec.check_out,
            status=spec.reservation_status,
            total_amount=total_amount,
            currency=property_record.currency,
            notes=spec.notes,
            room_type_id=room_type.id,
            payment_status=spec.payment_status,
            booking_id=spec.booking_id,
            anrede=guest.salutation,
            phone=guest.phone,
            room=room.room_number,
            room_type_label=room_category_display_label(spec.room_category),
            adults=2 if spec.room_category != "4_pax" else 4,
            children=0 if spec.room_category != "4_pax" else 1,
            zahlungs_methode="card",
            zahlungs_status="bezahlt" if spec.payment_status == "paid" else "offen",
            special_requests=spec.notes,
            booking_source="integration_seed",
            color_tag="#0A7D5D" if spec.stay_status == "checked_in" else "#C8A951",
        )
        session.add(reservation)
        await session.flush()

        stay = HotelStay(
            property_id=property_record.id,
            reservation_id=reservation.id,
            room_id=room.id,
            status=spec.stay_status,
            planned_check_in=spec.check_in,
            planned_check_out=spec.check_out,
            actual_check_in_at=NOW - timedelta(hours=index) if spec.stay_status == "checked_in" else None,
            actual_check_out_at=NOW - timedelta(days=1, hours=index) if spec.stay_status == "checked_out" else None,
            notes=f"MG seed stay for {reservation.booking_id}.",
        )
        session.add(stay)
        await session.flush()

        session.add(
            StayOccupant(
                stay_id=stay.id,
                guest_profile_id=guest.id,
                is_primary=True,
            )
        )

        folio_number, invoice_number = compute_folio_numbers(index)
        folio_status = "paid" if index in {11, 12, 13, 14, 15} else "open"
        paid_amount = total_amount if folio_status == "paid" else round(total_amount * 0.35, 2)
        balance_due = 0 if folio_status == "paid" else round(total_amount - paid_amount, 2)
        folio = HotelFolio(
            property_id=property_record.id,
            stay_id=stay.id,
            reservation_id=reservation.id,
            folio_number=folio_number,
            currency=property_record.currency,
            status=folio_status,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=0,
            total=total_amount,
            balance_due=balance_due,
            paid_at=NOW - timedelta(days=1) if folio_status == "paid" else None,
        )
        session.add(folio)
        await session.flush()

        folio_lines = [
            HotelFolioLine(
                folio_id=folio.id,
                charge_type="room_night",
                description=f"{room_category_display_label(spec.room_category)} stay",
                quantity=nights,
                unit_price=float(room_type.base_price),
                total_price=base_amount,
                service_date=spec.check_in,
                status="posted",
                metadata_json={"source": "mg_seed"},
            ),
            HotelFolioLine(
                folio_id=folio.id,
                charge_type="restaurant",
                description="Restaurant dinner",
                quantity=1,
                unit_price=service_amount,
                total_price=service_amount,
                service_date=max(spec.check_in, TODAY - timedelta(days=1)),
                status="posted",
                metadata_json={"source": "mg_seed"},
            ),
        ]
        if minibar_amount > 0:
            folio_lines.append(
                HotelFolioLine(
                    folio_id=folio.id,
                    charge_type="minibar",
                    description="Mini bar",
                    quantity=1,
                    unit_price=minibar_amount,
                    total_price=minibar_amount,
                    service_date=max(spec.check_in, TODAY - timedelta(days=1)),
                    status="posted",
                    metadata_json={"source": "mg_seed"},
                )
            )
        session.add_all(folio_lines)
        await session.flush()

        if paid_amount > 0:
            session.add(
                HotelFolioPayment(
                    folio_id=folio.id,
                    amount=paid_amount,
                    method="card",
                    reference=f"PMT-{reservation.booking_id}",
                    status="completed",
                    paid_at=NOW - timedelta(hours=index),
                    card_last_four="4242",
                    card_brand="visa",
                )
            )

        if index <= 5 or 11 <= index <= 15:
            invoice_status = "pending" if index <= 5 else "paid"
            invoice = HotelInvoice(
                property_id=property_record.id,
                reservation_id=reservation.id,
                stay_id=stay.id,
                folio_id=folio.id,
                invoice_number=invoice_number,
                status=invoice_status,
                currency=property_record.currency,
                recipient_name=reservation.guest_name,
                recipient_email=reservation.guest_email,
                issued_at=NOW - timedelta(days=1),
                sent_at=NOW - timedelta(hours=12),
                metadata_json={"source": "mg_seed"},
            )
            session.add(invoice)
            await session.flush()
            for line_number, line in enumerate(folio_lines, start=1):
                session.add(
                    HotelInvoiceLine(
                        invoice_id=invoice.id,
                        folio_line_id=line.id,
                        line_number=line_number,
                        charge_type=line.charge_type,
                        description=line.description,
                        quantity=line.quantity,
                        unit_price=line.unit_price,
                        net_amount=line.total_price,
                        tax_rate=7,
                        tax_amount=round(float(line.total_price) * 0.07, 2),
                        gross_amount=round(float(line.total_price) * 1.07, 2),
                        service_date=line.service_date,
                    )
                )

        if index <= 5:
            thread = HotelMessageThread(
                property_id=property_record.id,
                reservation_id=reservation.id,
                guest_id=guest.id,
                channel="email",
                status="open",
                subject=f"Arrival request for {reservation.booking_id}",
                guest_name=reservation.guest_name,
                guest_email=reservation.guest_email,
                last_message_at=NOW - timedelta(hours=index),
                last_direction="outbound",
            )
            session.add(thread)
            await session.flush()
            session.add_all(
                [
                    HotelMessageEvent(
                        property_id=property_record.id,
                        thread_id=thread.id,
                        direction="inbound",
                        channel="email",
                        subject=thread.subject,
                        body_text="Could you please confirm my arrival time and parking details?",
                        sender_email=reservation.guest_email,
                        recipient_email="frontdesk@mg.test",
                        status="received",
                        sent_at=NOW - timedelta(hours=index + 2),
                        metadata_json={"source": "mg_seed"},
                    ),
                    HotelMessageEvent(
                        property_id=property_record.id,
                        thread_id=thread.id,
                        direction="outbound",
                        channel="email",
                        subject=thread.subject,
                        body_text="Parking is reserved and your room is prepared for arrival after 15:00.",
                        sender_email="frontdesk@mg.test",
                        recipient_email=reservation.guest_email,
                        status="sent",
                        sent_at=NOW - timedelta(hours=index),
                        metadata_json={"source": "mg_seed"},
                    ),
                ]
            )

        reservations.append(reservation)

        if spec.stay_status == "checked_in":
            room.status = "occupied"
        elif spec.stay_status == "checked_out":
            room.status = "available"

    manifest["guest_booking_id"] = specs[0].booking_id
    manifest["guest_last_name"] = split_name(guests[specs[0].guest_index].name or "Guest")[1]
    manifest["checkin_booking_id"] = specs[5].booking_id
    manifest["checkin_last_name"] = split_name(guests[specs[5].guest_index].name or "Guest")[1]
    return reservations, manifest


async def seed_restaurant_side(session, restaurant: Restaurant, guests: list[GuestProfile]) -> dict[str, object]:
    section = FloorSection(
        restaurant_id=restaurant.id,
        name="Dining Room",
        description="Main restaurant floor for integration testing.",
        sort_order=1,
    )
    session.add(section)
    await session.flush()

    categories: list[MenuCategory] = []
    menu_items: list[MenuItem] = []
    for sort_order, (name, description, color, icon, items) in enumerate(MENU_BLUEPRINT, start=1):
        category = MenuCategory(
            restaurant_id=restaurant.id,
            name=name,
            description=description,
            icon=icon,
            color=color,
            sort_order=sort_order,
            is_active=True,
        )
        session.add(category)
        categories.append(category)
    await session.flush()

    for category, (_, _, _, _, items) in zip(categories, MENU_BLUEPRINT, strict=True):
        for item_index, (name, description, price) in enumerate(items, start=1):
            menu_item = MenuItem(
                restaurant_id=restaurant.id,
                category_id=category.id,
                name=name,
                description=description,
                price=price,
                cost=round(price * 0.32, 2),
                is_available=True,
                is_featured=item_index == 1,
                prep_time_min=15 + item_index * 3,
                allergens_json={"contains": ["gluten"] if item_index % 2 == 0 else []},
                dietary_tags_json={"tags": ["vegetarian"] if "Risotto" in name else []},
                sort_order=item_index,
            )
            session.add(menu_item)
            menu_items.append(menu_item)
    await session.flush()

    tables: list[Table] = []
    qr_codes: list[QRTableCode] = []
    for index in range(1, 6):
        table = Table(
            restaurant_id=restaurant.id,
            section_id=section.id,
            table_number=f"T{index}",
            capacity=2 + index,
            min_capacity=1,
            shape="round" if index % 2 else "square",
            status="occupied" if index <= 3 else "available",
            position_x=120 * index,
            position_y=140 + (index % 2) * 80,
            rotation=0.0,
            width=1.0,
            height=1.0,
            is_active=True,
        )
        session.add(table)
        tables.append(table)
    await session.flush()

    for index, table in enumerate(tables, start=1):
        qr_code = QRTableCode(
            restaurant_id=restaurant.id,
            table_id=table.id,
            code=f"MG-TABLE-{index}",
            is_active=True,
            scan_count=5 + index,
            last_scanned_at=NOW - timedelta(hours=index),
        )
        session.add(qr_code)
        qr_codes.append(qr_code)
    await session.flush()

    orders: list[TableOrder] = []
    for index in range(10):
        table = tables[index % len(tables)]
        guest = guests[index % len(guests)]
        session_row = TableSession(
            restaurant_id=restaurant.id,
            table_id=table.id,
            reservation_id=None,
            started_at=NOW - timedelta(minutes=60 + index * 12),
            ended_at=None if index < 6 else NOW - timedelta(minutes=20),
            status="active" if index < 6 else "closed",
            covers=2 + (index % 3),
        )
        session.add(session_row)
        await session.flush()

        selected_items = [
            menu_items[index % len(menu_items)],
            menu_items[(index + 3) % len(menu_items)],
        ]
        subtotal = round(sum(float(item.price) for item in selected_items), 2)
        tax_amount = round(subtotal * 0.07, 2)
        total = round(subtotal + tax_amount, 2)
        order = TableOrder(
            restaurant_id=restaurant.id,
            session_id=session_row.id,
            table_id=table.id,
            server_id=None,
            status="paid" if index < 4 else "open",
            order_type="dine_in",
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=0,
            tip_amount=4.0 if index < 4 else 0,
            total=round(total + (4.0 if index < 4 else 0), 2),
            notes="MG seed kitchen ticket",
            guest_name=guest.name,
        )
        session.add(order)
        await session.flush()

        for course_number, menu_item in enumerate(selected_items, start=1):
            session.add(
                OrderItem(
                    restaurant_id=restaurant.id,
                    order_id=order.id,
                    menu_item_id=menu_item.id,
                    item_name=menu_item.name,
                    quantity=1,
                    unit_price=menu_item.price,
                    total_price=menu_item.price,
                    modifiers_json={},
                    status="served" if index < 4 else "sent",
                    notes=None,
                    sent_to_kitchen_at=NOW - timedelta(minutes=25 + index),
                    served_at=NOW - timedelta(minutes=5 + index) if index < 4 else None,
                    station=categories[index % len(categories)].name.lower(),
                    course_number=course_number,
                )
            )

        bill = Bill(
            restaurant_id=restaurant.id,
            order_id=order.id,
            bill_number=f"BILL-MG-{index + 1:03d}",
            subtotal=subtotal,
            tax_rate=0.07,
            tax_amount=tax_amount,
            service_charge=0,
            discount_amount=0,
            tip_amount=4.0 if index < 4 else 0,
            total=round(total + (4.0 if index < 4 else 0), 2),
            split_type="none",
            split_count=1,
            status="paid" if index < 4 else "open",
            paid_at=NOW - timedelta(minutes=3 + index) if index < 4 else None,
            receipt_email=guest.email,
            receipt_token=f"receipt-mg-{index + 1:03d}",
        )
        session.add(bill)
        await session.flush()

        if index < 4:
            session.add(
                Payment(
                    restaurant_id=restaurant.id,
                    bill_id=bill.id,
                    amount=bill.total,
                    method="card",
                    reference=f"CARD-MG-{index + 1:03d}",
                    tip_amount=4.0,
                    status="completed",
                    paid_at=NOW - timedelta(minutes=2 + index),
                    card_last_four="4242",
                    card_brand="visa",
                )
            )
            table.status = "available"

        orders.append(order)

    return {
        "waiter_table_id": str(tables[0].id),
        "waiter_table_code": qr_codes[0].code,
        "waiter_menu_item_id": str(menu_items[0].id),
    }


async def seed_operational_observability(session, users: dict[str, User], property_record: HotelProperty) -> None:
    session.add_all(
        [
            AgentAction(
                agent_name="owner_copilot",
                action_type="booking_monitor",
                description="MG seed: monitored booking pipeline for cross-app validation.",
                input_data={"property_id": property_record.id},
                output_data={"rationale": "Seeded live activity for owner dashboard."},
                status="executed",
                confidence=0.93,
                requires_approval=False,
                approved_by=users["owner"].id,
                executed_at=NOW - timedelta(minutes=10),
            ),
            AgentAction(
                agent_name="service_ops",
                action_type="restaurant_order_watch",
                description="MG seed: verified restaurant ticket flow.",
                input_data={"property_id": property_record.id},
                output_data={"rationale": "Seeded live owner dashboard activity."},
                status="executed",
                confidence=0.91,
                requires_approval=False,
                approved_by=users["owner"].id,
                executed_at=NOW - timedelta(minutes=5),
            ),
            Alert(
                module="reservations",
                severity="warning",
                title="MG seed: Pending folio review",
                message="One in-house folio remains unpaid for integration testing.",
                is_read=False,
                owner="Front Office",
                status="open",
                sla_status="on_track",
                sla_minutes=120,
                due_at=NOW + timedelta(hours=2),
            ),
            KPISnapshot(
                metric_name="mg_seed_occupancy_pct",
                value=71.4,
                previous_value=68.2,
                target_value=75.0,
                timestamp=NOW,
            ),
            KPISnapshot(
                metric_name="mg_seed_orders_total",
                value=10,
                previous_value=8,
                target_value=12,
                timestamp=NOW,
            ),
        ]
    )


async def main() -> None:
    async with async_session() as session:
        await delete_existing_test_scope(session)

        restaurant = Restaurant(
            name=TEST_RESTAURANT_NAME,
            address="Seilerweg 19",
            city="Magdeburg",
            state="Saxony-Anhalt",
            zip_code="39114",
            phone="+49 391 555 0000",
            timezone="Europe/Berlin",
            currency="EUR",
            settings_json={"source": "mg_seed"},
        )
        property_record = HotelProperty(
            name=TEST_PROPERTY_NAME,
            address="Seilerweg 19",
            city="Magdeburg",
            country="Germany",
            timezone="Europe/Berlin",
            currency="EUR",
            settings_json={"source": "mg_seed"},
        )
        session.add_all([restaurant, property_record])
        await session.flush()

        users = await seed_users(session, restaurant, property_record)
        room_types, rooms_by_number = await seed_rooms(session, property_record)
        guests = await seed_guests(session, restaurant)
        reservations, hotel_manifest = await seed_hotel_side(
            session,
            property_record,
            room_types,
            rooms_by_number,
            guests,
        )
        restaurant_manifest = await seed_restaurant_side(session, restaurant, guests)
        await seed_operational_observability(session, users, property_record)

        await session.commit()

    manifest = {
        "generated_at": iso(NOW),
        "property": {
            "id": property_record.id,
            "name": TEST_PROPERTY_NAME,
        },
        "restaurant": {
            "id": restaurant.id,
            "name": TEST_RESTAURANT_NAME,
        },
        "credentials": {
            "admin": {"email": "admin@mg.test", "password": PASSWORD},
            "owner": {"email": "owner@mg.test", "password": PASSWORD},
            "waiter": {"email": "waiter@mg.test", "password": PASSWORD, "username": "waiter"},
        },
        "guest_portal": {
            "booking_id": hotel_manifest["guest_booking_id"],
            "last_name": hotel_manifest["guest_last_name"],
            "checkin_booking_id": hotel_manifest["checkin_booking_id"],
            "checkin_last_name": hotel_manifest["checkin_last_name"],
        },
        "restaurant_seed": restaurant_manifest,
        "summary": {
            "hotel_bookings": len(reservations),
            "active_guests": len(GUEST_ROWS),
            "occupied_rooms": 5,
            "upcoming_bookings": 5,
            "checked_out_bookings": 3,
            "menu_items": 10,
            "tables": 5,
            "orders": 10,
            "paid_invoices": 5,
            "pending_invoices": 5,
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
