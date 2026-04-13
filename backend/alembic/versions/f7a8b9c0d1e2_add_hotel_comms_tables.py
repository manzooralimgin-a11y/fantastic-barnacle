"""add hotel comms tables

Revision ID: f7a8b9c0d1e2
Revises: f3a4b5c6d7e8
Create Date: 2026-04-10 13:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    def has_table(name: str) -> bool:
        return inspect(bind).has_table(name)

    def create_index_if_missing(name: str, table_name: str, columns: list[str]) -> None:
        existing = {index["name"] for index in inspect(bind).get_indexes(table_name)}
        if name not in existing:
            op.create_index(name, table_name, columns, unique=False)

    if not has_table("hms_message_templates"):
        op.create_table(
        "hms_message_templates",
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("subject_template", sa.String(length=255), nullable=True),
        sa.Column("body_template", sa.String(length=5000), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "code", name="uq_hms_message_templates_property_code"),
        )
    create_index_if_missing("ix_hms_message_templates_property_id", "hms_message_templates", ["property_id"])
    create_index_if_missing("ix_hms_message_templates_code", "hms_message_templates", ["code"])
    create_index_if_missing("ix_hms_message_templates_channel", "hms_message_templates", ["channel"])
    create_index_if_missing("ix_hms_message_templates_category", "hms_message_templates", ["category"])
    create_index_if_missing("ix_hms_message_templates_is_default", "hms_message_templates", ["is_default"])
    create_index_if_missing("ix_hms_message_templates_is_active", "hms_message_templates", ["is_active"])

    if not has_table("hms_message_threads"):
        op.create_table(
        "hms_message_threads",
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=True),
        sa.Column("guest_id", sa.Integer(), nullable=True),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("guest_name", sa.String(length=255), nullable=True),
        sa.Column("guest_email", sa.String(length=255), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_direction", sa.String(length=20), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reservation_id"], ["hms_reservations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["guest_id"], ["guest_profiles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        )
    create_index_if_missing("ix_hms_message_threads_property_id", "hms_message_threads", ["property_id"])
    create_index_if_missing("ix_hms_message_threads_reservation_id", "hms_message_threads", ["reservation_id"])
    create_index_if_missing("ix_hms_message_threads_guest_id", "hms_message_threads", ["guest_id"])
    create_index_if_missing("ix_hms_message_threads_channel", "hms_message_threads", ["channel"])
    create_index_if_missing("ix_hms_message_threads_status", "hms_message_threads", ["status"])
    create_index_if_missing("ix_hms_message_threads_last_message_at", "hms_message_threads", ["last_message_at"])

    if not has_table("hms_message_events"):
        op.create_table(
        "hms_message_events",
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("thread_id", sa.Integer(), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("direction", sa.String(length=20), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("body_text", sa.String(length=5000), nullable=False),
        sa.Column("sender_email", sa.String(length=255), nullable=True),
        sa.Column("recipient_email", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.String(length=1000), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["thread_id"], ["hms_message_threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["template_id"], ["hms_message_templates.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        )
    create_index_if_missing("ix_hms_message_events_property_id", "hms_message_events", ["property_id"])
    create_index_if_missing("ix_hms_message_events_thread_id", "hms_message_events", ["thread_id"])
    create_index_if_missing("ix_hms_message_events_template_id", "hms_message_events", ["template_id"])
    create_index_if_missing("ix_hms_message_events_direction", "hms_message_events", ["direction"])
    create_index_if_missing("ix_hms_message_events_channel", "hms_message_events", ["channel"])
    create_index_if_missing("ix_hms_message_events_status", "hms_message_events", ["status"])
    create_index_if_missing("ix_hms_message_events_sent_at", "hms_message_events", ["sent_at"])


def downgrade() -> None:
    op.drop_index("ix_hms_message_events_sent_at", table_name="hms_message_events")
    op.drop_index("ix_hms_message_events_status", table_name="hms_message_events")
    op.drop_index("ix_hms_message_events_channel", table_name="hms_message_events")
    op.drop_index("ix_hms_message_events_direction", table_name="hms_message_events")
    op.drop_index("ix_hms_message_events_template_id", table_name="hms_message_events")
    op.drop_index("ix_hms_message_events_thread_id", table_name="hms_message_events")
    op.drop_index("ix_hms_message_events_property_id", table_name="hms_message_events")
    op.drop_table("hms_message_events")

    op.drop_index("ix_hms_message_threads_last_message_at", table_name="hms_message_threads")
    op.drop_index("ix_hms_message_threads_status", table_name="hms_message_threads")
    op.drop_index("ix_hms_message_threads_channel", table_name="hms_message_threads")
    op.drop_index("ix_hms_message_threads_guest_id", table_name="hms_message_threads")
    op.drop_index("ix_hms_message_threads_reservation_id", table_name="hms_message_threads")
    op.drop_index("ix_hms_message_threads_property_id", table_name="hms_message_threads")
    op.drop_table("hms_message_threads")

    op.drop_index("ix_hms_message_templates_is_active", table_name="hms_message_templates")
    op.drop_index("ix_hms_message_templates_is_default", table_name="hms_message_templates")
    op.drop_index("ix_hms_message_templates_category", table_name="hms_message_templates")
    op.drop_index("ix_hms_message_templates_channel", table_name="hms_message_templates")
    op.drop_index("ix_hms_message_templates_code", table_name="hms_message_templates")
    op.drop_index("ix_hms_message_templates_property_id", table_name="hms_message_templates")
    op.drop_table("hms_message_templates")
