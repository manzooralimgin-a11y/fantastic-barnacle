"""
Bootstrap endpoints — hotel property setup, RBAC seeding, user role promotion.

/api/admin/first-run       — No secret required. Only works while NO admin exists.
/api/admin/bootstrap       — Secret-protected (BOOTSTRAP_SECRET env var). Full setup.
/api/admin/reset-password  — Secret-protected. Resets any user's password by email.
"""
from __future__ import annotations

import os
import logging
import random
from datetime import date, time, timedelta
from fastapi import APIRouter, Body, Depends, HTTPException, Header
from sqlalchemy import select, update, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.models import User, UserRole, Restaurant
from app.auth.utils import hash_password
from app.hms.models import HotelProperty, RoomType, Room, HotelReservation, HotelStay, HotelFolio, HotelInvoice
from app.hms.rbac import ensure_hotel_rbac_bootstrap
from app.hms.room_inventory import ROOM_INVENTORY, ROOM_CATEGORY_CONFIG, normalize_room_category
from app.menu.models import MenuCategory, MenuItem
from app.reservations.models import Reservation

logger = logging.getLogger("app.bootstrap")
router = APIRouter()

BOOTSTRAP_SECRET = os.environ.get("BOOTSTRAP_SECRET", "")


def _check_secret(x_bootstrap_secret: str = Header(default="")):
    if not BOOTSTRAP_SECRET:
        raise HTTPException(status_code=503, detail="Bootstrap not configured")
    if x_bootstrap_secret != BOOTSTRAP_SECRET:
        raise HTTPException(status_code=401, detail="Invalid bootstrap secret")


@router.post("/admin/first-run", tags=["Bootstrap"])
async def first_run_setup(db: AsyncSession = Depends(get_db)):
    """
    Zero-secret first-run endpoint.

    Promotes all registered users to admin and creates the hotel property.
    Only works while NO admin user exists — auto-disables after first call.
    Returns 409 if an admin already exists (use /admin/bootstrap with secret instead).
    """
    # Guard: refuse if any admin already exists (idempotent safety gate)
    existing_admin = await db.scalar(
        select(User.id).where(User.role == UserRole.admin).limit(1)
    )
    if existing_admin is not None:
        raise HTTPException(
            status_code=409,
            detail="An admin already exists. This endpoint is disabled. Use /api/admin/bootstrap with the secret for further changes.",
        )

    log: list[str] = []

    # Promote every registered user to admin
    result = await db.execute(select(User))
    users = result.scalars().all()
    for u in users:
        u.role = UserRole.admin
        log.append(f"Promoted {u.email} → admin (id={u.id})")

    if not users:
        log.append("No users found — register an account first, then call this endpoint again.")
        return {"status": "no_users", "log": log}

    # Bootstrap RBAC for all users
    await ensure_hotel_rbac_bootstrap(db)
    log.append("RBAC bootstrapped for all users")

    await db.commit()
    logger.info("first_run_setup completed", extra={"promoted": len(users)})
    return {
        "status": "ok",
        "promoted_count": len(users),
        "log": log,
        "next_step": "Login with your account — you are now admin. This endpoint is now disabled.",
    }


