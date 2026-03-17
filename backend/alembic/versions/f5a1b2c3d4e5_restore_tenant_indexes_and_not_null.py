"""restore tenant indexes and NOT NULL constraints

This migration corrects the destructive e277dec60b9a migration which
accidentally dropped all restaurant_id indexes and made the column nullable
on 25+ tables.  Only the table_number length change was intentional.

Revision ID: f5a1b2c3d4e5
Revises: e277dec60b9a
Create Date: 2026-03-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f5a1b2c3d4e5"
down_revision: Union[str, None] = "e277dec60b9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Tables where restaurant_id must be NOT NULL + indexed
_TENANT_TABLES = [
    "auto_purchase_rules",
    "bills",
    "cash_shifts",
    "floor_sections",
    "guest_profiles",
    "inventory_items",
    "inventory_movements",
    "kds_station_configs",
    "loyalty_accounts",
    "menu_categories",
    "menu_combos",
    "menu_items",
    "menu_modifiers",
    "order_items",
    "orders",
    "payments",
    "promotions",
    "purchase_orders",
    "qr_table_codes",
    "reservations",
    "supplier_catalog_items",
    "table_orders",
    "table_sessions",
    "tables",
    "tva_reports",
    "upsell_rules",
    "vendors",
    "waitlist",
]

# Composite indexes that were dropped and need restoration
_COMPOSITE_INDEXES = [
    ("ix_alerts_owner", "alerts", ["owner"]),
    ("ix_alerts_status", "alerts", ["status"]),
    ("ix_audit_events_actor_type", "audit_events", ["actor_type"]),
    ("ix_audit_events_entity_type_entity_id", "audit_events", ["entity_type", "entity_id"]),
    ("ix_audit_events_source_module", "audit_events", ["source_module"]),
    ("ix_revenue_control_policies_restaurant_id", "revenue_control_policies", ["restaurant_id"]),
    ("ix_revenue_experiment_events_experiment_variant", "revenue_experiment_events", ["experiment_id", "variant_key"]),
    ("ix_revenue_experiment_events_restaurant_recorded", "revenue_experiment_events", ["restaurant_id", "recorded_at"]),
    ("ix_revenue_experiments_restaurant_status", "revenue_experiments", ["restaurant_id", "status"]),
    ("ix_revenue_upsell_recommendations_restaurant_generated", "revenue_upsell_recommendations", ["restaurant_id", "generated_at"]),
    ("ix_service_autopilot_predictions_restaurant_target", "service_autopilot_predictions", ["restaurant_id", "target_time"]),
    ("ix_service_autopilot_predictions_table_generated", "service_autopilot_predictions", ["table_id", "generated_at"]),
]


def upgrade() -> None:
    # 1. Backfill any NULLs to restaurant_id=1 (safe default for single-tenant deployment)
    for table in _TENANT_TABLES:
        op.execute(
            sa.text(f"UPDATE {table} SET restaurant_id = 1 WHERE restaurant_id IS NULL")
        )

    # 2. Restore NOT NULL constraint
    for table in _TENANT_TABLES:
        op.alter_column(
            table,
            "restaurant_id",
            existing_type=sa.INTEGER(),
            nullable=False,
        )

    # 3. Restore restaurant_id indexes
    for table in _TENANT_TABLES:
        op.create_index(
            op.f(f"ix_{table}_restaurant_id"),
            table,
            ["restaurant_id"],
            unique=False,
            if_not_exists=True,
        )

    # 4. Restore composite/other indexes
    for idx_name, table, columns in _COMPOSITE_INDEXES:
        op.create_index(
            op.f(idx_name),
            table,
            columns,
            unique=False,
            if_not_exists=True,
        )


def downgrade() -> None:
    # Reverse: drop restored indexes and make nullable again
    for idx_name, table, columns in _COMPOSITE_INDEXES:
        op.drop_index(op.f(idx_name), table_name=table, if_exists=True)

    for table in _TENANT_TABLES:
        op.drop_index(op.f(f"ix_{table}_restaurant_id"), table_name=table, if_exists=True)
        op.alter_column(
            table,
            "restaurant_id",
            existing_type=sa.INTEGER(),
            nullable=True,
        )
