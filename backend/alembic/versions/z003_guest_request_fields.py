"""hms: add task_source and guest_booking_ref to housekeeping tasks

Revision ID: z003a4b5c6d7
Revises: z002a3b4c5d6
Create Date: 2026-04-13 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z003a4b5c6d7"
down_revision: Union[str, Sequence[str]] = "z002a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Add task_source column (default "staff" so existing rows stay valid)
    try:
        op.add_column(
            "hms_housekeeping_tasks",
            sa.Column(
                "task_source",
                sa.String(30),
                nullable=False,
                server_default="staff",
            ),
        )
        op.create_index(
            "ix_hms_housekeeping_tasks_task_source",
            "hms_housekeeping_tasks",
            ["task_source"],
        )
    except Exception:
        pass  # column may already exist in dev environments

    # Add guest_booking_ref column (nullable)
    try:
        op.add_column(
            "hms_housekeeping_tasks",
            sa.Column("guest_booking_ref", sa.String(50), nullable=True),
        )
        op.create_index(
            "ix_hms_housekeeping_tasks_guest_booking_ref",
            "hms_housekeeping_tasks",
            ["guest_booking_ref"],
        )
    except Exception:
        pass  # column may already exist in dev environments


def downgrade() -> None:
    try:
        op.drop_index("ix_hms_housekeeping_tasks_guest_booking_ref", "hms_housekeeping_tasks")
        op.drop_column("hms_housekeeping_tasks", "guest_booking_ref")
    except Exception:
        pass
    try:
        op.drop_index("ix_hms_housekeeping_tasks_task_source", "hms_housekeeping_tasks")
        op.drop_column("hms_housekeeping_tasks", "task_source")
    except Exception:
        pass