@router.post("/admin/bootstrap", tags=["Bootstrap"])
async def bootstrap(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_check_secret),
):
    """Create hotel property, seed menu, bootstrap RBAC for all users."""
    log = []

    # 1. Ensure admin user exists
    result = await db.execute(select(User).where(User.email == "admin@gestronomy.app"))
    admin = result.scalar_one_or_none()
    if not admin:
        rest_result = await db.execute(select(Restaurant).order_by(Restaurant.id).limit(1))
        restaurant = rest_result.scalar_one_or_none()
        if not restaurant:
            restaurant = Restaurant(
                name="Das Elb Restaurant",
                address="Elbufer 12",
                city="Hamburg",
                state="Hamburg",
                zip_code="20459",
                phone="+49 40 1234567",
            )
            db.add(restaurant)
            await db.flush()
            log.append(f"Created restaurant id={restaurant.id}")

        admin = User(
            email="admin@gestronomy.app",
            password_hash=hash_password("Gestronomy2024!"),
            full_name="Admin",
            role=UserRole.admin,
            restaurant_id=restaurant.id,
        )
        db.add(admin)
        await db.flush()
        log.append(f"Created admin user id={admin.id}")
    else:
        log.append(f"Admin user already exists id={admin.id}")

    # 2. Promote all existing users to admin role
    result = await db.execute(select(User))
    users = result.scalars().all()
    for u in users:
        if u.role != UserRole.admin:
            u.role = UserRole.admin
            log.append(f"Promoted user {u.email} to admin")

    # 3. Ensure hotel property exists
    result = await db.execute(select(HotelProperty).limit(1))
    prop = result.scalar_one_or_none()
    if not prop:
        prop = HotelProperty(
            name="Das Elb Hotel",
            address="Elbufer 12",
            city="Hamburg",
            country="Germany",
            timezone="Europe/Berlin",
            currency="EUR",
            settings_json={"allow_pets": True, "checkout_time": "11:00"},
        )
        db.add(prop)
        await db.flush()
        log.append(f"Created hotel property id={prop.id} name='{prop.name}'")

        # Room types — canonical from room_inventory.py
        room_types_by_key: dict[str, RoomType] = {}
        for category_key, config in ROOM_CATEGORY_CONFIG.items():
            rt = RoomType(
                property_id=prop.id,
                name=config.display_label,
                base_occupancy=config.base_occupancy,
                max_occupancy=config.max_occupancy,
                base_price=config.base_price,
                description=f"Canonical inventory category {config.canonical_label}",
            )
            db.add(rt)
            room_types_by_key[category_key] = rt
        await db.flush()
        log.append(f"Created {len(room_types_by_key)} room types")

        # Rooms — all canonical room numbers from room_inventory.py
        room_count = 0
        for category_key, room_numbers in ROOM_INVENTORY.items():
            rt = room_types_by_key[category_key]
            for room_number in room_numbers:
                floor = int(room_number[0]) if room_number and room_number[0].isdigit() else 0
                db.add(Room(
                    property_id=prop.id,
                    room_type_id=rt.id,
                    room_number=room_number,
                    status="available",
                    floor=floor,
                ))
                room_count += 1
        await db.flush()
        log.append(f"Created {room_count} rooms")
    else:
        log.append(f"Hotel property already exists id={prop.id} name='{prop.name}'")

    # 4. Seed minimal menu
    rest_result = await db.execute(select(Restaurant).order_by(Restaurant.id).limit(1))
    restaurant = rest_result.scalar_one_or_none()
    if restaurant:
        cat_result = await db.execute(
            select(MenuCategory).where(MenuCategory.restaurant_id == restaurant.id)
        )
        cats = cat_result.scalars().all()
        if not cats:
            categories = [
                MenuCategory(restaurant_id=restaurant.id, name="Starters", description="", color="#C8A951"),
                MenuCategory(restaurant_id=restaurant.id, name="Mains", description="", color="#1A3A5C"),
                MenuCategory(restaurant_id=restaurant.id, name="Desserts", description="", color="#7B3D7E"),
                MenuCategory(restaurant_id=restaurant.id, name="Drinks", description="", color="#2E7D32"),
            ]
            db.add_all(categories)
            await db.flush()
            # Seed a few items per category
            items = [
                MenuItem(restaurant_id=restaurant.id, category_id=categories[0].id, name="Bruschetta", price=8.90, cost=2.00),
                MenuItem(restaurant_id=restaurant.id, category_id=categories[1].id, name="Schnitzel", price=22.90, cost=7.00),
                MenuItem(restaurant_id=restaurant.id, category_id=categories[2].id, name="Tiramisu", price=8.50, cost=2.50),
                MenuItem(restaurant_id=restaurant.id, category_id=categories[3].id, name="Wasser 0.5L", price=3.50, cost=0.50),
                MenuItem(restaurant_id=restaurant.id, category_id=categories[3].id, name="Espresso", price=3.10, cost=0.50),
            ]
            db.add_all(items)
            await db.flush()
            log.append(f"Seeded {len(categories)} menu categories and {len(items)} items")
        else:
            log.append(f"Menu already has {len(cats)} categories")

    # 5. Bootstrap RBAC for all users
    await ensure_hotel_rbac_bootstrap(db)
    log.append("RBAC bootstrapped for all users")

    await db.commit()
    return {"status": "ok", "log": log}


