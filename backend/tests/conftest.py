from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import date, datetime, timezone
import time as time_module
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant, UserRole
from app.billing.models import TableOrder
from app.database import engine
from app.dependencies import get_current_tenant_user, get_optional_current_tenant_user
from app.email_inbox.models import EmailThread
from app.guests.models import GuestProfile
from app.inventory.models import InventoryItem, Vendor
from app.main import app
from app.menu.models import MenuCategory, MenuItem
from app.reservations.models import FloorSection, Reservation, Table
from app.security import rate_limit
from app.security.rate_limit import reset_rate_limit_counters


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(autouse=True)
async def isolate_rate_limit_counters() -> AsyncGenerator[None, None]:
    await reset_rate_limit_counters()
    try:
        yield
    finally:
        await reset_rate_limit_counters()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def ensure_test_schema_compatibility() -> AsyncGenerator[None, None]:
    """Keep the shared test database aligned with the current voucher model.

    The backend tests run against a reusable local database in this workspace, so
    they may encounter a schema that predates the latest idempotent Alembic head.
    Apply the last safe voucher compatibility columns up front so the suite can
    exercise the current code without mutating feature logic.
    """

    async with engine.begin() as connection:
        await connection.exec_driver_sql(
            "ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_gift_card BOOLEAN NOT NULL DEFAULT FALSE"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS purchaser_name VARCHAR(255)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS email_threads (
                id SERIAL PRIMARY KEY,
                external_email_id VARCHAR(255) NOT NULL UNIQUE,
                sender VARCHAR(255) NOT NULL,
                subject VARCHAR(500),
                body TEXT NOT NULL,
                received_at TIMESTAMPTZ NOT NULL,
                raw_email JSON NOT NULL,
                category VARCHAR(20) NOT NULL DEFAULT 'pending',
                classification_confidence DOUBLE PRECISION,
                extracted_data JSON,
                summary VARCHAR(500),
                reply_generated BOOLEAN NOT NULL DEFAULT FALSE,
                reply_sent BOOLEAN NOT NULL DEFAULT FALSE,
                reply_content TEXT,
                reply_generated_at TIMESTAMPTZ,
                reply_sent_at TIMESTAMPTZ,
                replied_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                reply_mode VARCHAR(20) NOT NULL DEFAULT 'generate_only',
                processing_error TEXT,
                reply_error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_received_at ON email_threads (received_at)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_category ON email_threads (category)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_status ON email_threads (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_category_status ON email_threads (category, status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_reply_sent ON email_threads (reply_sent)"
        )
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        try:
            yield db_session
        finally:
            pass

    async def override_get_current_tenant(request: Request):
        tenant_header = request.headers.get("x-test-restaurant-id")
        role_header = (request.headers.get("x-test-role") or UserRole.manager.value).lower()
        restaurant_id = int(tenant_header) if tenant_header else 0
        role = UserRole(role_header)
        return SimpleNamespace(
            id=999_999,
            email="tenant-test@example.com",
            is_active=True,
            restaurant_id=restaurant_id,
            role=role,
        )

    from app.database import get_db

    async def failing_redis():
        raise RuntimeError("redis disabled in tests")

    original_get_redis = rate_limit.get_redis
    rate_limit.get_redis = failing_redis
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_tenant_user] = override_get_current_tenant
    app.dependency_overrides[get_optional_current_tenant_user] = override_get_current_tenant
    await reset_rate_limit_counters()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client

    await reset_rate_limit_counters()
    rate_limit.get_redis = original_get_redis
    app.dependency_overrides.clear()


class InMemoryRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expiries: dict[str, float] = {}

    def _purge_expired(self, key: str) -> None:
        expires_at = self.expiries.get(key)
        if expires_at is not None and expires_at <= time_module.monotonic():
            self.values.pop(key, None)
            self.expiries.pop(key, None)

    async def get(self, key: str) -> str | None:
        self._purge_expired(key)
        return self.values.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        nx: bool | None = None,
    ) -> bool:
        self._purge_expired(key)
        if nx and key in self.values:
            return False
        self.values[key] = value
        if ex is not None:
            self.expiries[key] = time_module.monotonic() + ex
        else:
            self.expiries.pop(key, None)
        return True

    async def incr(self, key: str) -> int:
        current = int(await self.get(key) or "0") + 1
        self.values[key] = str(current)
        return current

    async def expire(self, key: str, seconds: int) -> bool:
        self.expiries[key] = time_module.monotonic() + seconds
        return True

    async def ttl(self, key: str) -> int:
        self._purge_expired(key)
        expires_at = self.expiries.get(key)
        if expires_at is None:
            return -1
        return max(int(expires_at - time_module.monotonic()), 0)

    async def mget(self, keys: list[str]) -> list[str | None]:
        return [await self.get(key) for key in keys]

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            existed = key in self.values
            self.values.pop(key, None)
            self.expiries.pop(key, None)
            deleted += int(existed)
        return deleted

    async def scan_iter(self, match: str):
        prefix = match[:-1] if match.endswith("*") else match
        for key in list(self.values.keys()):
            self._purge_expired(key)
            if key.startswith(prefix):
                yield key

    async def ping(self) -> bool:
        return True

    async def publish(self, channel: str, data: str) -> int:
        return 1


@pytest.fixture
def fake_shared_redis_backend() -> InMemoryRedis:
    return InMemoryRedis()


@dataclass
class TenantSeed:
    restaurant_a_id: int
    restaurant_b_id: int
    menu_item_a_id: int
    menu_item_b_id: int
    guest_a_id: int
    guest_b_id: int
    table_a_id: int
    table_b_id: int
    reservation_a_id: int
    reservation_b_id: int
    billing_order_a_id: int
    billing_order_b_id: int
    inventory_item_a_id: int
    inventory_item_b_id: int
    vendor_a_id: int
    vendor_b_id: int


@pytest_asyncio.fixture
async def tenant_seed(db_session: AsyncSession) -> TenantSeed:
    suffix = uuid4().hex[:8]

    restaurant_a = Restaurant(
        name=f"Tenant A {suffix}",
        address="100 A Street",
        city="A City",
        state="CA",
        zip_code="90001",
        phone=f"555100{suffix[:4]}",
    )
    restaurant_b = Restaurant(
        name=f"Tenant B {suffix}",
        address="200 B Street",
        city="B City",
        state="CA",
        zip_code="90002",
        phone=f"555200{suffix[:4]}",
    )
    db_session.add_all([restaurant_a, restaurant_b])
    await db_session.flush()

    cat_a = MenuCategory(name=f"Cat A {suffix}", restaurant_id=restaurant_a.id)
    cat_b = MenuCategory(name=f"Cat B {suffix}", restaurant_id=restaurant_b.id)
    db_session.add_all([cat_a, cat_b])
    await db_session.flush()

    menu_item_a = MenuItem(
        restaurant_id=restaurant_a.id,
        category_id=cat_a.id,
        name=f"Menu A {suffix}",
        price=12.50,
        cost=5.00,
    )
    menu_item_b = MenuItem(
        restaurant_id=restaurant_b.id,
        category_id=cat_b.id,
        name=f"Menu B {suffix}",
        price=18.00,
        cost=7.00,
    )
    db_session.add_all([menu_item_a, menu_item_b])

    guest_a = GuestProfile(
        restaurant_id=restaurant_a.id,
        name=f"Guest A {suffix}",
        email=f"guest-a-{suffix}@example.com",
    )
    guest_b = GuestProfile(
        restaurant_id=restaurant_b.id,
        name=f"Guest B {suffix}",
        email=f"guest-b-{suffix}@example.com",
    )
    db_session.add_all([guest_a, guest_b])

    section_a = FloorSection(name=f"Section A {suffix}", restaurant_id=restaurant_a.id)
    section_b = FloorSection(name=f"Section B {suffix}", restaurant_id=restaurant_b.id)
    db_session.add_all([section_a, section_b])
    await db_session.flush()

    table_a = Table(
        restaurant_id=restaurant_a.id,
        section_id=section_a.id,
        table_number=f"A-{suffix[:4]}",
        capacity=4,
    )
    table_b = Table(
        restaurant_id=restaurant_b.id,
        section_id=section_b.id,
        table_number=f"B-{suffix[:4]}",
        capacity=4,
    )
    db_session.add_all([table_a, table_b])
    await db_session.flush()

    reservation_a = Reservation(
        restaurant_id=restaurant_a.id,
        guest_id=guest_a.id,
        guest_name=guest_a.name or "Guest A",
        table_id=table_a.id,
        party_size=2,
        reservation_date=date.today(),
        start_time=datetime.now(timezone.utc).time().replace(microsecond=0),
    )
    reservation_b = Reservation(
        restaurant_id=restaurant_b.id,
        guest_id=guest_b.id,
        guest_name=guest_b.name or "Guest B",
        table_id=table_b.id,
        party_size=2,
        reservation_date=date.today(),
        start_time=datetime.now(timezone.utc).time().replace(microsecond=0),
    )
    db_session.add_all([reservation_a, reservation_b])

    order_a = TableOrder(restaurant_id=restaurant_a.id, table_id=table_a.id, guest_name="Billing A")
    order_b = TableOrder(restaurant_id=restaurant_b.id, table_id=table_b.id, guest_name="Billing B")
    db_session.add_all([order_a, order_b])

    vendor_a = Vendor(restaurant_id=restaurant_a.id, name=f"Vendor A {suffix}")
    vendor_b = Vendor(restaurant_id=restaurant_b.id, name=f"Vendor B {suffix}")
    db_session.add_all([vendor_a, vendor_b])
    await db_session.flush()

    inv_a = InventoryItem(
        restaurant_id=restaurant_a.id,
        name=f"Inventory A {suffix}",
        category="Produce",
        unit="kg",
        vendor_id=vendor_a.id,
    )
    inv_b = InventoryItem(
        restaurant_id=restaurant_b.id,
        name=f"Inventory B {suffix}",
        category="Produce",
        unit="kg",
        vendor_id=vendor_b.id,
    )
    db_session.add_all([inv_a, inv_b])
    await db_session.flush()

    return TenantSeed(
        restaurant_a_id=restaurant_a.id,
        restaurant_b_id=restaurant_b.id,
        menu_item_a_id=menu_item_a.id,
        menu_item_b_id=menu_item_b.id,
        guest_a_id=guest_a.id,
        guest_b_id=guest_b.id,
        table_a_id=table_a.id,
        table_b_id=table_b.id,
        reservation_a_id=reservation_a.id,
        reservation_b_id=reservation_b.id,
        billing_order_a_id=order_a.id,
        billing_order_b_id=order_b.id,
        inventory_item_a_id=inv_a.id,
        inventory_item_b_id=inv_b.id,
        vendor_a_id=vendor_a.id,
        vendor_b_id=vendor_b.id,
    )
