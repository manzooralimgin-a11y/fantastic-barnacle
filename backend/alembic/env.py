import asyncio
import os
import sys

# Add parent directory to sys.path to allow importing 'app'
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.database import Base

# Import all models so Alembic can detect them
from app.auth.models import User, Restaurant  # noqa: F401
from app.core.models import AgentAction, AgentLog, AgentConfig  # noqa: F401
from app.accounting.models import ChartOfAccount, GLEntry, Invoice, Budget, Reconciliation  # noqa: F401
from app.vision.models import VisionAlert, WasteLog, ComplianceEvent  # noqa: F401
from app.forecasting.models import Forecast, ForecastInput  # noqa: F401
from app.inventory.models import InventoryItem, PurchaseOrder, Vendor, InventoryMovement, TVAReport, SupplierCatalogItem, AutoPurchaseRule  # noqa: F401
from app.workforce.models import Employee, Schedule, Shift, Applicant, TrainingModule, TrainingProgress  # noqa: F401
from app.guests.models import GuestProfile, Order, LoyaltyAccount, Promotion  # noqa: F401
from app.dashboard.models import DashboardQuery, Alert, KPISnapshot  # noqa: F401
from app.maintenance.models import Equipment, IoTReading, MaintenanceTicket, EnergyReading  # noqa: F401
from app.digital_twin.models import Scenario, SimulationRun  # noqa: F401
from app.food_safety.models import HACCPLog, TemperatureReading, AllergenAlert, ComplianceScore  # noqa: F401
from app.franchise.models import Location, LocationMetric, Benchmark  # noqa: F401
from app.marketing.models import Review, Campaign, SocialPost  # noqa: F401
from app.menu.models import MenuCategory, MenuItem, MenuModifier, MenuItemModifier, MenuCombo, UpsellRule  # noqa: F401
from app.reservations.models import FloorSection, Table, Reservation, WaitlistEntry, TableSession, QRTableCode  # noqa: F401
from app.billing.models import TableOrder, OrderItem, Bill, Payment, CashShift, KDSStationConfig  # noqa: F401
from app.vouchers.models import Voucher, VoucherRedemption, CustomerCard  # noqa: F401
from app.menu_designer.models import MenuTemplate, MenuDesign  # noqa: F401
from app.signage.models import SignageScreen, SignageContent, SignagePlaylist  # noqa: F401
from app.integrations.models import WebhookEvent, WebhookAudit  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations():
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
