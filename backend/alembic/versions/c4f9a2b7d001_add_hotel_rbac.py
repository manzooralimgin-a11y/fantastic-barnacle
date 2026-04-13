"""add_hotel_rbac

Revision ID: c4f9a2b7d001
Revises: 8378c8dce28c, f5a1b2c3d4e5, d4e5f6g7h8i9, 6d4f8c1e2a30, a1b2c3d4e5f6, 7a5db2f9da1f
Create Date: 2026-04-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f9a2b7d001"
down_revision: Union[str, Sequence[str], None] = (
    "8378c8dce28c",
    "f5a1b2c3d4e5",
    "d4e5f6g7h8i9",
    "6d4f8c1e2a30",
    "a1b2c3d4e5f6",
    "7a5db2f9da1f",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PERMISSIONS = [
    ("hotel.dashboard", "Dashboard", "View hotel overview and room status."),
    ("hotel.front_desk", "Front Desk", "Operate arrivals, departures, and front desk actions."),
    ("hotel.reservations", "Reservations", "View and manage hotel reservations."),
    ("hotel.folio", "Folio", "View and manage hotel folios and payment posting."),
    ("hotel.housekeeping", "Housekeeping", "View and manage housekeeping status."),
    ("hotel.reports", "Reports", "Access hotel reporting and analytics."),
    ("hotel.documents", "Documents", "Generate and manage hotel documents."),
    ("hotel.settings", "Settings", "Manage hotel settings and configuration."),
    ("hotel.rate_management", "Rate Management", "Manage hotel rates and rate controls."),
    ("hotel.maintenance", "Maintenance", "Access hotel maintenance workflows."),
    ("hotel.inventory", "Inventory", "Access hotel inventory workflows."),
    ("hotel.crm", "CRM", "Access hotel CRM and guest profiles."),
    ("hotel.marketing", "Marketing", "Access hotel marketing workflows."),
    ("hotel.email_inbox", "Email Inbox", "Access AI-filtered hotel inbox workflows."),
    ("hotel.channels", "Channels", "Access channel management features."),
    ("hotel.analytics", "Analytics", "Access hotel analytics features."),
    ("hotel.finance", "Finance", "Access hotel finance workflows."),
    ("hotel.security", "Security", "Access hotel security workflows."),
    ("hotel.agents", "Agents", "Access hotel AI agent management."),
    ("hotel.comms", "Communications", "Access hotel communication workflows."),
]

ROLES = [
    ("hotel_staff", "Hotel Staff", "Operational hotel staff access."),
    ("hotel_manager", "Hotel Manager", "Hotel manager access."),
    ("hotel_admin", "Hotel Admin", "Hotel administrator access."),
]

ROLE_PERMISSIONS = {
    "hotel_staff": (
        "hotel.dashboard",
        "hotel.front_desk",
        "hotel.reservations",
        "hotel.housekeeping",
        "hotel.documents",
    ),
    "hotel_manager": (
        "hotel.dashboard",
        "hotel.front_desk",
        "hotel.reservations",
        "hotel.housekeeping",
        "hotel.documents",
        "hotel.folio",
        "hotel.reports",
        "hotel.rate_management",
        "hotel.maintenance",
        "hotel.inventory",
        "hotel.crm",
        "hotel.marketing",
        "hotel.email_inbox",
        "hotel.channels",
        "hotel.analytics",
        "hotel.comms",
    ),
    "hotel_admin": tuple(code for code, _, _ in PERMISSIONS),
}

LEGACY_ROLE_MAP = {
    "staff": "hotel_staff",
    "manager": "hotel_manager",
    "admin": "hotel_admin",
}


def upgrade() -> None:
    op.add_column("users", sa.Column("active_property_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_users_active_property_id_hms_properties",
        "users",
        "hms_properties",
        ["active_property_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_users_active_property_id"), "users", ["active_property_id"], unique=False)

    op.create_table(
        "hms_roles",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hms_roles_code"), "hms_roles", ["code"], unique=True)

    op.create_table(
        "hms_permissions",
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hms_permissions_code"), "hms_permissions", ["code"], unique=True)

    op.create_table(
        "hms_role_permissions",
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("permission_id", sa.Integer(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["permission_id"], ["hms_permissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["hms_roles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "permission_id", name="uq_hms_role_permission"),
    )
    op.create_index(op.f("ix_hms_role_permissions_permission_id"), "hms_role_permissions", ["permission_id"], unique=False)
    op.create_index(op.f("ix_hms_role_permissions_role_id"), "hms_role_permissions", ["role_id"], unique=False)

    op.create_table(
        "hms_user_property_roles",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("role_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by_user_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["role_id"], ["hms_roles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "property_id", "role_id", name="uq_hms_user_property_role"),
    )
    op.create_index(op.f("ix_hms_user_property_roles_property_id"), "hms_user_property_roles", ["property_id"], unique=False)
    op.create_index(op.f("ix_hms_user_property_roles_role_id"), "hms_user_property_roles", ["role_id"], unique=False)
    op.create_index(op.f("ix_hms_user_property_roles_user_id"), "hms_user_property_roles", ["user_id"], unique=False)

    bind = op.get_bind()
    permission_table = sa.table(
        "hms_permissions",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
    )
    role_table = sa.table(
        "hms_roles",
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("is_system", sa.Boolean()),
    )
    role_permission_table = sa.table(
        "hms_role_permissions",
        sa.column("role_id", sa.Integer()),
        sa.column("permission_id", sa.Integer()),
    )

    op.bulk_insert(
        permission_table,
        [{"code": code, "name": name, "description": description} for code, name, description in PERMISSIONS],
    )
    op.bulk_insert(
        role_table,
        [{"code": code, "name": name, "description": description, "is_system": True} for code, name, description in ROLES],
    )

    permission_ids = dict(bind.execute(sa.text("SELECT code, id FROM hms_permissions")).all())
    role_ids = dict(bind.execute(sa.text("SELECT code, id FROM hms_roles")).all())
    op.bulk_insert(
        role_permission_table,
        [
            {"role_id": role_ids[role_code], "permission_id": permission_ids[permission_code]}
            for role_code, permission_codes in ROLE_PERMISSIONS.items()
            for permission_code in permission_codes
        ],
    )

    property_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM hms_properties ORDER BY id")).all()]
    users = bind.execute(sa.text("SELECT id, role FROM users")).all()
    for property_id in property_ids:
        for user_id, legacy_role in users:
            role_code = LEGACY_ROLE_MAP.get(str(legacy_role or "staff"), "hotel_staff")
            bind.execute(
                sa.text(
                    """
                    INSERT INTO hms_user_property_roles (user_id, property_id, role_id, created_at, updated_at)
                    VALUES (:user_id, :property_id, :role_id, now(), now())
                    ON CONFLICT (user_id, property_id, role_id) DO NOTHING
                    """
                ),
                {
                    "user_id": user_id,
                    "property_id": property_id,
                    "role_id": role_ids[role_code],
                },
            )

    bind.execute(
        sa.text(
            """
            UPDATE users
            SET active_property_id = property_map.property_id
            FROM (
                SELECT user_id, MIN(property_id) AS property_id
                FROM hms_user_property_roles
                GROUP BY user_id
            ) AS property_map
            WHERE users.id = property_map.user_id
              AND users.active_property_id IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_hms_user_property_roles_user_id"), table_name="hms_user_property_roles")
    op.drop_index(op.f("ix_hms_user_property_roles_role_id"), table_name="hms_user_property_roles")
    op.drop_index(op.f("ix_hms_user_property_roles_property_id"), table_name="hms_user_property_roles")
    op.drop_table("hms_user_property_roles")

    op.drop_index(op.f("ix_hms_role_permissions_role_id"), table_name="hms_role_permissions")
    op.drop_index(op.f("ix_hms_role_permissions_permission_id"), table_name="hms_role_permissions")
    op.drop_table("hms_role_permissions")

    op.drop_index(op.f("ix_hms_permissions_code"), table_name="hms_permissions")
    op.drop_table("hms_permissions")

    op.drop_index(op.f("ix_hms_roles_code"), table_name="hms_roles")
    op.drop_table("hms_roles")

    op.drop_index(op.f("ix_users_active_property_id"), table_name="users")
    op.drop_constraint("fk_users_active_property_id_hms_properties", "users", type_="foreignkey")
    op.drop_column("users", "active_property_id")
