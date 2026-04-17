from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.models import User, UserRole
from app.hms.models import (
    HotelPermission,
    HotelProperty,
    HotelRole,
    HotelRolePermission,
    HotelUserPropertyRole,
)

HOTEL_PERMISSION_DASHBOARD = "hotel.dashboard"
HOTEL_PERMISSION_FRONT_DESK = "hotel.front_desk"
HOTEL_PERMISSION_RESERVATIONS = "hotel.reservations"
HOTEL_PERMISSION_FOLIO = "hotel.folio"
HOTEL_PERMISSION_HOUSEKEEPING = "hotel.housekeeping"
HOTEL_PERMISSION_REPORTS = "hotel.reports"
HOTEL_PERMISSION_DOCUMENTS = "hotel.documents"
HOTEL_PERMISSION_SETTINGS = "hotel.settings"
HOTEL_PERMISSION_RATE_MANAGEMENT = "hotel.rate_management"
HOTEL_PERMISSION_MAINTENANCE = "hotel.maintenance"
HOTEL_PERMISSION_INVENTORY = "hotel.inventory"
HOTEL_PERMISSION_CRM = "hotel.crm"
HOTEL_PERMISSION_MARKETING = "hotel.marketing"
HOTEL_PERMISSION_EMAIL_INBOX = "hotel.email_inbox"
HOTEL_PERMISSION_CHANNELS = "hotel.channels"
HOTEL_PERMISSION_ANALYTICS = "hotel.analytics"
HOTEL_PERMISSION_FINANCE = "hotel.finance"
HOTEL_PERMISSION_SECURITY = "hotel.security"
HOTEL_PERMISSION_AGENTS = "hotel.agents"
HOTEL_PERMISSION_COMMS = "hotel.comms"

HOTEL_PERMISSION_DEFINITIONS: tuple[tuple[str, str, str], ...] = (
    (HOTEL_PERMISSION_DASHBOARD, "Dashboard", "View hotel overview and room status."),
    (HOTEL_PERMISSION_FRONT_DESK, "Front Desk", "Operate arrivals, departures, and front desk actions."),
    (HOTEL_PERMISSION_RESERVATIONS, "Reservations", "View and manage hotel reservations."),
    (HOTEL_PERMISSION_FOLIO, "Folio", "View and manage hotel folios and payment posting."),
    (HOTEL_PERMISSION_HOUSEKEEPING, "Housekeeping", "View and manage housekeeping status."),
    (HOTEL_PERMISSION_REPORTS, "Reports", "Access hotel reporting and analytics."),
    (HOTEL_PERMISSION_DOCUMENTS, "Documents", "Generate and manage hotel documents."),
    (HOTEL_PERMISSION_SETTINGS, "Settings", "Manage hotel settings and configuration."),
    (HOTEL_PERMISSION_RATE_MANAGEMENT, "Rate Management", "Manage hotel rates and rate controls."),
    (HOTEL_PERMISSION_MAINTENANCE, "Maintenance", "Access hotel maintenance workflows."),
    (HOTEL_PERMISSION_INVENTORY, "Inventory", "Access hotel inventory workflows."),
    (HOTEL_PERMISSION_CRM, "CRM", "Access hotel CRM and guest profiles."),
    (HOTEL_PERMISSION_MARKETING, "Marketing", "Access hotel marketing workflows."),
    (HOTEL_PERMISSION_EMAIL_INBOX, "Email Inbox", "Access AI-filtered hotel inbox workflows."),
    (HOTEL_PERMISSION_CHANNELS, "Channels", "Access channel management features."),
    (HOTEL_PERMISSION_ANALYTICS, "Analytics", "Access hotel analytics features."),
    (HOTEL_PERMISSION_FINANCE, "Finance", "Access hotel finance workflows."),
    (HOTEL_PERMISSION_SECURITY, "Security", "Access hotel security workflows."),
    (HOTEL_PERMISSION_AGENTS, "Agents", "Access hotel AI agent management."),
    (HOTEL_PERMISSION_COMMS, "Communications", "Access hotel communication workflows."),
)

