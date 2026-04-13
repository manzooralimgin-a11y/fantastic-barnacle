"""add guest profile enrichment

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-04-09 14:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c0d1e2f3a4b5"
down_revision: str | Sequence[str] | None = "b9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("guest_profiles", sa.Column("salutation", sa.String(length=20), nullable=True))
    op.add_column("guest_profiles", sa.Column("birthday", sa.Date(), nullable=True))
    op.add_column("guest_profiles", sa.Column("country_code", sa.String(length=10), nullable=True))
    op.add_column("guest_profiles", sa.Column("country_name", sa.String(length=100), nullable=True))
    op.add_column("guest_profiles", sa.Column("custom_fields_json", sa.JSON(), nullable=True))

    op.create_index("ix_guest_profiles_birthday", "guest_profiles", ["birthday"])
    op.create_index("ix_guest_profiles_country_code", "guest_profiles", ["country_code"])


def downgrade() -> None:
    op.drop_index("ix_guest_profiles_country_code", table_name="guest_profiles")
    op.drop_index("ix_guest_profiles_birthday", table_name="guest_profiles")

    op.drop_column("guest_profiles", "custom_fields_json")
    op.drop_column("guest_profiles", "country_name")
    op.drop_column("guest_profiles", "country_code")
    op.drop_column("guest_profiles", "birthday")
    op.drop_column("guest_profiles", "salutation")
