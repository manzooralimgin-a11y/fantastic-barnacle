from __future__ import annotations

import os
import subprocess
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

import psycopg2
import pytest
import sqlalchemy as sa
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from app.database import Base
from app.config import settings

# Import all model modules so Base.metadata is complete.
from app.accounting.models import Budget, ChartOfAccount, GLEntry, Invoice, Reconciliation  # noqa: F401
from app.auth.models import Restaurant, User  # noqa: F401
from app.billing.models import Bill, CashShift, KDSStationConfig, OrderItem, Payment, TableOrder  # noqa: F401
from app.core.models import AgentAction, AgentConfig, AgentLog  # noqa: F401
from app.dashboard.models import Alert, DashboardQuery, KPISnapshot  # noqa: F401
from app.digital_twin.models import Scenario, SimulationRun  # noqa: F401
from app.food_safety.models import AllergenAlert, ComplianceScore, HACCPLog, TemperatureReading  # noqa: F401
from app.forecasting.models import Forecast, ForecastInput  # noqa: F401
from app.franchise.models import Benchmark, Location, LocationMetric  # noqa: F401
from app.guests.models import GuestProfile, LoyaltyAccount, Order, Promotion  # noqa: F401
from app.hms.models import HotelProperty, HotelReservation, Room, RoomType  # noqa: F401
from app.integrations.models import WebhookAudit, WebhookEvent  # noqa: F401
from app.inventory.models import AutoPurchaseRule, InventoryItem, InventoryMovement, PurchaseOrder, SupplierCatalogItem, TVAReport, Vendor  # noqa: F401
from app.maintenance.models import EnergyReading, Equipment, IoTReading, MaintenanceTicket  # noqa: F401
from app.marketing.models import Campaign, Review, SocialPost  # noqa: F401
from app.menu.models import MenuCategory, MenuCombo, MenuItem, MenuItemModifier, MenuModifier, UpsellRule  # noqa: F401
from app.menu_designer.models import MenuDesign, MenuTemplate  # noqa: F401
from app.reservations.models import FloorSection, QRTableCode, Reservation, Table, TableSession, WaitlistEntry  # noqa: F401
from app.signage.models import SignageContent, SignagePlaylist, SignageScreen  # noqa: F401
from app.vision.models import ComplianceEvent, VisionAlert, WasteLog  # noqa: F401
from app.workforce.models import Applicant, Employee, Schedule, Shift, TrainingModule, TrainingProgress  # noqa: F401


BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_EXECUTABLE = Path(sys.executable).with_name("alembic")

_ALLOWED_DEFAULT_DIFFS = {
    ("hms_reservations", "zahlungs_status"),
    ("revenue_control_policies", "kill_switch"),
    ("revenue_control_policies", "daily_budget_cap"),
    ("revenue_control_policies", "experiment_budget_cap"),
    ("revenue_control_policies", "max_discount_pct"),
    ("revenue_control_policies", "max_price_change_pct"),
    ("revenue_control_policies", "min_margin_pct"),
    ("revenue_control_policies", "is_active"),
    ("revenue_experiment_events", "exposures"),
    ("revenue_experiment_events", "conversions"),
    ("revenue_experiment_events", "revenue_amount"),
    ("revenue_experiment_events", "spend_amount"),
    ("revenue_experiments", "status"),
    ("revenue_experiments", "exposures"),
    ("revenue_experiments", "conversions"),
    ("revenue_experiments", "revenue_amount"),
    ("revenue_experiments", "spent_amount"),
    ("tables", "rotation"),
    ("tables", "width"),
    ("tables", "height"),
    ("vouchers", "is_gift_card"),
}


def _maintenance_dsn() -> str:
    parsed = urlparse(settings.database_url_sync)
    if not parsed.scheme or not parsed.hostname or not parsed.path:
        raise RuntimeError(f"Unsupported database URL for migration smoke tests: {settings.database_url_sync}")
    return parsed._replace(path="/postgres").geturl()


def _build_temp_sync_dsn(db_name: str) -> str:
    parsed = urlparse(settings.database_url_sync)
    return parsed._replace(path=f"/{db_name}").geturl()