HOTEL_ROLE_DEFINITIONS: tuple[tuple[str, str, str], ...] = (
    ("hotel_staff", "Hotel Staff", "Operational hotel staff access."),
    ("hotel_manager", "Hotel Manager", "Hotel manager access."),
    ("hotel_admin", "Hotel Admin", "Hotel administrator access."),
)

DEFAULT_HOTEL_ROLE_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "hotel_staff": (
        HOTEL_PERMISSION_DASHBOARD,
        HOTEL_PERMISSION_FRONT_DESK,
        HOTEL_PERMISSION_RESERVATIONS,
        HOTEL_PERMISSION_HOUSEKEEPING,
        HOTEL_PERMISSION_DOCUMENTS,
        HOTEL_PERMISSION_FINANCE,
    ),
    "hotel_manager": (
        HOTEL_PERMISSION_DASHBOARD,
        HOTEL_PERMISSION_FRONT_DESK,
        HOTEL_PERMISSION_RESERVATIONS,
        HOTEL_PERMISSION_HOUSEKEEPING,
        HOTEL_PERMISSION_DOCUMENTS,
        HOTEL_PERMISSION_FINANCE,
        HOTEL_PERMISSION_FOLIO,
        HOTEL_PERMISSION_REPORTS,
        HOTEL_PERMISSION_RATE_MANAGEMENT,
        HOTEL_PERMISSION_MAINTENANCE,
        HOTEL_PERMISSION_INVENTORY,
        HOTEL_PERMISSION_CRM,
        HOTEL_PERMISSION_MARKETING,
        HOTEL_PERMISSION_EMAIL_INBOX,
        HOTEL_PERMISSION_CHANNELS,
        HOTEL_PERMISSION_ANALYTICS,
        HOTEL_PERMISSION_COMMS,
    ),
    "hotel_admin": tuple(code for code, _, _ in HOTEL_PERMISSION_DEFINITIONS),
}

LEGACY_USER_ROLE_TO_HOTEL_ROLE: dict[UserRole, str] = {
    UserRole.staff: "hotel_staff",
    UserRole.manager: "hotel_manager",
    UserRole.admin: "hotel_admin",
}


@dataclass(slots=True)
class HotelPropertyAccess:
    property_id: int
    property_name: str
    role_codes: tuple[str, ...]
    permissions: tuple[str, ...]


@dataclass(slots=True)
class HotelAccessContext:
    user: User
    active_property_id: int | None
    hotel_roles: tuple[str, ...]
    hotel_permissions: tuple[str, ...]
    properties: tuple[HotelPropertyAccess, ...]

    @property
    def property_ids(self) -> set[int]:
        return {item.property_id for item in self.properties}

    def resolve_property_id(self, requested_property_id: int | None) -> int | None:
        if requested_property_id is None:
            return self.active_property_id
        if requested_property_id not in self.property_ids:
            return None
        return requested_property_id


def hotel_permissions_for_legacy_role(role: UserRole | str) -> tuple[str, ...]:
    if isinstance(role, str):
        role_value = role
    else:
        role_value = role.value
    try:
        normalized_role = UserRole(role_value)
    except ValueError:
        normalized_role = UserRole.staff
    mapped = LEGACY_USER_ROLE_TO_HOTEL_ROLE.get(normalized_role, "hotel_staff")
    return DEFAULT_HOTEL_ROLE_PERMISSIONS.get(mapped, ())


def serialize_hotel_access_context(context: HotelAccessContext) -> dict:
    active_property = next(
        (property_item for property_item in context.properties if property_item.property_id == context.active_property_id),
        None,
    )
    return {
        "active_property_id": context.active_property_id,
        "active_property_name": active_property.property_name if active_property else None,
        "hotel_roles": list(context.hotel_roles),
        "hotel_permissions": list(context.hotel_permissions),
        "hotel_properties": [
            {
                "property_id": property_item.property_id,
                "property_name": property_item.property_name,
                "role_codes": list(property_item.role_codes),
                "permissions": list(property_item.permissions),
            }
            for property_item in context.properties
        ],
    }