@router.post("/admin/reset-password", tags=["Bootstrap"])
async def reset_password(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_check_secret),
    email: str = Body(..., embed=True),
    new_password: str = Body(..., embed=True),
):
    """
    Secret-protected password reset.
    Resets any user's password by email without requiring the current password.
    Requires X-Bootstrap-Secret header.
    """
    if len(new_password) < 12:
        raise HTTPException(status_code=422, detail="Password must be at least 12 characters")

    result = await db.execute(
        select(User).where(func.lower(User.email) == email.lower().strip())
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email: {email}")

    user.password_hash = hash_password(new_password)
    await db.commit()

    logger.info("reset_password completed", extra={"email": email})
    return {
        "status": "ok",
        "email": user.email,
        "message": "Password updated. You can now log in with the new password.",
    }


@router.post("/admin/sync-rooms", tags=["Bootstrap"])
async def sync_rooms(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_check_secret),
):
    """
    Sync the DB room types and rooms to match the canonical room_inventory.py definition.
    Safe to call multiple times — creates missing rooms, updates existing, removes stale ones.
    """
    import traceback as _tb
    try:
        return await _do_sync_rooms(db)
    except Exception as exc:
        logger.exception("sync_rooms failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}\n{_tb.format_exc()[-800:]}")


async def _do_sync_rooms(db: AsyncSession):
    prop_result = await db.execute(select(HotelProperty).order_by(HotelProperty.id).limit(1))
    prop = prop_result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="No hotel property — run /api/admin/bootstrap first")

    log: list[str] = []

    # 1. Ensure canonical room types exist (upsert by normalized name)
    rt_result = await db.execute(select(RoomType).where(RoomType.property_id == prop.id))
    existing_rts = rt_result.scalars().all()

    room_types_by_key: dict[str, RoomType] = {}
    for category_key, config in ROOM_CATEGORY_CONFIG.items():
        # Try to match by normalized name
        matched = next(
            (rt for rt in existing_rts if normalize_room_category(rt.name) == category_key),
            None,
        )
        if matched is None:
            matched = RoomType(
                property_id=prop.id,
                name=config.display_label,
                base_occupancy=config.base_occupancy,
                max_occupancy=config.max_occupancy,
                base_price=config.base_price,
                description=f"Canonical inventory category {config.canonical_label}",
            )
            db.add(matched)
            await db.flush()
            log.append(f"Created room type: {config.display_label}")
        else:
            matched.name = config.display_label
            matched.base_occupancy = config.base_occupancy
            matched.max_occupancy = config.max_occupancy
            log.append(f"Updated room type: {config.display_label}")
        room_types_by_key[category_key] = matched

    await db.flush()

    # 2. Build set of all canonical room numbers
    canonical_numbers: set[str] = set()
    for room_numbers in ROOM_INVENTORY.values():
        for rn in room_numbers:
            canonical_numbers.add(rn.strip().upper())

    # 3. Fetch all existing rooms
    rooms_result = await db.execute(select(Room).where(Room.property_id == prop.id))
    existing_rooms = rooms_result.scalars().all()
    existing_by_number = {r.room_number.strip().upper(): r for r in existing_rooms}

    # 4. Delete rooms not in canonical inventory
    deleted = 0
    for number, room in list(existing_by_number.items()):
        if number not in canonical_numbers:
            await db.delete(room)
            del existing_by_number[number]
            deleted += 1
            log.append(f"Deleted stale room: {number}")

    # 5. Create / update canonical rooms
    created = 0
    updated = 0
    for category_key, room_numbers in ROOM_INVENTORY.items():
        rt = room_types_by_key[category_key]
        for room_number in room_numbers:
            normalized = room_number.strip().upper()
            floor = int(normalized[0]) if normalized and normalized[0].isdigit() else 0
            existing = existing_by_number.get(normalized)
            if existing is None:
                db.add(Room(
                    property_id=prop.id,
                    room_number=normalized,
                    room_type_id=rt.id,
                    status="available",
                    floor=floor,
                ))
                created += 1
                log.append(f"Created room: {normalized}")
            else:
                changed = False
                if existing.room_type_id != rt.id:
                    existing.room_type_id = rt.id
                    changed = True
                if existing.floor != floor:
                    existing.floor = floor
                    changed = True
                if changed:
                    updated += 1

    await db.commit()
    return {
        "status": "ok",
        "property_id": prop.id,
        "created_rooms": created,
        "updated_rooms": updated,
        "deleted_rooms": deleted,
        "log": log,
    }


