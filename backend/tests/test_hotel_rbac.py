from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant, User, UserRole
from app.auth.utils import hash_password
from app.hms.models import (
    HotelPermission,
    HotelProperty,
    HotelRole,
    HotelRolePermission,
    HotelUserPropertyRole,
    Room,
    RoomType,
)


@pytest.mark.asyncio(loop_scope="session")
async def test_auth_me_includes_hotel_property_context(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    restaurant = Restaurant(
        name="RBAC Restaurant",
        address="Example 1",
        city="Berlin",
        state="BE",
        zip_code="10115",
        phone="+49 30 000000",
    )
    db_session.add(restaurant)
    await db_session.flush()

    property_record = HotelProperty(
        name="DAS ELB RBAC",
        address="River 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    role = (await db_session.execute(select(HotelRole).where(HotelRole.code == "hotel_manager"))).scalar_one_or_none()
    if role is None:
        role = HotelRole(code="hotel_manager", name="Hotel Manager")
        db_session.add(role)
        await db_session.flush()

    perm_dashboard = (
        await db_session.execute(select(HotelPermission).where(HotelPermission.code == "hotel.dashboard"))
    ).scalar_one_or_none()
    if perm_dashboard is None:
        perm_dashboard = HotelPermission(code="hotel.dashboard", name="Dashboard")
        db_session.add(perm_dashboard)
        await db_session.flush()

    perm_front_desk = (
        await db_session.execute(select(HotelPermission).where(HotelPermission.code == "hotel.front_desk"))
    ).scalar_one_or_none()
    if perm_front_desk is None:
        perm_front_desk = HotelPermission(code="hotel.front_desk", name="Front Desk")
        db_session.add(perm_front_desk)
        await db_session.flush()

    existing_pairs = {
        (item.role_id, item.permission_id)
        for item in (
            await db_session.execute(select(HotelRolePermission).where(HotelRolePermission.role_id == role.id))
        ).scalars().all()
    }
    for permission in (perm_dashboard, perm_front_desk):
        if (role.id, permission.id) not in existing_pairs:
            db_session.add(HotelRolePermission(role_id=role.id, permission_id=permission.id))

    user = User(
        email="hotel-rbac@example.com",
        password_hash=hash_password("StrongPassword123!"),
        full_name="Hotel RBAC User",
        role=UserRole.manager,
        is_active=True,
        restaurant_id=restaurant.id,
        active_property_id=property_record.id,
    )
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        HotelUserPropertyRole(
            user_id=user.id,
            property_id=property_record.id,
            role_id=role.id,
        )
    )
    await db_session.flush()

    login_response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "StrongPassword123!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    payload = me_response.json()
    assert payload["active_property_id"] == property_record.id
    assert payload["hotel_roles"] == ["hotel_manager"]
    assert "hotel.dashboard" in payload["hotel_permissions"]
    assert "hotel.front_desk" in payload["hotel_permissions"]
    assert payload["hotel_properties"] == [
        {
            "property_id": property_record.id,
            "property_name": property_record.name,
            "role_codes": ["hotel_manager"],
            "permissions": payload["hotel_permissions"],
        }
    ]


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_session_context_returns_scoped_hotel_permissions(
    client: AsyncClient,
) -> None:
    response = await client.get(
        "/api/hms/session/context",
        headers={
            "x-test-property-id": "546",
            "x-test-hotel-property-ids": "546,777",
            "x-test-hotel-permissions": "hotel.dashboard,hotel.front_desk,hotel.reservations",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["active_property_id"] == 546
    assert payload["hotel_permissions"] == [
        "hotel.dashboard",
        "hotel.front_desk",
        "hotel.reservations",
    ]
    assert {item["property_id"] for item in payload["hotel_properties"]} == {546, 777}


@pytest.mark.asyncio(loop_scope="session")
async def test_hms_rooms_forbidden_for_unauthorized_property(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    property_a = HotelProperty(
        name="Scoped A",
        address="A Street 1",
        city="Magdeburg",
        country="DE",
    )
    property_b = HotelProperty(
        name="Scoped B",
        address="B Street 1",
        city="Magdeburg",
        country="DE",
    )
    db_session.add_all([property_a, property_b])
    await db_session.flush()

    room_type_a = RoomType(
        property_id=property_a.id,
        name="Komfort",
        base_occupancy=2,
        max_occupancy=2,
        base_price=99.0,
    )
    db_session.add(room_type_a)
    await db_session.flush()

    db_session.add(
        Room(
            property_id=property_a.id,
            room_number="203",
            room_type_id=room_type_a.id,
            status="available",
        )
    )
    await db_session.flush()

    response = await client.get(
        f"/api/hms/rooms?property_id={property_b.id}",
        headers={
            "x-test-property-id": str(property_a.id),
            "x-test-hotel-property-ids": str(property_a.id),
            "x-test-hotel-permissions": "hotel.dashboard",
        },
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "User does not have access to the requested hotel property"


@pytest.mark.asyncio(loop_scope="session")
async def test_auth_me_bootstraps_hotel_rbac_when_tables_are_empty(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    restaurant = Restaurant(
        name="Bootstrap Restaurant",
        address="Bootstrap 1",
        city="Berlin",
        state="BE",
        zip_code="10115",
        phone="+49 30 123456",
    )
    db_session.add(restaurant)
    await db_session.flush()

    property_record = HotelProperty(
        name="Bootstrap Hotel",
        address="River 2",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    user = User(
        email="bootstrap-rbac@example.com",
        password_hash=hash_password("StrongPassword123!"),
        full_name="Bootstrap RBAC User",
        role=UserRole.admin,
        is_active=True,
        restaurant_id=restaurant.id,
    )
    db_session.add(user)
    await db_session.commit()

    login_response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "StrongPassword123!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    payload = me_response.json()
    assert payload["active_property_id"] is not None
    assert "hotel.dashboard" in payload["hotel_permissions"]
    assert payload["hotel_properties"]


@pytest.mark.asyncio(loop_scope="session")
async def test_auth_me_repairs_staff_finance_permissions_for_existing_hotel_role(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    restaurant = Restaurant(
        name="Finance Repair Restaurant",
        address="Finance 1",
        city="Berlin",
        state="BE",
        zip_code="10115",
        phone="+49 30 222222",
    )
    db_session.add(restaurant)
    await db_session.flush()

    property_record = HotelProperty(
        name="Finance Repair Hotel",
        address="River 9",
        city="Magdeburg",
        country="DE",
    )
    db_session.add(property_record)
    await db_session.flush()

    role = (await db_session.execute(select(HotelRole).where(HotelRole.code == "hotel_staff"))).scalar_one_or_none()
    if role is None:
        role = HotelRole(code="hotel_staff", name="Hotel Staff")
        db_session.add(role)
        await db_session.flush()

    dashboard_permission = (
        await db_session.execute(select(HotelPermission).where(HotelPermission.code == "hotel.dashboard"))
    ).scalar_one_or_none()
    if dashboard_permission is None:
        dashboard_permission = HotelPermission(code="hotel.dashboard", name="Dashboard")
        db_session.add(dashboard_permission)
        await db_session.flush()

    existing_pair = (
        await db_session.execute(
            select(HotelRolePermission).where(
                HotelRolePermission.role_id == role.id,
                HotelRolePermission.permission_id == dashboard_permission.id,
            )
        )
    ).scalar_one_or_none()
    if existing_pair is None:
        db_session.add(HotelRolePermission(role_id=role.id, permission_id=dashboard_permission.id))

    user = User(
        email="staff-finance-rbac@example.com",
        password_hash=hash_password("StrongPassword123!"),
        full_name="Staff Finance RBAC User",
        role=UserRole.staff,
        is_active=True,
        restaurant_id=restaurant.id,
        active_property_id=property_record.id,
    )
    db_session.add(user)
    await db_session.flush()

    db_session.add(
        HotelUserPropertyRole(
            user_id=user.id,
            property_id=property_record.id,
            role_id=role.id,
        )
    )
    await db_session.commit()

    login_response = await client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "StrongPassword123!"},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]

    me_response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_response.status_code == 200
    payload = me_response.json()
    assert payload["hotel_roles"] == ["hotel_staff"]
    assert "hotel.finance" in payload["hotel_permissions"]
    assert "hotel.folio" not in payload["hotel_permissions"]
