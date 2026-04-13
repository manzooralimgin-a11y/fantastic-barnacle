"""add hotel revenue tables

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-04-10 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
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

    if not has_table("hms_rate_seasons"):
        op.create_table(
            "hms_rate_seasons",
            sa.Column("property_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=120), nullable=False),
            sa.Column("start_date", sa.Date(), nullable=False),
            sa.Column("end_date", sa.Date(), nullable=False),
            sa.Column("color_hex", sa.String(length=20), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    create_index_if_missing("ix_hms_rate_seasons_property_id", "hms_rate_seasons", ["property_id"])
    create_index_if_missing("ix_hms_rate_seasons_start_date", "hms_rate_seasons", ["start_date"])
    create_index_if_missing("ix_hms_rate_seasons_end_date", "hms_rate_seasons", ["end_date"])

    if not has_table("hms_rate_plans"):
        op.create_table(
        "hms_rate_plans",
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("room_type_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="EUR"),
        sa.Column("base_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["hms_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_type_id"], ["hms_room_types.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id", "code", name="uq_hms_rate_plans_property_code"),
        )
    create_index_if_missing("ix_hms_rate_plans_property_id", "hms_rate_plans", ["property_id"])
    create_index_if_missing("ix_hms_rate_plans_room_type_id", "hms_rate_plans", ["room_type_id"])
    create_index_if_missing("ix_hms_rate_plans_code", "hms_rate_plans", ["code"])

    if not has_table("hms_rate_plan_prices"):
        op.create_table(
        "hms_rate_plan_prices",
        sa.Column("rate_plan_id", sa.Integer(), nullable=False),
        sa.Column("rate_date", sa.Date(), nullable=False),
        sa.Column("season_id", sa.Integer(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["rate_plan_id"], ["hms_rate_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["season_id"], ["hms_rate_seasons.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rate_plan_id", "rate_date", name="uq_hms_rate_plan_prices_plan_date"),
        )
    create_index_if_missing("ix_hms_rate_plan_prices_rate_plan_id", "hms_rate_plan_prices", ["rate_plan_id"])
    create_index_if_missing("ix_hms_rate_plan_prices_rate_date", "hms_rate_plan_prices", ["rate_date"])
    create_index_if_missing("ix_hms_rate_plan_prices_season_id", "hms_rate_plan_prices", ["season_id"])

    if not has_table("hms_rate_restrictions"):
        op.create_table(
        "hms_rate_restrictions",
        sa.Column("rate_plan_id", sa.Integer(), nullable=False),
        sa.Column("restriction_date", sa.Date(), nullable=False),
        sa.Column("closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closed_to_arrival", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closed_to_departure", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("min_stay", sa.Integer(), nullable=True),
        sa.Column("max_stay", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["rate_plan_id"], ["hms_rate_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rate_plan_id", "restriction_date", name="uq_hms_rate_restrictions_plan_date"),
        )
    create_index_if_missing("ix_hms_rate_restrictions_rate_plan_id", "hms_rate_restrictions", ["rate_plan_id"])
    create_index_if_missing("ix_hms_rate_restrictions_restriction_date", "hms_rate_restrictions", ["restriction_date"])


def downgrade() -> None:
    op.drop_index("ix_hms_rate_restrictions_restriction_date", table_name="hms_rate_restrictions")
    op.drop_index("ix_hms_rate_restrictions_rate_plan_id", table_name="hms_rate_restrictions")
    op.drop_table("hms_rate_restrictions")

    op.drop_index("ix_hms_rate_plan_prices_season_id", table_name="hms_rate_plan_prices")
    op.drop_index("ix_hms_rate_plan_prices_rate_date", table_name="hms_rate_plan_prices")
    op.drop_index("ix_hms_rate_plan_prices_rate_plan_id", table_name="hms_rate_plan_prices")
    op.drop_table("hms_rate_plan_prices")

    op.drop_index("ix_hms_rate_plans_code", table_name="hms_rate_plans")
    op.drop_index("ix_hms_rate_plans_room_type_id", table_name="hms_rate_plans")
    op.drop_index("ix_hms_rate_plans_property_id", table_name="hms_rate_plans")
    op.drop_table("hms_rate_plans")

    op.drop_index("ix_hms_rate_seasons_end_date", table_name="hms_rate_seasons")
    op.drop_index("ix_hms_rate_seasons_start_date", table_name="hms_rate_seasons")
    op.drop_index("ix_hms_rate_seasons_property_id", table_name="hms_rate_seasons")
    op.drop_table("hms_rate_seasons")