@router.post("/admin/seed-reservations", tags=["Bootstrap"])
async def seed_reservations(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_check_secret),
):
    """
    Seed 15 restaurant reservations for today and 15 for tomorrow.
    Deletes any existing seeded reservations first (notes='__seed__') then re-creates.
    """
    import traceback as _tb
    try:
        return await _do_seed_reservations(db)
    except Exception as exc:
        logger.exception("seed_reservations failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}\n{_tb.format_exc()[-800:]}")


async def _do_seed_reservations(db: AsyncSession):
    # Get first restaurant
    rest_result = await db.execute(select(Restaurant).order_by(Restaurant.id).limit(1))
    restaurant = rest_result.scalar_one_or_none()
    if not restaurant:
        raise HTTPException(status_code=404, detail="No restaurant found — run /api/admin/bootstrap first")

    # Remove previously seeded reservations (identified by notes marker)
    await db.execute(
        delete(Reservation).where(
            Reservation.restaurant_id == restaurant.id,
            Reservation.notes == "__seed__",
        )
    )

    GUEST_NAMES = [
        "Anna Müller", "Thomas Schneider", "Sophie Wagner", "Felix Becker",
        "Laura Hoffmann", "Maximilian Koch", "Emma Richter", "Luca Fischer",
        "Marie Braun", "Jonas Weber", "Hannah Schäfer", "Elias Zimmermann",
        "Mia Krause", "Noah Hartmann", "Lea Schuster", "David Bergmann",
        "Julia Neumann", "Paul Schulz", "Sarah Klein", "Tim Lange",
        "Viktoria Huber", "Florian Baumann", "Christina Vogel", "Moritz Wolf",
        "Stefanie Roth", "Andreas Keller", "Katharina Groß", "Tobias Lorenz",
        "Nina Frank", "Patrick Schmid",
    ]

    SLOT_TIMES = [
        time(12, 0), time(12, 30), time(13, 0), time(13, 30), time(14, 0),
        time(18, 0), time(18, 30), time(19, 0), time(19, 30), time(20, 0),
        time(20, 30), time(21, 0),
    ]

    STATUSES = ["confirmed"] * 10 + ["pending"] * 3 + ["seated"] * 2
    SOURCES = ["online"] * 8 + ["phone"] * 5 + ["walk_in"] * 2

    today = date.today()
    tomorrow = today + timedelta(days=1)
    created = 0
    guest_pool = GUEST_NAMES.copy()
    random.shuffle(guest_pool)

    for target_date in (today, tomorrow):
        slots = SLOT_TIMES.copy()
        random.shuffle(slots)
        for i in range(15):
            name = guest_pool[(created) % len(guest_pool)]
            slot = slots[i % len(slots)]
            party = random.randint(1, 6)
            status = STATUSES[i % len(STATUSES)]
            source = SOURCES[i % len(SOURCES)]
            r = Reservation(
                restaurant_id=restaurant.id,
                guest_name=name,
                guest_email=f"{name.lower().replace(' ', '.')}@example.com",
                guest_phone=f"+49 {random.randint(150,179)} {random.randint(1000000,9999999)}",
                party_size=party,
                reservation_date=target_date,
                start_time=slot,
                duration_min=90,
                status=status,
                source=source,
                special_requests=None,
                notes="__seed__",
                payment_status="pending",
            )
            db.add(r)
            created += 1

    await db.commit()
    logger.info("seed_reservations completed: %d reservations inserted", created)
    return {
        "status": "ok",
        "created": created,
        "today": str(today),
        "tomorrow": str(tomorrow),
        "restaurant_id": restaurant.id,
    }


