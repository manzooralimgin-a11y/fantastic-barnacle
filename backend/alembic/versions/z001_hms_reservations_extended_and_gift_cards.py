"""hms reservations extended fields and gift card flag

Revision ID: z001a2b3c4d5
Revises: 8378c8dce28c
Create Date: 2026-03-20 02:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "z001a2b3c4d5"
down_revision: Union[str, Sequence[str]] = "8378c8dce28c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # --- hms_reservations: add extended fields ---
    for col_sql in [
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS anrede VARCHAR(20)",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS phone VARCHAR(50)",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS room VARCHAR(20)",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS room_type_label VARCHAR(100)",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS adults INTEGER DEFAULT 1",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS children INTEGER DEFAULT 0",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS zahlungs_methode VARCHAR(50)",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS zahlungs_status VARCHAR(50) DEFAULT 'offen'",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS special_requests VARCHAR(500)",
    ]:
        conn.execute(sa.text(col_sql))

    # --- vouchers: add gift card flag and purchaser name ---
    for col_sql in [
        "ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_gift_card BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS purchaser_name VARCHAR(255)",
    ]:
        conn.execute(sa.text(col_sql))


def downgrade() -> None:
    conn = op.get_bind()
    for col in ["anrede", "phone", "room", "room_type_label", "adults", "children",
                "zahlungs_methode", "zahlungs_status", "special_requests"]:
        conn.execute(sa.text(f"ALTER TABLE hms_reservations DROP COLUMN IF EXISTS {col}"))
    for col in ["is_gift_card", "purchaser_name"]:
        conn.execute(sa.text(f"ALTER TABLE vouchers DROP COLUMN IF EXISTS {col}"))
