"""add restaurant_id to maintenance, marketing, vision, workforce, menu_designer, signage, vouchers

Adds tenant isolation (restaurant_id FK) to 19 tables across 7 modules
that previously lacked multi-tenant scoping.

Revision ID: a1b2c3d4e5f6
Revises: 95069ca497e7
Create Date: 2026-03-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "95069ca497e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables that need restaurant_id added (did not have it before)
_NEW_TENANT_TABLES = [
    # maintenance
    "equipment",
    "energy_readings",
    # marketing
    "reviews",
    "campaigns",
    "social_posts",
    # vision
    "vision_alerts",
    "waste_logs",
    "compliance_events",
    # workforce
    "employees",
    "schedules",
    "applicants",
    "training_modules",
    # menu_designer
    "menu_templates",
    "menu_designs",
    # signage
    "signage_screens",
    "signage_content",
    "signage_playlists",
    # vouchers
    "vouchers",
    "customer_cards",
]


def upgrade() -> None:
    for table in _NEW_TENANT_TABLES:
        # 1. Add column as nullable first
        op.add_column(
            table,
            sa.Column("restaurant_id", sa.Integer(), nullable=True),
        )

        # 2. Backfill existing rows to restaurant_id = 1
        op.execute(
            sa.text(f"UPDATE {table} SET restaurant_id = 1 WHERE restaurant_id IS NULL")
        )

        # 3. Make NOT NULL
        op.alter_column(
            table,
            "restaurant_id",
            existing_type=sa.Integer(),
            nullable=False,
        )

        # 4. Add FK constraint
        op.create_foreign_key(
            f"fk_{table}_restaurant_id",
            table,
            "restaurants",
            ["restaurant_id"],
            ["id"],
        )

        # 5. Add index for query performance
        op.create_index(
            op.f(f"ix_{table}_restaurant_id"),
            table,
            ["restaurant_id"],
            unique=False,
        )


def downgrade() -> None:
    for table in reversed(_NEW_TENANT_TABLES):
        op.drop_index(op.f(f"ix_{table}_restaurant_id"), table_name=table)
        op.drop_constraint(f"fk_{table}_restaurant_id", table, type_="foreignkey")
        op.drop_column(table, "restaurant_id")