@router.post("/admin/seed-hotel-bookings", tags=["Bootstrap"])
async def seed_hotel_bookings(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_check_secret),
):
    """
    Seed 15 hotel room bookings checking in today and 15 checking in tomorrow.
    Idempotent — clears previous seed rows (notes='__seed__') first.
    """
    import traceback as _tb
    try:
        return await _do_seed_hotel_bookings(db)
    except Exception as exc:
        logger.exception("seed_hotel_bookings failed")
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}\n{_tb.format_exc()[-800:]}")


async def _do_seed_hotel_bookings(db: AsyncSession):
    # Get hotel property
    prop_result = await db.execute(select(HotelProperty).order_by(HotelProperty.id).limit(1))
    prop = prop_result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="No hotel property — run /api/admin/bootstrap first")

    # Get room types
    rt_result = await db.execute(select(RoomType).where(RoomType.property_id == prop.id))
    room_types = rt_result.scalars().all()
    if not room_types:
        raise HTTPException(status_code=404, detail="No room types found — run /api/admin/bootstrap first")

    # Get bookable rooms for assignment (exclude Tagung/non-bookable)
    rooms_result = await db.execute(
        select(Room).where(Room.property_id == prop.id).order_by(Room.room_number)
    )
    all_rooms = rooms_result.scalars().all()
    bookable_rooms = [r for r in all_rooms if normalize_room_category(
        next((rt.name for rt in room_types if rt.id == r.room_type_id), "")
    ) not in ("tagung", None) or True]
    # Filter to only rooms whose category is bookable
    bookable_rooms = [
        r for r in all_rooms
        if r.room_number not in ("T1", "V1")
    ]

    # Clear previous seed bookings
    await db.execute(
        delete(HotelReservation).where(
            HotelReservation.property_id == prop.id,
            HotelReservation.notes == "__seed__",
        )
    )

    GUEST_NAMES = [
        ("Herr", "Klaus Bergmann"), ("Frau", "Sabine Müller"), ("Herr", "Marco Richter"),
        ("Frau", "Julia Hoffmann"), ("Herr", "Stefan Weber"), ("Frau", "Anna Fischer"),
        ("Herr", "Felix Braun"), ("Frau", "Maria Schäfer"), ("Herr", "Lukas Zimmermann"),
        ("Frau", "Laura Neumann"), ("Herr", "Tobias Keller"), ("Frau", "Christina Wolf"),
        ("Herr", "Daniel Lange"), ("Frau", "Katharina Groß"), ("Herr", "Patrick Schulz"),
        ("Frau", "Emma Koch"), ("Herr", "Jonas Huber"), ("Frau", "Sophie Bauer"),
        ("Herr", "Maximilian Lorenz"), ("Frau", "Hannah Meyer"),
    ]

    STATUSES = ["confirmed"] * 10 + ["pending"] * 3 + ["confirmed"] * 2
    SOURCES = ["Booking.com"] * 5 + ["Phone"] * 5 + ["Walk-In"] * 3 + ["Direct"] * 2

    today = date.today()
    tomorrow = today + timedelta(days=1)
    created = 0
    idx = 0

    # Use bookable rooms for cycling; fall back to room_types if no rooms synced yet
    room_cycle = bookable_rooms if bookable_rooms else []

    for check_in_date in (today, tomorrow):
        for i in range(15):
            anrede, name = GUEST_NAMES[idx % len(GUEST_NAMES)]
            # Pick a room from the cycle (if rooms exist), derive rt from it
            assigned_room: Room | None = room_cycle[idx % len(room_cycle)] if room_cycle else None
            if assigned_room is not None:
                rt = next((r for r in room_types if r.id == assigned_room.room_type_id), room_types[idx % len(room_types)])
            else:
                rt = room_types[idx % len(room_types)]
            nights = random.randint(1, 5)
            check_out_date = check_in_date + timedelta(days=nights)
            adults = random.randint(1, min(2, rt.max_occupancy))
            children = random.randint(0, max(0, rt.max_occupancy - adults - 1))
            nightly = rt.base_price
            total = round(nightly * nights, 2)
            status = STATUSES[i % len(STATUSES)]
            source = SOURCES[i % len(SOURCES)]
            first = name.split()[0].lower()
            last = name.split()[-1].lower()
            booking_id = f"SEED-{check_in_date.strftime('%m%d')}-{idx:03d}"

            r = HotelReservation(
                property_id=prop.id,
                guest_name=name,
                guest_email=f"{first}.{last}@example.com",
                guest_phone=f"+49 {random.randint(150,179)} {random.randint(1000000,9999999)}",
                check_in=check_in_date,
                check_out=check_out_date,
                status=status,
                total_amount=total,
                currency=prop.currency or "EUR",
                notes="__seed__",
                room_type_id=rt.id,
                room_type_label=rt.name,
                payment_status="pending" if status == "pending" else "paid",
                booking_id=booking_id,
                anrede=anrede,
                adults=adults,
                children=children,
                booking_source=source,
                zahlungs_methode="Kreditkarte" if source != "Walk-In" else "Bar",
                zahlungs_status="bezahlt" if status == "confirmed" else "offen",
                room=assigned_room.room_number if assigned_room else None,
            )
            db.add(r)
            await db.flush()  # get r.id

            # Create stay
            stay = HotelStay(
                property_id=prop.id,
                reservation_id=r.id,
                planned_check_in=check_in_date,
                planned_check_out=check_out_date,
                status="booked",
                notes="__seed__",
            )
            db.add(stay)
            await db.flush()  # get stay.id

            # Create folio
            folio_number = f"F-{check_in_date.strftime('%m%d')}-{idx:03d}"
            is_paid = status == "confirmed"
            folio = HotelFolio(
                property_id=prop.id,
                stay_id=stay.id,
                reservation_id=r.id,
                folio_number=folio_number,
                currency=prop.currency or "EUR",
                status="closed" if is_paid else "open",
                subtotal=round(total / 1.07, 2),
                tax_amount=round(total - total / 1.07, 2),
                discount_amount=0.0,
                total=total,
                balance_due=0.0 if is_paid else total,
            )
            db.add(folio)
            await db.flush()  # get folio.id

            # Create invoice
            from datetime import timezone as _tz
            invoice_number = f"INV-{check_in_date.strftime('%Y%m%d')}-{idx:03d}"
            invoice = HotelInvoice(
                property_id=prop.id,
                reservation_id=r.id,
                stay_id=stay.id,
                folio_id=folio.id,
                invoice_number=invoice_number,
                status="issued" if is_paid else "draft",
                currency=prop.currency or "EUR",
                recipient_name=name,
                recipient_email=f"{first}.{last}@example.com",
                issued_at=__import__('datetime').datetime.now(_tz.utc) if is_paid else None,
            )
            db.add(invoice)

            created += 1
            idx += 1

    await db.commit()
    logger.info("seed_hotel_bookings completed: %d bookings with stays/folios/invoices inserted", created)
    return {
        "status": "ok",
        "created": created,
        "check_in_today": str(today),
        "check_in_tomorrow": str(tomorrow),
        "property_id": prop.id,
    }
