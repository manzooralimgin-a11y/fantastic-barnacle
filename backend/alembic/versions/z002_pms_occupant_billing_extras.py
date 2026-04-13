"""pms: stay occupants, billing guest, booking source, color tag, hotel extras

Revision ID: z002a3b4c5d6
Revises: z001a2b3c4d5
Create Date: 2026-04-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "z002a3b4c5d6"
down_revision: Union[str, Sequence[str]] = "z001a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── hms_reservations: accounting decoupling + UX fields ──────────────────
    for sql in [
        """ALTER TABLE hms_reservations
               ADD COLUMN IF NOT EXISTS billing_guest_id INTEGER
               REFERENCES guest_profiles(id) ON DELETE SET NULL""",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS booking_source VARCHAR(80)",
        "ALTER TABLE hms_reservations ADD COLUMN IF NOT EXISTS color_tag VARCHAR(20)",
    ]:
        conn.execute(sa.text(sql))

    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_hms_reservations_billing_guest_id "
        "ON hms_reservations (billing_guest_id)"
    ))

    # ── hms_stay_occupants: physical guest ↔ stay mapping ────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS hms_stay_occupants (
            id                SERIAL PRIMARY KEY,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            stay_id           INTEGER NOT NULL REFERENCES hms_stays(id) ON DELETE CASCADE,
            guest_profile_id  INTEGER NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
            is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
            CONSTRAINT uq_hms_stay_occupants_stay_guest UNIQUE (stay_id, guest_profile_id)
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_hms_stay_occupants_stay_id "
        "ON hms_stay_occupants (stay_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_hms_stay_occupants_guest_profile_id "
        "ON hms_stay_occupants (guest_profile_id)"
    ))

    # ── hms_extras: add-on products ──────────────────────────────────────────
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS hms_extras (
            id          SERIAL PRIMARY KEY,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
            name        VARCHAR(255) NOT NULL,
            unit_price  NUMERIC(12,2) NOT NULL,
            per_person  BOOLEAN NOT NULL DEFAULT FALSE,
            daily       BOOLEAN NOT NULL DEFAULT FALSE,
            is_active   BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order  INTEGER NOT NULL DEFAULT 0
        )
    """))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_hms_extras_property_id "
        "ON hms_extras (property_id)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_hms_extras_is_active "
        "ON hms_extras (is_active)"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS hms_extras"))
    conn.execute(sa.text("DROP TABLE IF EXISTS hms_stay_occupants"))
    conn.execute(sa.text("DROP INDEX IF EXISTS ix_hms_reservations_billing_guest_id"))
    for col in ["billing_guest_id", "booking_source", "color_tag"]:
        conn.execute(sa.text(f"ALTER TABLE hms_reservations DROP COLUMN IF EXISTS {col}"))