def _run_alembic(*args: str, env: dict[str, str]) -> str:
    completed = subprocess.run(
        [str(ALEMBIC_EXECUTABLE), "-c", "alembic.ini", *args],
        cwd=BACKEND_DIR,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    output = f"{completed.stdout}{completed.stderr}"
    assert completed.returncode == 0, output
    return output


@contextmanager
def disposable_database() -> Iterator[str]:
    db_name = f"test_migration_{uuid4().hex[:10]}"
    admin_dsn = _maintenance_dsn()
    sync_dsn = _build_temp_sync_dsn(db_name)
    try:
        admin = psycopg2.connect(admin_dsn)
    except psycopg2.Error as exc:  # pragma: no cover - environment-dependent skip
        pytest.skip(f"PostgreSQL admin connection unavailable for migration smoke tests: {exc}")
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
        cur.execute(f'CREATE DATABASE "{db_name}"')
    admin.close()

    try:
        yield sync_dsn
    finally:
        admin = psycopg2.connect(admin_dsn)
        admin.autocommit = True
        try:
            for attempt in range(10):
                try:
                    with admin.cursor() as cur:
                        try:
                            cur.execute(
                                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = %s AND pid <> pg_backend_pid()",
                                (db_name,),
                            )
                        except psycopg2.errors.InsufficientPrivilege:
                            # Some local Postgres setups expose superuser-owned
                            # connections we cannot terminate. Retrying the drop
                            # is still safe and often succeeds once those
                            # connections settle on their own.
                            pass
                        cur.execute(f'DROP DATABASE IF EXISTS "{db_name}"')
                    break
                except psycopg2.errors.ObjectInUse:
                    if attempt == 9:
                        raise
                    time.sleep(0.2)
        finally:
            admin.close()


def _migration_env(sync_dsn: str) -> dict[str, str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = sync_dsn
    env["DATABASE_URL_SYNC"] = sync_dsn
    env["PYTHONPATH"] = str(BACKEND_DIR)
    return env


def _flatten_diffs(diffs: list[object]) -> list[tuple]:
    flattened: list[tuple] = []

    def visit(node: object) -> None:
        if isinstance(node, tuple):
            flattened.append(node)
            return
        if isinstance(node, list):
            for item in node:
                visit(item)

    for diff in diffs:
        visit(diff)
    return flattened


def test_alembic_upgrade_downgrade_reupgrade_cycle() -> None:
    with disposable_database() as sync_dsn:
        env = _migration_env(sync_dsn)

        _run_alembic("upgrade", "head", env=env)
        current_after_upgrade = _run_alembic("current", env=env)
        _run_alembic("downgrade", "base", env=env)
        _run_alembic("upgrade", "head", env=env)
        current_after_reupgrade = _run_alembic("current", env=env)

    assert "(head)" in current_after_upgrade
    assert "(head)" in current_after_reupgrade


def test_migrated_schema_matches_models_except_known_server_defaults() -> None:
    with disposable_database() as sync_dsn:
        env = _migration_env(sync_dsn)
        _run_alembic("upgrade", "head", env=env)

        engine = sa.create_engine(sync_dsn)
        try:
            with engine.connect() as connection:
                context = MigrationContext.configure(
                    connection,
                    opts={
                        "compare_type": True,
                        "compare_server_default": True,
                        "target_metadata": Base.metadata,
                    },
                )
                flattened_diffs = _flatten_diffs(compare_metadata(context, Base.metadata))
                non_default_diffs = [diff for diff in flattened_diffs if diff[0] != "modify_default"]
                unexpected_default_diffs = [
                    diff
                    for diff in flattened_diffs
                    if diff[0] == "modify_default" and (diff[2], diff[3]) not in _ALLOWED_DEFAULT_DIFFS
                ]

                inspector = sa.inspect(connection)
                voucher_columns = {col["name"] for col in inspector.get_columns("vouchers")}
                assert {"amount_total", "amount_remaining", "status", "is_gift_card", "purchaser_name"} <= voucher_columns
                assert {"value", "voucher_type", "uses_count", "is_active"}.isdisjoint(voucher_columns)

                reservation_columns = {col["name"] for col in inspector.get_columns("reservations")}
                assert {"payment_status", "stripe_payment_intent_id"} <= reservation_columns

                hms_reservation_columns = {col["name"] for col in inspector.get_columns("hms_reservations")}
                assert {"room_type_id", "booking_id", "payment_status", "stripe_payment_intent_id"} <= hms_reservation_columns
        finally:
            engine.dispose()

    assert non_default_diffs == [], f"Unexpected structural schema drift: {non_default_diffs!r}"
    assert unexpected_default_diffs == [], f"Unexpected server-default drift: {unexpected_default_diffs!r}"
