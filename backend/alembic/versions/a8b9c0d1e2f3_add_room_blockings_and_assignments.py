"""add room blockings and stay assignments

Revision ID: a8b9c0d1e2f3
Revises: f6a7b8c9d0e1
Create Date: 2026-04-09 12:05:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8b9c0d1e2f3"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hms_room_blockings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("reason", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("blocked_by_user_id", sa.Integer(), nullable=True),
        sa.Column("released_by_user_id", sa.Integer(), nullable=True),
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["hms_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["released_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hms_room_blockings_property_id", "hms_room_blockings", ["property_id"])
    op.create_index("ix_hms_room_blockings_room_id", "hms_room_blockings", ["room_id"])
    op.create_index("ix_hms_room_blockings_start_date", "hms_room_blockings", ["start_date"])
    op.create_index("ix_hms_room_blockings_end_date", "hms_room_blockings", ["end_date"])
    op.create_index("ix_hms_room_blockings_status", "hms_room_blockings", ["status"])

    op.create_table(
        "hms_stay_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("stay_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("assignment_type", sa.String(length=30), nullable=False, server_default="move"),
        sa.Column("assigned_from", sa.Date(), nullable=False),
        sa.Column("assigned_to", sa.Date(), nullable=False),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stay_id"], ["hms_stays.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["hms_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hms_stay_assignments_property_id", "hms_stay_assignments", ["property_id"])
    op.create_index("ix_hms_stay_assignments_stay_id", "hms_stay_assignments", ["stay_id"])
    op.create_index("ix_hms_stay_assignments_room_id", "hms_stay_assignments", ["room_id"])
    op.create_index("ix_hms_stay_assignments_assignment_type", "hms_stay_assignments", ["assignment_type"])
    op.create_index("ix_hms_stay_assignments_assigned_from", "hms_stay_assignments", ["assigned_from"])
    op.create_index("ix_hms_stay_assignments_assigned_to", "hms_stay_assignments", ["assigned_to"])


def downgrade() -> None:
    op.drop_index("ix_hms_stay_assignments_assigned_to", table_name="hms_stay_assignments")
    op.drop_index("ix_hms_stay_assignments_assigned_from", table_name="hms_stay_assignments")
    op.drop_index("ix_hms_stay_assignments_assignment_type", table_name="hms_stay_assignments")
    op.drop_index("ix_hms_stay_assignments_room_id", table_name="hms_stay_assignments")
    op.drop_index("ix_hms_stay_assignments_stay_id", table_name="hms_stay_assignments")
    op.drop_index("ix_hms_stay_assignments_property_id", table_name="hms_stay_assignments")
    op.drop_table("hms_stay_assignments")

    op.drop_index("ix_hms_room_blockings_status", table_name="hms_room_blockings")
    op.drop_index("ix_hms_room_blockings_end_date", table_name="hms_room_blockings")
    op.drop_index("ix_hms_room_blockings_start_date", table_name="hms_room_blockings")
    op.drop_index("ix_hms_room_blockings_room_id", table_name="hms_room_blockings")
    op.drop_index("ix_hms_room_blockings_property_id", table_name="hms_room_blockings")
    op.drop_table("hms_room_blockings")
