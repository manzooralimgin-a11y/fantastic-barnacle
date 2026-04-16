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
from app.hms.models import HotelProperty, RoomType, Room
from app.hms.rbac import ensure_hotel_rbac_bootstrap
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

        # Room types
        types_spec = [
            {"name": "Standard Single", "base_occupancy": 1, "max_occupancy": 1, "base_price": 89.0},
            {"name": "Standard Double", "base_occupancy": 2, "max_occupancy": 2, "base_price": 129.0},
            {"name": "Deluxe River View", "base_occupancy": 2, "max_occupancy": 3, "base_price": 189.0},
            {"name": "The Elb Suite", "base_occupancy": 2, "max_occupancy": 4, "base_price": 349.0},
        ]
        room_types = []
        for ts in types_spec:
            rt = RoomType(property_id=prop.id, **ts)
            db.add(rt)
            room_types.append(rt)
        await db.flush()
        log.append(f"Created {len(room_types)} room types")

        # Rooms
        room_specs = [
            (room_types[0].id, "101"), (room_types[0].id, "102"), (room_types[0].id, "103"),
            (room_types[1].id, "201"), (room_types[1].id, "202"), (room_types[1].id, "203"),
            (room_types[2].id, "301"), (room_types[2].id, "302"),
            (room_types[3].id, "401"),
        ]
        for rt_id, num in room_specs:
            db.add(Room(property_id=prop.id, room_type_id=rt_id, room_number=num, status="clean"))
        await db.flush()
        log.append(f"Created {len(room_specs)} rooms")
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
