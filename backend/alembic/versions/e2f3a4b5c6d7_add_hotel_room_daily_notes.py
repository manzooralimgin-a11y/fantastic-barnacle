"""add hotel room daily notes

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-04-10 20:05:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    def has_table(name: str) -> bool:
        return inspect(bind).has_table(name)

    def create_index_if_missing(name: str, table_name: str, columns: list[str]) -> None:
        existing = {index["name"] for index in inspect(bind).get_indexes(table_name)}
        if name not in existing:
            op.create_index(name, table_name, columns)

    if not has_table("hms_room_daily_notes"):
        op.create_table(
            "hms_room_daily_notes",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("property_id", sa.Integer(), nullable=False),
            sa.Column("room_id", sa.Integer(), nullable=False),
            sa.Column("note_date", sa.Date(), nullable=False),
            sa.Column("housekeeping_note", sa.String(length=2000), nullable=True),
            sa.Column("maintenance_note", sa.String(length=2000), nullable=True),
            sa.Column("maintenance_required", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), nullable=True),
            sa.Column("updated_by_user_id", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["room_id"], ["hms_rooms.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["updated_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("property_id", "room_id", "note_date", name="uq_hms_room_daily_notes_room_date"),
        )
    create_index_if_missing("ix_hms_room_daily_notes_property_id", "hms_room_daily_notes", ["property_id"])
    create_index_if_missing("ix_hms_room_daily_notes_room_id", "hms_room_daily_notes", ["room_id"])
    create_index_if_missing("ix_hms_room_daily_notes_note_date", "hms_room_daily_notes", ["note_date"])


def downgrade() -> None:
    op.drop_index("ix_hms_room_daily_notes_note_date", table_name="hms_room_daily_notes")
    op.drop_index("ix_hms_room_daily_notes_room_id", table_name="hms_room_daily_notes")
    op.drop_index("ix_hms_room_daily_notes_property_id", table_name="hms_room_daily_notes")
    op.drop_table("hms_room_daily_notes")