def _role_permissions_need_sync(assignments: list[HotelUserPropertyRole]) -> bool:
    for assignment in assignments:
        role_record = assignment.role
        if role_record is None:
            continue
        expected_permissions = set(DEFAULT_HOTEL_ROLE_PERMISSIONS.get(role_record.code, ()))
        if not expected_permissions:
            continue
        actual_permissions = {
            role_permission.permission.code
            for role_permission in role_record.role_permissions
            if role_permission.permission is not None
        }
        if not expected_permissions.issubset(actual_permissions):
            return True
    return False


async def ensure_hotel_rbac_bootstrap(
    db: AsyncSession,
    *,
    users: list[User] | None = None,
) -> None:
    permission_result = await db.execute(select(HotelPermission))
    permissions_by_code = {permission.code: permission for permission in permission_result.scalars().all()}
    missing_permissions = [
        HotelPermission(code=code, name=name, description=description)
        for code, name, description in HOTEL_PERMISSION_DEFINITIONS
        if code not in permissions_by_code
    ]
    if missing_permissions:
        db.add_all(missing_permissions)
        await db.flush()
        permission_result = await db.execute(select(HotelPermission))
        permissions_by_code = {permission.code: permission for permission in permission_result.scalars().all()}

    role_result = await db.execute(select(HotelRole).options(selectinload(HotelRole.role_permissions)))
    roles_by_code = {role.code: role for role in role_result.scalars().all()}
    missing_roles = [
        HotelRole(code=code, name=name, description=description, is_system=True)
        for code, name, description in HOTEL_ROLE_DEFINITIONS
        if code not in roles_by_code
    ]
    if missing_roles:
        db.add_all(missing_roles)
        await db.flush()
        role_result = await db.execute(select(HotelRole).options(selectinload(HotelRole.role_permissions)))
        roles_by_code = {role.code: role for role in role_result.scalars().all()}

    existing_role_permission_pairs = {
        (role_permission.role_id, role_permission.permission_id)
        for role in roles_by_code.values()
        for role_permission in role.role_permissions
    }
    missing_role_permissions: list[HotelRolePermission] = []
    for role_code, permission_codes in DEFAULT_HOTEL_ROLE_PERMISSIONS.items():
        role = roles_by_code.get(role_code)
        if role is None:
            continue
        for permission_code in permission_codes:
            permission = permissions_by_code.get(permission_code)
            if permission is None:
                continue
            pair = (role.id, permission.id)
            if pair in existing_role_permission_pairs:
                continue
            missing_role_permissions.append(
                HotelRolePermission(role_id=role.id, permission_id=permission.id)
            )
            existing_role_permission_pairs.add(pair)
    if missing_role_permissions:
        db.add_all(missing_role_permissions)
        await db.flush()

    if users is None:
        user_result = await db.execute(select(User).order_by(User.id.asc()))
        target_users = user_result.scalars().all()
    else:
        target_users = users
    if not target_users:
        return

    property_result = await db.execute(select(HotelProperty).order_by(HotelProperty.id.asc()))
    properties = property_result.scalars().all()
    if not properties:
        return

    target_user_ids = [user.id for user in target_users if user.id is not None]
    if not target_user_ids:
        return

    assignment_result = await db.execute(
        select(HotelUserPropertyRole).where(HotelUserPropertyRole.user_id.in_(target_user_ids))
    )
    existing_assignment_keys = {
        (assignment.user_id, assignment.property_id, assignment.role_id)
        for assignment in assignment_result.scalars().all()
    }

    new_assignments: list[HotelUserPropertyRole] = []
    first_property_id = properties[0].id
    for user in target_users:
        mapped_role_code = LEGACY_USER_ROLE_TO_HOTEL_ROLE.get(user.role, "hotel_staff")
        mapped_role = roles_by_code.get(mapped_role_code)
        if mapped_role is None:
            continue
        for property_record in properties:
            assignment_key = (user.id, property_record.id, mapped_role.id)
            if assignment_key in existing_assignment_keys:
                continue
            new_assignments.append(
                HotelUserPropertyRole(
                    user_id=user.id,
                    property_id=property_record.id,
                    role_id=mapped_role.id,
                )
            )
            existing_assignment_keys.add(assignment_key)
        if user.active_property_id is None:
            user.active_property_id = first_property_id

    if new_assignments:
        db.add_all(new_assignments)
        await db.flush()


