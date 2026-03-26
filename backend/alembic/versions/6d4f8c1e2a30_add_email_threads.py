"""add_email_threads

Revision ID: 6d4f8c1e2a30
Revises: z001a2b3c4d5
Create Date: 2026-03-26 15:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "6d4f8c1e2a30"
down_revision: Union[str, None] = "z001a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_threads",
        sa.Column("external_email_id", sa.String(length=255), nullable=False),
        sa.Column("sender", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=500), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_email", sa.JSON(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("classification_confidence", sa.Float(), nullable=True),
        sa.Column("extracted_data", sa.JSON(), nullable=True),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("reply_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reply_sent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reply_content", sa.Text(), nullable=True),
        sa.Column("reply_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reply_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replied_by_user_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("reply_mode", sa.String(length=20), nullable=False, server_default="generate_only"),
        sa.Column("processing_error", sa.Text(), nullable=True),
        sa.Column("reply_error", sa.Text(), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["replied_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_email_threads_external_email_id"), "email_threads", ["external_email_id"], unique=True)
    op.create_index(op.f("ix_email_threads_received_at"), "email_threads", ["received_at"], unique=False)
    op.create_index(op.f("ix_email_threads_category"), "email_threads", ["category"], unique=False)
    op.create_index(op.f("ix_email_threads_status"), "email_threads", ["status"], unique=False)
    op.create_index("ix_email_threads_category_status", "email_threads", ["category", "status"], unique=False)
    op.create_index("ix_email_threads_reply_sent", "email_threads", ["reply_sent"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_threads_reply_sent", table_name="email_threads")
    op.drop_index("ix_email_threads_category_status", table_name="email_threads")
    op.drop_index(op.f("ix_email_threads_status"), table_name="email_threads")
    op.drop_index(op.f("ix_email_threads_category"), table_name="email_threads")
    op.drop_index(op.f("ix_email_threads_received_at"), table_name="email_threads")
    op.drop_index(op.f("ix_email_threads_external_email_id"), table_name="email_threads")
    op.drop_table("email_threads")
