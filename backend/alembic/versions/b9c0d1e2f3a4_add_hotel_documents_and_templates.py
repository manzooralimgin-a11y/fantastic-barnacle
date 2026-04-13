"""add hotel documents and templates

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-04-09 13:20:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b9c0d1e2f3a4"
down_revision: str | Sequence[str] | None = "a8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "document_blueprints",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("document_kind", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("default_title_template", sa.String(length=255), nullable=False),
        sa.Column("default_subject_template", sa.String(length=255), nullable=True),
        sa.Column("default_body_template", sa.String(length=5000), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_blueprints_code", "document_blueprints", ["code"], unique=True)
    op.create_index("ix_document_blueprints_document_kind", "document_blueprints", ["document_kind"])
    op.create_index("ix_document_blueprints_is_active", "document_blueprints", ["is_active"])

    op.create_table(
        "document_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=True),
        sa.Column("blueprint_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=False, server_default="de"),
        sa.Column("subject_template", sa.String(length=255), nullable=True),
        sa.Column("title_template", sa.String(length=255), nullable=False),
        sa.Column("body_template", sa.String(length=5000), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["blueprint_id"], ["document_blueprints.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_document_templates_property_id", "document_templates", ["property_id"])
    op.create_index("ix_document_templates_blueprint_id", "document_templates", ["blueprint_id"])
    op.create_index("ix_document_templates_code", "document_templates", ["code"])
    op.create_index("ix_document_templates_is_default", "document_templates", ["is_default"])
    op.create_index("ix_document_templates_is_active", "document_templates", ["is_active"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("reservation_id", sa.Integer(), nullable=True),
        sa.Column("stay_id", sa.Integer(), nullable=True),
        sa.Column("folio_id", sa.Integer(), nullable=True),
        sa.Column("blueprint_id", sa.Integer(), nullable=True),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("document_kind", sa.String(length=50), nullable=False),
        sa.Column("document_number", sa.String(length=100), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="generated"),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body_text", sa.String(length=12000), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reservation_id"], ["hms_reservations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["stay_id"], ["hms_stays.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["folio_id"], ["hms_folios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["blueprint_id"], ["document_blueprints.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["template_id"], ["document_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "document_number", name="uq_documents_property_id_document_number"),
    )
    op.create_index("ix_documents_property_id", "documents", ["property_id"])
    op.create_index("ix_documents_reservation_id", "documents", ["reservation_id"])
    op.create_index("ix_documents_stay_id", "documents", ["stay_id"])
    op.create_index("ix_documents_folio_id", "documents", ["folio_id"])
    op.create_index("ix_documents_blueprint_id", "documents", ["blueprint_id"])
    op.create_index("ix_documents_template_id", "documents", ["template_id"])
    op.create_index("ix_documents_document_kind", "documents", ["document_kind"])
    op.create_index("ix_documents_document_number", "documents", ["document_number"])
    op.create_index("ix_documents_status", "documents", ["status"])
    op.create_index("ix_documents_issued_at", "documents", ["issued_at"])


def downgrade() -> None:
    op.drop_index("ix_documents_issued_at", table_name="documents")
    op.drop_index("ix_documents_status", table_name="documents")
    op.drop_index("ix_documents_document_number", table_name="documents")
    op.drop_index("ix_documents_document_kind", table_name="documents")
    op.drop_index("ix_documents_template_id", table_name="documents")
    op.drop_index("ix_documents_blueprint_id", table_name="documents")
    op.drop_index("ix_documents_folio_id", table_name="documents")
    op.drop_index("ix_documents_stay_id", table_name="documents")
    op.drop_index("ix_documents_reservation_id", table_name="documents")
    op.drop_index("ix_documents_property_id", table_name="documents")
    op.drop_table("documents")

    op.drop_index("ix_document_templates_is_active", table_name="document_templates")
    op.drop_index("ix_document_templates_is_default", table_name="document_templates")
    op.drop_index("ix_document_templates_code", table_name="document_templates")
    op.drop_index("ix_document_templates_blueprint_id", table_name="document_templates")
    op.drop_index("ix_document_templates_property_id", table_name="document_templates")
    op.drop_table("document_templates")

    op.drop_index("ix_document_blueprints_is_active", table_name="document_blueprints")
    op.drop_index("ix_document_blueprints_document_kind", table_name="document_blueprints")
    op.drop_index("ix_document_blueprints_code", table_name="document_blueprints")
    op.drop_table("document_blueprints")
