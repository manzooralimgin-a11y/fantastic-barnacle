"""add hotel invoices

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-04-10 14:25:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "d1e2f3a4b5c6"
down_revision = "c0d1e2f3a4b5"
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

    if not has_table("hms_invoices"):
        op.create_table(
            "hms_invoices",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("property_id", sa.Integer(), nullable=False),
            sa.Column("reservation_id", sa.Integer(), nullable=False),
            sa.Column("stay_id", sa.Integer(), nullable=True),
            sa.Column("folio_id", sa.Integer(), nullable=False),
            sa.Column("document_id", sa.Integer(), nullable=True),
            sa.Column("invoice_number", sa.String(length=100), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("currency", sa.String(length=10), nullable=False),
            sa.Column("recipient_name", sa.String(length=255), nullable=True),
            sa.Column("recipient_email", sa.String(length=255), nullable=True),
            sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["folio_id"], ["hms_folios.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reservation_id"], ["hms_reservations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["stay_id"], ["hms_stays.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("property_id", "invoice_number", name="uq_hms_invoices_property_id_invoice_number"),
        )
    create_index_if_missing("ix_hms_invoices_property_id", "hms_invoices", ["property_id"])
    create_index_if_missing("ix_hms_invoices_reservation_id", "hms_invoices", ["reservation_id"])
    create_index_if_missing("ix_hms_invoices_stay_id", "hms_invoices", ["stay_id"])
    create_index_if_missing("ix_hms_invoices_folio_id", "hms_invoices", ["folio_id"])
    create_index_if_missing("ix_hms_invoices_document_id", "hms_invoices", ["document_id"])
    create_index_if_missing("ix_hms_invoices_invoice_number", "hms_invoices", ["invoice_number"])
    create_index_if_missing("ix_hms_invoices_status", "hms_invoices", ["status"])
    create_index_if_missing("ix_hms_invoices_issued_at", "hms_invoices", ["issued_at"])
    create_index_if_missing("ix_hms_invoices_sent_at", "hms_invoices", ["sent_at"])

    if not has_table("hms_invoice_lines"):
        op.create_table(
            "hms_invoice_lines",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("invoice_id", sa.Integer(), nullable=False),
            sa.Column("folio_line_id", sa.Integer(), nullable=True),
            sa.Column("line_number", sa.Integer(), nullable=False),
            sa.Column("charge_type", sa.String(length=30), nullable=False),
            sa.Column("description", sa.String(length=255), nullable=False),
            sa.Column("quantity", sa.Numeric(10, 2), nullable=False),
            sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
            sa.Column("net_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("tax_rate", sa.Numeric(5, 2), nullable=False),
            sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("gross_amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("service_date", sa.Date(), nullable=True),
            sa.ForeignKeyConstraint(["folio_line_id"], ["hms_folio_lines.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["invoice_id"], ["hms_invoices.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    create_index_if_missing("ix_hms_invoice_lines_invoice_id", "hms_invoice_lines", ["invoice_id"])
    create_index_if_missing("ix_hms_invoice_lines_folio_line_id", "hms_invoice_lines", ["folio_line_id"])
    create_index_if_missing("ix_hms_invoice_lines_charge_type", "hms_invoice_lines", ["charge_type"])

    if not has_table("hms_invoice_deliveries"):
        op.create_table(
            "hms_invoice_deliveries",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("invoice_id", sa.Integer(), nullable=False),
            sa.Column("document_id", sa.Integer(), nullable=True),
            sa.Column("channel", sa.String(length=20), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False),
            sa.Column("recipient_email", sa.String(length=255), nullable=True),
            sa.Column("subject", sa.String(length=255), nullable=True),
            sa.Column("message", sa.String(length=5000), nullable=True),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error_message", sa.String(length=1000), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=True),
            sa.ForeignKeyConstraint(["document_id"], ["documents.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["invoice_id"], ["hms_invoices.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    create_index_if_missing("ix_hms_invoice_deliveries_invoice_id", "hms_invoice_deliveries", ["invoice_id"])
    create_index_if_missing("ix_hms_invoice_deliveries_document_id", "hms_invoice_deliveries", ["document_id"])
    create_index_if_missing("ix_hms_invoice_deliveries_channel", "hms_invoice_deliveries", ["channel"])
    create_index_if_missing("ix_hms_invoice_deliveries_status", "hms_invoice_deliveries", ["status"])
    create_index_if_missing("ix_hms_invoice_deliveries_sent_at", "hms_invoice_deliveries", ["sent_at"])


def downgrade() -> None:
    op.drop_index("ix_hms_invoice_deliveries_sent_at", table_name="hms_invoice_deliveries")
    op.drop_index("ix_hms_invoice_deliveries_status", table_name="hms_invoice_deliveries")
    op.drop_index("ix_hms_invoice_deliveries_channel", table_name="hms_invoice_deliveries")
    op.drop_index("ix_hms_invoice_deliveries_document_id", table_name="hms_invoice_deliveries")
    op.drop_index("ix_hms_invoice_deliveries_invoice_id", table_name="hms_invoice_deliveries")
    op.drop_table("hms_invoice_deliveries")

    op.drop_index("ix_hms_invoice_lines_charge_type", table_name="hms_invoice_lines")
    op.drop_index("ix_hms_invoice_lines_folio_line_id", table_name="hms_invoice_lines")
    op.drop_index("ix_hms_invoice_lines_invoice_id", table_name="hms_invoice_lines")
    op.drop_table("hms_invoice_lines")

    op.drop_index("ix_hms_invoices_sent_at", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_issued_at", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_status", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_invoice_number", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_document_id", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_folio_id", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_stay_id", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_reservation_id", table_name="hms_invoices")
    op.drop_index("ix_hms_invoices_property_id", table_name="hms_invoices")
    op.drop_table("hms_invoices")
