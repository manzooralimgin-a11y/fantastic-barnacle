"""Seed script: creates the default restaurant and admin user.

Usage (from workspace root):
  PYTHONPATH=/home/runner/workspace/backend python backend/scripts/seed.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select

from app.auth.models import Restaurant, User, UserRole
from app.auth.utils import hash_password
from app.database import async_session
from app.hms.rbac import ensure_hotel_rbac_bootstrap


RESTAURANT = {
    "name": "Gestronomy Demo",
    "address": "1 Forest Lane",
    "city": "New York",
    "state": "NY",
    "zip_code": "10001",
    "phone": "+1-212-000-0000",
    "timezone": "America/New_York",
    "currency": "EUR",
}

ADMIN = {
    "email": os.environ.get("LOCAL_ADMIN_EMAIL", "local-admin@gestronomy.app"),
    "password": os.environ.get("LOCAL_ADMIN_PASSWORD", "LocalAdmin1234!"),
    "full_name": os.environ.get("LOCAL_ADMIN_FULL_NAME", "Local Validation Admin"),
    "role": UserRole.admin,
}
FORCE_PASSWORD_RESET = os.environ.get("LOCAL_ADMIN_FORCE_PASSWORD_RESET", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


async def seed() -> None:
    async with async_session() as db:
        result = await db.execute(select(Restaurant))
        restaurant = result.scalars().first()
        if restaurant is None:
            restaurant = Restaurant(**RESTAURANT)
            db.add(restaurant)
            await db.flush()
            print(f"Created restaurant: {restaurant.name} (id={restaurant.id})")
        else:
            print(f"Restaurant already exists: {restaurant.name} (id={restaurant.id})")

        result = await db.execute(select(User).where(User.email == ADMIN["email"]))
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                email=ADMIN["email"],
                password_hash=hash_password(ADMIN["password"]),
                full_name=ADMIN["full_name"],
                role=ADMIN["role"],
                restaurant_id=restaurant.id,
                is_active=True,
            )
            db.add(user)
            print(f"Created admin user: {user.email}")
        else:
            user.full_name = ADMIN["full_name"]
            user.role = ADMIN["role"]
            user.restaurant_id = restaurant.id
            user.is_active = True
            if FORCE_PASSWORD_RESET:
                user.password_hash = hash_password(ADMIN["password"])
                print(f"Reset admin user credentials: {user.email}")
            else:
                print(f"Admin user already exists, preserving password: {user.email}")

        await db.flush()
        await ensure_hotel_rbac_bootstrap(db)
        await db.commit()
        print("Seed complete.")
        print(f"  Login: {ADMIN['email']} / {ADMIN['password']}")


if __name__ == "__main__":
    asyncio.run(seed())
