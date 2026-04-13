"""add hotel housekeeping

Revision ID: f6a7b8c9d0e1
Revises: e1f2a3b4c5d6
Create Date: 2026-04-09 11:10:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "e1f2a3b4c5d6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "hms_housekeeping_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("task_type", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="normal"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("assigned_user_id", sa.Integer(), nullable=True),
        sa.Column("assigned_to_name", sa.String(length=255), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["hms_rooms.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hms_housekeeping_tasks_property_id", "hms_housekeeping_tasks", ["property_id"])
    op.create_index("ix_hms_housekeeping_tasks_room_id", "hms_housekeeping_tasks", ["room_id"])
    op.create_index("ix_hms_housekeeping_tasks_task_type", "hms_housekeeping_tasks", ["task_type"])
    op.create_index("ix_hms_housekeeping_tasks_priority", "hms_housekeeping_tasks", ["priority"])
    op.create_index("ix_hms_housekeeping_tasks_status", "hms_housekeeping_tasks", ["status"])
    op.create_index("ix_hms_housekeeping_tasks_due_date", "hms_housekeeping_tasks", ["due_date"])

    op.create_table(
        "hms_room_status_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("room_id", sa.Integer(), nullable=False),
        sa.Column("previous_status", sa.String(length=30), nullable=True),
        sa.Column("new_status", sa.String(length=30), nullable=False),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.Column("changed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["hms_rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["hms_housekeeping_tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hms_room_status_history_property_id", "hms_room_status_history", ["property_id"])
    op.create_index("ix_hms_room_status_history_room_id", "hms_room_status_history", ["room_id"])
    op.create_index("ix_hms_room_status_history_new_status", "hms_room_status_history", ["new_status"])


def downgrade() -> None:
    op.drop_index("ix_hms_room_status_history_new_status", table_name="hms_room_status_history")
    op.drop_index("ix_hms_room_status_history_room_id", table_name="hms_room_status_history")
    op.drop_index("ix_hms_room_status_history_property_id", table_name="hms_room_status_history")
    op.drop_table("hms_room_status_history")

    op.drop_index("ix_hms_housekeeping_tasks_due_date", table_name="hms_housekeeping_tasks")
    op.drop_index("ix_hms_housekeeping_tasks_status", table_name="hms_housekeeping_tasks")
    op.drop_index("ix_hms_housekeeping_tasks_priority", table_name="hms_housekeeping_tasks")
    op.drop_index("ix_hms_housekeeping_tasks_task_type", table_name="hms_housekeeping_tasks")
    op.drop_index("ix_hms_housekeeping_tasks_room_id", table_name="hms_housekeeping_tasks")
    op.drop_index("ix_hms_housekeeping_tasks_property_id", table_name="hms_housekeeping_tasks")
    op.drop_table("hms_housekeeping_tasks")