async def get_hotel_access_context(
    db: AsyncSession,
    user: User,
    *,
    preferred_property_id: int | None = None,
    persist_active_property: bool = False,
) -> HotelAccessContext:
    result = await db.execute(
        select(HotelUserPropertyRole)
        .options(
            selectinload(HotelUserPropertyRole.property),
            selectinload(HotelUserPropertyRole.role)
            .selectinload(HotelRole.role_permissions)
            .selectinload(HotelRolePermission.permission),
        )
        .where(HotelUserPropertyRole.user_id == user.id)
        .order_by(HotelUserPropertyRole.property_id.asc(), HotelUserPropertyRole.role_id.asc())
    )
    assignments = result.scalars().all()

    if not assignments or _role_permissions_need_sync(assignments):
        await ensure_hotel_rbac_bootstrap(db, users=[user])
        result = await db.execute(
            select(HotelUserPropertyRole)
            .options(
                selectinload(HotelUserPropertyRole.property),
                selectinload(HotelUserPropertyRole.role)
                .selectinload(HotelRole.role_permissions)
                .selectinload(HotelRolePermission.permission),
            )
            .where(HotelUserPropertyRole.user_id == user.id)
            .order_by(HotelUserPropertyRole.property_id.asc(), HotelUserPropertyRole.role_id.asc())
        )
        assignments = result.scalars().all()

    property_map: dict[int, dict[str, object]] = {}
    for assignment in assignments:
        property_record = assignment.property
        role_record = assignment.role
        if property_record is None or role_record is None:
            continue
        item = property_map.setdefault(
            property_record.id,
            {
                "property_name": property_record.name,
                "role_codes": set(),
                "permissions": set(),
            },
        )
        item["role_codes"].add(role_record.code)
        permission_codes = item["permissions"]
        for role_permission in role_record.role_permissions:
            if role_permission.permission is not None:
                permission_codes.add(role_permission.permission.code)

    properties = tuple(
        HotelPropertyAccess(
            property_id=property_id,
            property_name=str(data["property_name"]),
            role_codes=tuple(sorted(data["role_codes"])),
            permissions=tuple(sorted(data["permissions"])),
        )
        for property_id, data in sorted(property_map.items(), key=lambda entry: entry[0])
    )

    active_property_id = preferred_property_id if preferred_property_id in property_map else None
    if active_property_id is None and user.active_property_id in property_map:
        active_property_id = user.active_property_id
    if active_property_id is None and properties:
        active_property_id = properties[0].property_id

    if persist_active_property and user.active_property_id != active_property_id:
        user.active_property_id = active_property_id

    active_roles: tuple[str, ...] = ()
    active_permissions: tuple[str, ...] = ()
    if active_property_id is not None:
        active_property = next(
            property_item
            for property_item in properties
            if property_item.property_id == active_property_id
        )
        active_roles = active_property.role_codes
        active_permissions = active_property.permissions

    return HotelAccessContext(
        user=user,
        active_property_id=active_property_id,
        hotel_roles=active_roles,
        hotel_permissions=active_permissions,
        properties=properties,
    )


async def get_first_hotel_property_id(db: AsyncSession) -> int | None:
    result = await db.execute(select(HotelProperty.id).order_by(HotelProperty.id.asc()).limit(1))
    return result.scalar_one_or_none()
