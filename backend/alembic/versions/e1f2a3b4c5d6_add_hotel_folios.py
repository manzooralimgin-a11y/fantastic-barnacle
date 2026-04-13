"""add hotel folios

Revision ID: e1f2a3b4c5d6
Revises: c4f9a2b7d001
Create Date: 2026-04-09 02:10:00.000000
"""

from __future__ import annotations

from collections import defaultdict
import json

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e1f2a3b4c5d6"
down_revision = "c4f9a2b7d001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hms_stays",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("property_id", sa.Integer(), sa.ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("hms_reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("room_id", sa.Integer(), sa.ForeignKey("hms_rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="booked"),
        sa.Column("planned_check_in", sa.Date(), nullable=False),
        sa.Column("planned_check_out", sa.Date(), nullable=False),
        sa.Column("actual_check_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_check_out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("reservation_id", name="uq_hms_stays_reservation_id"),
    )
    op.create_index("ix_hms_stays_property_id", "hms_stays", ["property_id"])
    op.create_index("ix_hms_stays_reservation_id", "hms_stays", ["reservation_id"])
    op.create_index("ix_hms_stays_room_id", "hms_stays", ["room_id"])
    op.create_index("ix_hms_stays_status", "hms_stays", ["status"])
    op.create_index("ix_hms_stays_planned_check_in", "hms_stays", ["planned_check_in"])
    op.create_index("ix_hms_stays_planned_check_out", "hms_stays", ["planned_check_out"])

    op.create_table(
        "hms_folios",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("property_id", sa.Integer(), sa.ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stay_id", sa.Integer(), sa.ForeignKey("hms_stays.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reservation_id", sa.Integer(), sa.ForeignKey("hms_reservations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folio_number", sa.String(length=50), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="EUR"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("balance_due", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("property_id", "folio_number", name="uq_hms_folios_property_id_folio_number"),
        sa.UniqueConstraint("stay_id", name="uq_hms_folios_stay_id"),
        sa.UniqueConstraint("reservation_id", name="uq_hms_folios_reservation_id"),
    )
    op.create_index("ix_hms_folios_property_id", "hms_folios", ["property_id"])
    op.create_index("ix_hms_folios_stay_id", "hms_folios", ["stay_id"])
    op.create_index("ix_hms_folios_reservation_id", "hms_folios", ["reservation_id"])
    op.create_index("ix_hms_folios_status", "hms_folios", ["status"])

    op.create_table(
        "hms_folio_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("folio_id", sa.Integer(), sa.ForeignKey("hms_folios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("charge_type", sa.String(length=30), nullable=False, server_default="service"),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("quantity", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="posted"),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_hms_folio_lines_folio_id", "hms_folio_lines", ["folio_id"])
    op.create_index("ix_hms_folio_lines_charge_type", "hms_folio_lines", ["charge_type"])
    op.create_index("ix_hms_folio_lines_status", "hms_folio_lines", ["status"])

    op.create_table(
        "hms_folio_payments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("folio_id", sa.Integer(), sa.ForeignKey("hms_folios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("method", sa.String(length=30), nullable=False),
        sa.Column("reference", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="completed"),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processing_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("gateway_reference", sa.String(length=255), nullable=True),
        sa.Column("card_last_four", sa.String(length=4), nullable=True),
        sa.Column("card_brand", sa.String(length=30), nullable=True),
        sa.Column("wallet_type", sa.String(length=30), nullable=True),
        sa.Column("refund_of_id", sa.Integer(), sa.ForeignKey("hms_folio_payments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_hms_folio_payments_folio_id", "hms_folio_payments", ["folio_id"])
    op.create_index("ix_hms_folio_payments_status", "hms_folio_payments", ["status"])

    conn = op.get_bind()
    reservation_rows = conn.execute(
        sa.text(
            """
            SELECT
                r.id,
                r.property_id,
                r.room,
                r.status,
                r.check_in,
                r.check_out,
                r.total_amount,
                r.currency,
                r.room_type_label,
                r.booking_id,
                r.payment_status,
                r.zahlungs_status,
                r.zahlungs_methode,
                r.created_at
            FROM hms_reservations r
            ORDER BY r.property_id, r.created_at, r.id
            """
        )
    ).mappings().all()

    sequences: dict[tuple[int, int], int] = defaultdict(int)
    for row in reservation_rows:
        room_id = None
        if row["room"]:
            room_id = conn.execute(
                sa.text(
                    """
                    SELECT id
                    FROM hms_rooms
                    WHERE property_id = :property_id AND room_number = :room_number
                    LIMIT 1
                    """
                ),
                {"property_id": row["property_id"], "room_number": row["room"]},
            ).scalar()

        normalized_status = (row["status"] or "confirmed").replace("-", "_").lower()
        stay_status = "booked"
        actual_check_in_at = None
        actual_check_out_at = None
        if normalized_status == "checked_in":
            stay_status = "checked_in"
            actual_check_in_at = row["created_at"]
        elif normalized_status == "checked_out":
            stay_status = "checked_out"
            actual_check_in_at = row["created_at"]
            actual_check_out_at = row["created_at"]
        elif normalized_status == "cancelled":
            stay_status = "cancelled"

        stay_insert = conn.execute(
            sa.text(
                """
                INSERT INTO hms_stays (
                    property_id,
                    reservation_id,
                    room_id,
                    status,
                    planned_check_in,
                    planned_check_out,
                    actual_check_in_at,
                    actual_check_out_at
                )
                VALUES (
                    :property_id,
                    :reservation_id,
                    :room_id,
                    :status,
                    :planned_check_in,
                    :planned_check_out,
                    :actual_check_in_at,
                    :actual_check_out_at
                )
                RETURNING id
                """
            ),
            {
                "property_id": row["property_id"],
                "reservation_id": row["id"],
                "room_id": room_id,
                "status": stay_status,
                "planned_check_in": row["check_in"],
                "planned_check_out": row["check_out"],
                "actual_check_in_at": actual_check_in_at,
                "actual_check_out_at": actual_check_out_at,
            },
        )
        stay_id = stay_insert.scalar_one()

        created_at = row["created_at"]
        year = created_at.year if created_at is not None else 2026
        sequence_key = (row["property_id"], year)
        sequences[sequence_key] += 1
        folio_number = f"FOL-{year}-{sequences[sequence_key]:04d}"

        total_amount = float(row["total_amount"] or 0)
        is_paid = (row["payment_status"] or "").lower() == "paid" or (row["zahlungs_status"] or "").lower() == "bezahlt"
        folio_status = "paid" if is_paid else "open"
        balance_due = 0 if is_paid else total_amount

        folio_insert = conn.execute(
            sa.text(
                """
                INSERT INTO hms_folios (
                    property_id,
                    stay_id,
                    reservation_id,
                    folio_number,
                    currency,
                    status,
                    subtotal,
                    tax_amount,
                    discount_amount,
                    total,
                    balance_due,
                    paid_at
                )
                VALUES (
                    :property_id,
                    :stay_id,
                    :reservation_id,
                    :folio_number,
                    :currency,
                    :status,
                    :subtotal,
                    0,
                    0,
                    :total,
                    :balance_due,
                    :paid_at
                )
                RETURNING id
                """
            ),
            {
                "property_id": row["property_id"],
                "stay_id": stay_id,
                "reservation_id": row["id"],
                "folio_number": folio_number,
                "currency": row["currency"] or "EUR",
                "status": folio_status,
                "subtotal": total_amount,
                "total": total_amount,
                "balance_due": balance_due,
                "paid_at": row["created_at"] if is_paid else None,
            },
        )
        folio_id = folio_insert.scalar_one()

        nights = max((row["check_out"] - row["check_in"]).days, 1)
        unit_price = round(total_amount / nights, 2) if total_amount else 0
        conn.execute(
            sa.text(
                """
                INSERT INTO hms_folio_lines (
                    folio_id,
                    charge_type,
                    description,
                    quantity,
                    unit_price,
                    total_price,
                    service_date,
                    status,
                    metadata_json
                )
                VALUES (
                    :folio_id,
                    'room',
                    :description,
                    :quantity,
                    :unit_price,
                    :total_price,
                    :service_date,
                    'posted',
                    CAST(:metadata_json AS JSON)
                )
                """
            ),
            {
                "folio_id": folio_id,
                "description": f"Room charge · {row['room_type_label'] or 'Zimmer'}",
                "quantity": nights,
                "unit_price": unit_price if unit_price > 0 else total_amount,
                "total_price": total_amount,
                "service_date": row["check_in"],
                "metadata_json": json.dumps(
                    {
                        "reservation_id": row["id"],
                        "booking_id": row["booking_id"] or "",
                        "room": row["room"],
                        "nights": nights,
                    }
                ),
            },
        )

        if is_paid and total_amount > 0:
            conn.execute(
                sa.text(
                    """
                    INSERT INTO hms_folio_payments (
                        folio_id,
                        amount,
                        method,
                        reference,
                        status,
                        paid_at
                    )
                    VALUES (
                        :folio_id,
                        :amount,
                        :method,
                        :reference,
                        'completed',
                        :paid_at
                    )
                    """
                ),
                {
                    "folio_id": folio_id,
                    "amount": total_amount,
                    "method": row["zahlungs_methode"] or "unknown",
                    "reference": row["booking_id"],
                    "paid_at": row["created_at"],
                },
            )


def downgrade() -> None:
    op.drop_index("ix_hms_folio_payments_status", table_name="hms_folio_payments")
    op.drop_index("ix_hms_folio_payments_folio_id", table_name="hms_folio_payments")
    op.drop_table("hms_folio_payments")

    op.drop_index("ix_hms_folio_lines_status", table_name="hms_folio_lines")
    op.drop_index("ix_hms_folio_lines_charge_type", table_name="hms_folio_lines")
    op.drop_index("ix_hms_folio_lines_folio_id", table_name="hms_folio_lines")
    op.drop_table("hms_folio_lines")

    op.drop_index("ix_hms_folios_status", table_name="hms_folios")
    op.drop_index("ix_hms_folios_reservation_id", table_name="hms_folios")
    op.drop_index("ix_hms_folios_stay_id", table_name="hms_folios")
    op.drop_index("ix_hms_folios_property_id", table_name="hms_folios")
    op.drop_table("hms_folios")

    op.drop_index("ix_hms_stays_status", table_name="hms_stays")
    op.drop_index("ix_hms_stays_planned_check_out", table_name="hms_stays")
    op.drop_index("ix_hms_stays_planned_check_in", table_name="hms_stays")
    op.drop_index("ix_hms_stays_room_id", table_name="hms_stays")
    op.drop_index("ix_hms_stays_reservation_id", table_name="hms_stays")
    op.drop_index("ix_hms_stays_property_id", table_name="hms_stays")
    op.drop_table("hms_stays")
