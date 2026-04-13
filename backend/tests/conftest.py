from __future__ import annotations

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from datetime import date, datetime, timezone
import time as time_module
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import Restaurant, UserRole
from app.billing.models import TableOrder
from app.database import engine
from app.dependencies import HotelAccessContext, get_current_hotel_user, get_current_tenant_user, get_optional_current_tenant_user
from app.email_inbox.models import EmailThread
from app.guests.models import GuestProfile
from app.hms.rbac import LEGACY_USER_ROLE_TO_HOTEL_ROLE, hotel_permissions_for_legacy_role
from app.inventory.models import InventoryItem, Vendor
from app.main import app
from app.menu.models import MenuCategory, MenuItem
from app.reservations.models import FloorSection, Reservation, Table
from app.security import rate_limit
from app.security.rate_limit import reset_rate_limit_counters


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture(autouse=True)
async def isolate_rate_limit_counters() -> AsyncGenerator[None, None]:
    await reset_rate_limit_counters()
    try:
        yield
    finally:
        await reset_rate_limit_counters()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def ensure_test_schema_compatibility() -> AsyncGenerator[None, None]:
    """Keep the shared test database aligned with the current voucher model.

    The backend tests run against a reusable local database in this workspace, so
    they may encounter a schema that predates the latest idempotent Alembic head.
    Apply the last safe voucher compatibility columns up front so the suite can
    exercise the current code without mutating feature logic.
    """

    async with engine.begin() as connection:
        await connection.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS active_property_id INTEGER REFERENCES hms_properties(id) ON DELETE SET NULL"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS salutation VARCHAR(20)"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS birthday DATE"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS country_code VARCHAR(10)"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS country_name VARCHAR(100)"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS custom_fields_json JSON"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_guest_profiles_birthday ON guest_profiles (birthday)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_guest_profiles_country_code ON guest_profiles (country_code)"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_gift_card BOOLEAN NOT NULL DEFAULT FALSE"
        )
        await connection.exec_driver_sql(
            "ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS purchaser_name VARCHAR(255)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS email_threads (
                id SERIAL PRIMARY KEY,
                external_email_id VARCHAR(255) NOT NULL UNIQUE,
                sender VARCHAR(255) NOT NULL,
                subject VARCHAR(500),
                body TEXT NOT NULL,
                received_at TIMESTAMPTZ NOT NULL,
                raw_email JSON NOT NULL,
                category VARCHAR(20) NOT NULL DEFAULT 'pending',
                classification_confidence DOUBLE PRECISION,
                extracted_data JSON,
                summary VARCHAR(500),
                reply_generated BOOLEAN NOT NULL DEFAULT FALSE,
                reply_sent BOOLEAN NOT NULL DEFAULT FALSE,
                reply_content TEXT,
                reply_generated_at TIMESTAMPTZ,
                reply_sent_at TIMESTAMPTZ,
                replied_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                reply_mode VARCHAR(20) NOT NULL DEFAULT 'generate_only',
                processing_error TEXT,
                reply_error TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_received_at ON email_threads (received_at)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_category ON email_threads (category)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_status ON email_threads (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_category_status ON email_threads (category, status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_email_threads_reply_sent ON email_threads (reply_sent)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_roles (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                description VARCHAR(500),
                is_system BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_permissions (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) NOT NULL UNIQUE,
                name VARCHAR(255) NOT NULL,
                description VARCHAR(500),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_role_permissions (
                id SERIAL PRIMARY KEY,
                role_id INTEGER NOT NULL REFERENCES hms_roles(id) ON DELETE CASCADE,
                permission_id INTEGER NOT NULL REFERENCES hms_permissions(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_hms_role_permission UNIQUE (role_id, permission_id)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_role_permissions_role_id ON hms_role_permissions (role_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_role_permissions_permission_id ON hms_role_permissions (permission_id)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_user_property_roles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                role_id INTEGER NOT NULL REFERENCES hms_roles(id) ON DELETE CASCADE,
                assigned_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_hms_user_property_role UNIQUE (user_id, property_id, role_id)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_user_property_roles_user_id ON hms_user_property_roles (user_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_user_property_roles_property_id ON hms_user_property_roles (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_user_property_roles_role_id ON hms_user_property_roles (role_id)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_stays (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                reservation_id INTEGER NOT NULL REFERENCES hms_reservations(id) ON DELETE CASCADE,
                room_id INTEGER REFERENCES hms_rooms(id) ON DELETE SET NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'booked',
                planned_check_in DATE NOT NULL,
                planned_check_out DATE NOT NULL,
                actual_check_in_at TIMESTAMPTZ,
                actual_check_out_at TIMESTAMPTZ,
                notes VARCHAR(500),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_hms_stays_reservation_id UNIQUE (reservation_id)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stays_property_id ON hms_stays (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stays_reservation_id ON hms_stays (reservation_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stays_room_id ON hms_stays (room_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stays_status ON hms_stays (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stays_planned_check_in ON hms_stays (planned_check_in)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stays_planned_check_out ON hms_stays (planned_check_out)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_folios (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                stay_id INTEGER NOT NULL REFERENCES hms_stays(id) ON DELETE CASCADE,
                reservation_id INTEGER NOT NULL REFERENCES hms_reservations(id) ON DELETE CASCADE,
                folio_number VARCHAR(50) NOT NULL,
                currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
                status VARCHAR(20) NOT NULL DEFAULT 'open',
                subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
                tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
                total NUMERIC(12,2) NOT NULL DEFAULT 0,
                balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
                paid_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_hms_folios_property_id_folio_number UNIQUE (property_id, folio_number),
                CONSTRAINT uq_hms_folios_stay_id UNIQUE (stay_id),
                CONSTRAINT uq_hms_folios_reservation_id UNIQUE (reservation_id)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folios_property_id ON hms_folios (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folios_stay_id ON hms_folios (stay_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folios_reservation_id ON hms_folios (reservation_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folios_status ON hms_folios (status)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_folio_lines (
                id SERIAL PRIMARY KEY,
                folio_id INTEGER NOT NULL REFERENCES hms_folios(id) ON DELETE CASCADE,
                charge_type VARCHAR(30) NOT NULL DEFAULT 'service',
                description VARCHAR(255) NOT NULL,
                quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
                unit_price NUMERIC(12,2) NOT NULL,
                total_price NUMERIC(12,2) NOT NULL,
                service_date DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'posted',
                metadata_json JSON,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folio_lines_folio_id ON hms_folio_lines (folio_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folio_lines_charge_type ON hms_folio_lines (charge_type)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folio_lines_status ON hms_folio_lines (status)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_folio_payments (
                id SERIAL PRIMARY KEY,
                folio_id INTEGER NOT NULL REFERENCES hms_folios(id) ON DELETE CASCADE,
                amount NUMERIC(12,2) NOT NULL,
                method VARCHAR(30) NOT NULL,
                reference VARCHAR(255),
                status VARCHAR(20) NOT NULL DEFAULT 'completed',
                paid_at TIMESTAMPTZ,
                processing_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
                gateway_reference VARCHAR(255),
                card_last_four VARCHAR(4),
                card_brand VARCHAR(30),
                wallet_type VARCHAR(30),
                refund_of_id INTEGER REFERENCES hms_folio_payments(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folio_payments_folio_id ON hms_folio_payments (folio_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_folio_payments_status ON hms_folio_payments (status)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_housekeeping_tasks (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                room_id INTEGER NOT NULL REFERENCES hms_rooms(id) ON DELETE CASCADE,
                task_type VARCHAR(30) NOT NULL,
                title VARCHAR(255) NOT NULL,
                description VARCHAR(1000),
                priority VARCHAR(20) NOT NULL DEFAULT 'normal',
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                assigned_to_name VARCHAR(255),
                due_date DATE,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                notes VARCHAR(1000),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_room_daily_notes (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                room_id INTEGER NOT NULL REFERENCES hms_rooms(id) ON DELETE CASCADE,
                note_date DATE NOT NULL,
                housekeeping_note VARCHAR(2000),
                maintenance_note VARCHAR(2000),
                maintenance_required BOOLEAN NOT NULL DEFAULT FALSE,
                created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                CONSTRAINT uq_hms_room_daily_notes_room_date UNIQUE (property_id, room_id, note_date)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_daily_notes_property_id ON hms_room_daily_notes (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_daily_notes_room_id ON hms_room_daily_notes (room_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_daily_notes_note_date ON hms_room_daily_notes (note_date)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_housekeeping_tasks_property_id ON hms_housekeeping_tasks (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_housekeeping_tasks_room_id ON hms_housekeeping_tasks (room_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_housekeeping_tasks_task_type ON hms_housekeeping_tasks (task_type)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_housekeeping_tasks_priority ON hms_housekeeping_tasks (priority)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_housekeeping_tasks_status ON hms_housekeeping_tasks (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_housekeeping_tasks_due_date ON hms_housekeeping_tasks (due_date)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_room_status_history (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                room_id INTEGER NOT NULL REFERENCES hms_rooms(id) ON DELETE CASCADE,
                previous_status VARCHAR(30),
                new_status VARCHAR(30) NOT NULL,
                reason VARCHAR(255),
                changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                task_id INTEGER REFERENCES hms_housekeeping_tasks(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_status_history_property_id ON hms_room_status_history (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_status_history_room_id ON hms_room_status_history (room_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_status_history_new_status ON hms_room_status_history (new_status)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_room_blockings (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                room_id INTEGER NOT NULL REFERENCES hms_rooms(id) ON DELETE CASCADE,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                reason VARCHAR(255) NOT NULL,
                notes VARCHAR(1000),
                blocked_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                released_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                released_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_blockings_property_id ON hms_room_blockings (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_blockings_room_id ON hms_room_blockings (room_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_blockings_start_date ON hms_room_blockings (start_date)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_blockings_end_date ON hms_room_blockings (end_date)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_room_blockings_status ON hms_room_blockings (status)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_stay_assignments (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                stay_id INTEGER NOT NULL REFERENCES hms_stays(id) ON DELETE CASCADE,
                room_id INTEGER NOT NULL REFERENCES hms_rooms(id) ON DELETE CASCADE,
                assignment_type VARCHAR(30) NOT NULL DEFAULT 'move',
                assigned_from DATE NOT NULL,
                assigned_to DATE NOT NULL,
                changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                notes VARCHAR(500),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stay_assignments_property_id ON hms_stay_assignments (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stay_assignments_stay_id ON hms_stay_assignments (stay_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stay_assignments_room_id ON hms_stay_assignments (room_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stay_assignments_assignment_type ON hms_stay_assignments (assignment_type)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stay_assignments_assigned_from ON hms_stay_assignments (assigned_from)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_stay_assignments_assigned_to ON hms_stay_assignments (assigned_to)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS document_blueprints (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) NOT NULL UNIQUE,
                document_kind VARCHAR(50) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description VARCHAR(500),
                default_title_template VARCHAR(255) NOT NULL,
                default_subject_template VARCHAR(255),
                default_body_template VARCHAR(5000) NOT NULL,
                metadata_json JSON,
                is_system BOOLEAN NOT NULL DEFAULT TRUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_blueprints_document_kind ON document_blueprints (document_kind)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_blueprints_is_active ON document_blueprints (is_active)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS document_templates (
                id SERIAL PRIMARY KEY,
                property_id INTEGER REFERENCES hms_properties(id) ON DELETE CASCADE,
                blueprint_id INTEGER NOT NULL REFERENCES document_blueprints(id) ON DELETE CASCADE,
                code VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                language VARCHAR(10) NOT NULL DEFAULT 'de',
                subject_template VARCHAR(255),
                title_template VARCHAR(255) NOT NULL,
                body_template VARCHAR(5000) NOT NULL,
                metadata_json JSON,
                is_default BOOLEAN NOT NULL DEFAULT TRUE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_templates_property_id ON document_templates (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_templates_blueprint_id ON document_templates (blueprint_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_templates_code ON document_templates (code)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_templates_is_default ON document_templates (is_default)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_document_templates_is_active ON document_templates (is_active)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                reservation_id INTEGER REFERENCES hms_reservations(id) ON DELETE SET NULL,
                stay_id INTEGER REFERENCES hms_stays(id) ON DELETE SET NULL,
                folio_id INTEGER REFERENCES hms_folios(id) ON DELETE SET NULL,
                blueprint_id INTEGER REFERENCES document_blueprints(id) ON DELETE SET NULL,
                template_id INTEGER REFERENCES document_templates(id) ON DELETE SET NULL,
                document_kind VARCHAR(50) NOT NULL,
                document_number VARCHAR(100) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'generated',
                subject VARCHAR(255),
                title VARCHAR(255) NOT NULL,
                body_text VARCHAR(12000) NOT NULL,
                payload_json JSON,
                metadata_json JSON,
                issued_at TIMESTAMPTZ,
                created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_documents_property_id_document_number UNIQUE (property_id, document_number)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_property_id ON documents (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_reservation_id ON documents (reservation_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_stay_id ON documents (stay_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_folio_id ON documents (folio_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_blueprint_id ON documents (blueprint_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_template_id ON documents (template_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_document_kind ON documents (document_kind)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_document_number ON documents (document_number)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_status ON documents (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_documents_issued_at ON documents (issued_at)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_invoices (
                id SERIAL PRIMARY KEY,
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                reservation_id INTEGER NOT NULL REFERENCES hms_reservations(id) ON DELETE CASCADE,
                stay_id INTEGER REFERENCES hms_stays(id) ON DELETE SET NULL,
                folio_id INTEGER NOT NULL REFERENCES hms_folios(id) ON DELETE CASCADE,
                document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
                invoice_number VARCHAR(100) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
                recipient_name VARCHAR(255),
                recipient_email VARCHAR(255),
                issued_at TIMESTAMPTZ,
                sent_at TIMESTAMPTZ,
                metadata_json JSON,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                CONSTRAINT uq_hms_invoices_property_id_invoice_number UNIQUE (property_id, invoice_number)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_property_id ON hms_invoices (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_reservation_id ON hms_invoices (reservation_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_stay_id ON hms_invoices (stay_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_folio_id ON hms_invoices (folio_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_document_id ON hms_invoices (document_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_invoice_number ON hms_invoices (invoice_number)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_status ON hms_invoices (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_issued_at ON hms_invoices (issued_at)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoices_sent_at ON hms_invoices (sent_at)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_invoice_lines (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER NOT NULL REFERENCES hms_invoices(id) ON DELETE CASCADE,
                folio_line_id INTEGER REFERENCES hms_folio_lines(id) ON DELETE SET NULL,
                line_number INTEGER NOT NULL,
                charge_type VARCHAR(30) NOT NULL DEFAULT 'service',
                description VARCHAR(255) NOT NULL,
                quantity NUMERIC(10,2) NOT NULL,
                unit_price NUMERIC(12,2) NOT NULL,
                net_amount NUMERIC(12,2) NOT NULL,
                tax_rate NUMERIC(5,2) NOT NULL,
                tax_amount NUMERIC(12,2) NOT NULL,
                gross_amount NUMERIC(12,2) NOT NULL,
                service_date DATE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_lines_invoice_id ON hms_invoice_lines (invoice_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_lines_folio_line_id ON hms_invoice_lines (folio_line_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_lines_charge_type ON hms_invoice_lines (charge_type)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_invoice_deliveries (
                id SERIAL PRIMARY KEY,
                invoice_id INTEGER NOT NULL REFERENCES hms_invoices(id) ON DELETE CASCADE,
                document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
                channel VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'queued',
                recipient_email VARCHAR(255),
                subject VARCHAR(255),
                message VARCHAR(5000),
                sent_at TIMESTAMPTZ,
                error_message VARCHAR(1000),
                metadata_json JSON,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_deliveries_invoice_id ON hms_invoice_deliveries (invoice_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_deliveries_document_id ON hms_invoice_deliveries (document_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_deliveries_channel ON hms_invoice_deliveries (channel)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_deliveries_status ON hms_invoice_deliveries (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_invoice_deliveries_sent_at ON hms_invoice_deliveries (sent_at)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_rate_seasons (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                name VARCHAR(120) NOT NULL,
                start_date DATE NOT NULL,
                end_date DATE NOT NULL,
                color_hex VARCHAR(20),
                is_active BOOLEAN NOT NULL DEFAULT TRUE
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_seasons_property_id ON hms_rate_seasons (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_seasons_start_date ON hms_rate_seasons (start_date)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_seasons_end_date ON hms_rate_seasons (end_date)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_rate_plans (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                room_type_id INTEGER NOT NULL REFERENCES hms_room_types(id) ON DELETE CASCADE,
                code VARCHAR(80) NOT NULL,
                name VARCHAR(255) NOT NULL,
                currency VARCHAR(10) NOT NULL,
                base_price NUMERIC(12,2) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                CONSTRAINT uq_hms_rate_plans_property_code UNIQUE (property_id, code)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_plans_property_id ON hms_rate_plans (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_plans_room_type_id ON hms_rate_plans (room_type_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_plans_code ON hms_rate_plans (code)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_rate_plan_prices (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                rate_plan_id INTEGER NOT NULL REFERENCES hms_rate_plans(id) ON DELETE CASCADE,
                rate_date DATE NOT NULL,
                season_id INTEGER REFERENCES hms_rate_seasons(id) ON DELETE SET NULL,
                price NUMERIC(12,2) NOT NULL,
                CONSTRAINT uq_hms_rate_plan_prices_plan_date UNIQUE (rate_plan_id, rate_date)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_plan_prices_rate_plan_id ON hms_rate_plan_prices (rate_plan_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_plan_prices_rate_date ON hms_rate_plan_prices (rate_date)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_plan_prices_season_id ON hms_rate_plan_prices (season_id)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_rate_restrictions (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                rate_plan_id INTEGER NOT NULL REFERENCES hms_rate_plans(id) ON DELETE CASCADE,
                restriction_date DATE NOT NULL,
                closed BOOLEAN NOT NULL DEFAULT FALSE,
                closed_to_arrival BOOLEAN NOT NULL DEFAULT FALSE,
                closed_to_departure BOOLEAN NOT NULL DEFAULT FALSE,
                min_stay INTEGER,
                max_stay INTEGER,
                notes VARCHAR(500),
                CONSTRAINT uq_hms_rate_restrictions_plan_date UNIQUE (rate_plan_id, restriction_date)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_restrictions_rate_plan_id ON hms_rate_restrictions (rate_plan_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_rate_restrictions_restriction_date ON hms_rate_restrictions (restriction_date)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_message_templates (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                property_id INTEGER REFERENCES hms_properties(id) ON DELETE CASCADE,
                code VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                channel VARCHAR(20) NOT NULL,
                category VARCHAR(50) NOT NULL,
                subject_template VARCHAR(255),
                body_template VARCHAR(5000) NOT NULL,
                metadata_json JSON,
                is_default BOOLEAN NOT NULL DEFAULT FALSE,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                CONSTRAINT uq_hms_message_templates_property_code UNIQUE (property_id, code)
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_templates_property_id ON hms_message_templates (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_templates_code ON hms_message_templates (code)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_templates_channel ON hms_message_templates (channel)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_templates_category ON hms_message_templates (category)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_templates_is_default ON hms_message_templates (is_default)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_templates_is_active ON hms_message_templates (is_active)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_message_threads (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                reservation_id INTEGER REFERENCES hms_reservations(id) ON DELETE SET NULL,
                guest_id INTEGER REFERENCES guest_profiles(id) ON DELETE SET NULL,
                channel VARCHAR(20) NOT NULL,
                status VARCHAR(20) NOT NULL,
                subject VARCHAR(255),
                guest_name VARCHAR(255),
                guest_email VARCHAR(255),
                last_message_at TIMESTAMPTZ,
                last_direction VARCHAR(20),
                created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_threads_property_id ON hms_message_threads (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_threads_reservation_id ON hms_message_threads (reservation_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_threads_guest_id ON hms_message_threads (guest_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_threads_channel ON hms_message_threads (channel)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_threads_status ON hms_message_threads (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_threads_last_message_at ON hms_message_threads (last_message_at)"
        )
        await connection.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS hms_message_events (
                id SERIAL PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                property_id INTEGER NOT NULL REFERENCES hms_properties(id) ON DELETE CASCADE,
                thread_id INTEGER NOT NULL REFERENCES hms_message_threads(id) ON DELETE CASCADE,
                template_id INTEGER REFERENCES hms_message_templates(id) ON DELETE SET NULL,
                direction VARCHAR(20) NOT NULL,
                channel VARCHAR(20) NOT NULL,
                subject VARCHAR(255),
                body_text VARCHAR(5000) NOT NULL,
                sender_email VARCHAR(255),
                recipient_email VARCHAR(255),
                status VARCHAR(20) NOT NULL,
                sent_at TIMESTAMPTZ,
                error_message VARCHAR(1000),
                metadata_json JSON
            )
            """
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_property_id ON hms_message_events (property_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_thread_id ON hms_message_events (thread_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_template_id ON hms_message_events (template_id)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_direction ON hms_message_events (direction)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_channel ON hms_message_events (channel)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_status ON hms_message_events (status)"
        )
        await connection.exec_driver_sql(
            "CREATE INDEX IF NOT EXISTS ix_hms_message_events_sent_at ON hms_message_events (sent_at)"
        )
    yield


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with engine.connect() as connection:
        transaction = await connection.begin()
        session = AsyncSession(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        try:
            yield db_session
        finally:
            pass

    async def override_get_current_tenant(request: Request):
        tenant_header = request.headers.get("x-test-restaurant-id")
        role_header = (request.headers.get("x-test-role") or UserRole.manager.value).lower()
        restaurant_id = int(tenant_header) if tenant_header else 0
        role = UserRole(role_header)
        return SimpleNamespace(
            id=999_999,
            email="tenant-test@example.com",
            is_active=True,
            restaurant_id=restaurant_id,
            role=role,
            active_property_id=None,
        )

    async def override_get_current_hotel(request: Request):
        tenant_header = request.headers.get("x-test-restaurant-id")
        role_header = (request.headers.get("x-test-role") or UserRole.manager.value).lower()
        restaurant_id = int(tenant_header) if tenant_header else 0
        role = UserRole(role_header)
        property_ids_header = request.headers.get("x-test-hotel-property-ids")
        if property_ids_header:
            property_ids = [int(value.strip()) for value in property_ids_header.split(",") if value.strip()]
        else:
            fallback_property = request.headers.get("x-test-property-id")
            if fallback_property:
                property_ids = [int(fallback_property)]
            else:
                requested_property = request.query_params.get("property_id")
                property_ids = [int(requested_property)] if requested_property else []
        active_property_header = request.headers.get("x-test-property-id")
        active_property_id = int(active_property_header) if active_property_header else (property_ids[0] if property_ids else None)
        permission_header = request.headers.get("x-test-hotel-permissions")
        permissions = (
            tuple(sorted({value.strip() for value in permission_header.split(",") if value.strip()}))
            if permission_header
            else hotel_permissions_for_legacy_role(role)
        )
        hotel_role_code = LEGACY_USER_ROLE_TO_HOTEL_ROLE.get(role, "hotel_staff")
        return HotelAccessContext(
            user=SimpleNamespace(
                id=999_999,
                email="hotel-test@example.com",
                is_active=True,
                restaurant_id=restaurant_id,
                role=role,
                active_property_id=active_property_id,
            ),
            active_property_id=active_property_id,
            hotel_roles=(hotel_role_code,),
            hotel_permissions=permissions,
            hotel_properties=tuple(
                {
                    "property_id": property_id,
                    "property_name": f"Property {property_id}",
                    "role_codes": [hotel_role_code],
                    "permissions": list(permissions),
                }
                for property_id in property_ids
            ),
        )

    from app.database import get_db

    async def failing_redis():
        raise RuntimeError("redis disabled in tests")

    original_get_redis = rate_limit.get_redis
    rate_limit.get_redis = failing_redis
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_tenant_user] = override_get_current_tenant
    app.dependency_overrides[get_optional_current_tenant_user] = override_get_current_tenant
    app.dependency_overrides[get_current_hotel_user] = override_get_current_hotel
    await reset_rate_limit_counters()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as async_client:
        yield async_client

    await reset_rate_limit_counters()
    rate_limit.get_redis = original_get_redis
    app.dependency_overrides.clear()


class InMemoryRedis:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.expiries: dict[str, float] = {}

    def _purge_expired(self, key: str) -> None:
        expires_at = self.expiries.get(key)
        if expires_at is not None and expires_at <= time_module.monotonic():
            self.values.pop(key, None)
            self.expiries.pop(key, None)

    async def get(self, key: str) -> str | None:
        self._purge_expired(key)
        return self.values.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        nx: bool | None = None,
    ) -> bool:
        self._purge_expired(key)
        if nx and key in self.values:
            return False
        self.values[key] = value
        if ex is not None:
            self.expiries[key] = time_module.monotonic() + ex
        else:
            self.expiries.pop(key, None)
        return True

    async def incr(self, key: str) -> int:
        current = int(await self.get(key) or "0") + 1
        self.values[key] = str(current)
        return current

    async def expire(self, key: str, seconds: int) -> bool:
        self.expiries[key] = time_module.monotonic() + seconds
        return True

    async def ttl(self, key: str) -> int:
        self._purge_expired(key)
        expires_at = self.expiries.get(key)
        if expires_at is None:
            return -1
        return max(int(expires_at - time_module.monotonic()), 0)

    async def mget(self, keys: list[str]) -> list[str | None]:
        return [await self.get(key) for key in keys]

    async def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            existed = key in self.values
            self.values.pop(key, None)
            self.expiries.pop(key, None)
            deleted += int(existed)
        return deleted

    async def scan_iter(self, match: str):
        prefix = match[:-1] if match.endswith("*") else match
        for key in list(self.values.keys()):
            self._purge_expired(key)
            if key.startswith(prefix):
                yield key

    async def ping(self) -> bool:
        return True

    async def publish(self, channel: str, data: str) -> int:
        return 1


@pytest.fixture
def fake_shared_redis_backend() -> InMemoryRedis:
    return InMemoryRedis()


@dataclass
class TenantSeed:
    restaurant_a_id: int
    restaurant_b_id: int
    menu_item_a_id: int
    menu_item_b_id: int
    guest_a_id: int
    guest_b_id: int
    table_a_id: int
    table_b_id: int
    reservation_a_id: int
    reservation_b_id: int
    billing_order_a_id: int
    billing_order_b_id: int
    inventory_item_a_id: int
    inventory_item_b_id: int
    vendor_a_id: int
    vendor_b_id: int


@pytest_asyncio.fixture
async def tenant_seed(db_session: AsyncSession) -> TenantSeed:
    suffix = uuid4().hex[:8]

    restaurant_a = Restaurant(
        name=f"Tenant A {suffix}",
        address="100 A Street",
        city="A City",
        state="CA",
        zip_code="90001",
        phone=f"555100{suffix[:4]}",
    )
    restaurant_b = Restaurant(
        name=f"Tenant B {suffix}",
        address="200 B Street",
        city="B City",
        state="CA",
        zip_code="90002",
        phone=f"555200{suffix[:4]}",
    )
    db_session.add_all([restaurant_a, restaurant_b])
    await db_session.flush()

    cat_a = MenuCategory(name=f"Cat A {suffix}", restaurant_id=restaurant_a.id)
    cat_b = MenuCategory(name=f"Cat B {suffix}", restaurant_id=restaurant_b.id)
    db_session.add_all([cat_a, cat_b])
    await db_session.flush()

    menu_item_a = MenuItem(
        restaurant_id=restaurant_a.id,
        category_id=cat_a.id,
        name=f"Menu A {suffix}",
        price=12.50,
        cost=5.00,
    )
    menu_item_b = MenuItem(
        restaurant_id=restaurant_b.id,
        category_id=cat_b.id,
        name=f"Menu B {suffix}",
        price=18.00,
        cost=7.00,
    )
    db_session.add_all([menu_item_a, menu_item_b])

    guest_a = GuestProfile(
        restaurant_id=restaurant_a.id,
        name=f"Guest A {suffix}",
        email=f"guest-a-{suffix}@example.com",
    )
    guest_b = GuestProfile(
        restaurant_id=restaurant_b.id,
        name=f"Guest B {suffix}",
        email=f"guest-b-{suffix}@example.com",
    )
    db_session.add_all([guest_a, guest_b])

    section_a = FloorSection(name=f"Section A {suffix}", restaurant_id=restaurant_a.id)
    section_b = FloorSection(name=f"Section B {suffix}", restaurant_id=restaurant_b.id)
    db_session.add_all([section_a, section_b])
    await db_session.flush()

    table_a = Table(
        restaurant_id=restaurant_a.id,
        section_id=section_a.id,
        table_number=f"A-{suffix[:4]}",
        capacity=4,
    )
    table_b = Table(
        restaurant_id=restaurant_b.id,
        section_id=section_b.id,
        table_number=f"B-{suffix[:4]}",
        capacity=4,
    )
    db_session.add_all([table_a, table_b])
    await db_session.flush()

    reservation_a = Reservation(
        restaurant_id=restaurant_a.id,
        guest_id=guest_a.id,
        guest_name=guest_a.name or "Guest A",
        table_id=table_a.id,
        party_size=2,
        reservation_date=date.today(),
        start_time=datetime.now(timezone.utc).time().replace(microsecond=0),
    )
    reservation_b = Reservation(
        restaurant_id=restaurant_b.id,
        guest_id=guest_b.id,
        guest_name=guest_b.name or "Guest B",
        table_id=table_b.id,
        party_size=2,
        reservation_date=date.today(),
        start_time=datetime.now(timezone.utc).time().replace(microsecond=0),
    )
    db_session.add_all([reservation_a, reservation_b])

    order_a = TableOrder(restaurant_id=restaurant_a.id, table_id=table_a.id, guest_name="Billing A")
    order_b = TableOrder(restaurant_id=restaurant_b.id, table_id=table_b.id, guest_name="Billing B")
    db_session.add_all([order_a, order_b])

    vendor_a = Vendor(restaurant_id=restaurant_a.id, name=f"Vendor A {suffix}")
    vendor_b = Vendor(restaurant_id=restaurant_b.id, name=f"Vendor B {suffix}")
    db_session.add_all([vendor_a, vendor_b])
    await db_session.flush()

    inv_a = InventoryItem(
        restaurant_id=restaurant_a.id,
        name=f"Inventory A {suffix}",
        category="Produce",
        unit="kg",
        vendor_id=vendor_a.id,
    )
    inv_b = InventoryItem(
        restaurant_id=restaurant_b.id,
        name=f"Inventory B {suffix}",
        category="Produce",
        unit="kg",
        vendor_id=vendor_b.id,
    )
    db_session.add_all([inv_a, inv_b])
    await db_session.flush()

    return TenantSeed(
        restaurant_a_id=restaurant_a.id,
        restaurant_b_id=restaurant_b.id,
        menu_item_a_id=menu_item_a.id,
        menu_item_b_id=menu_item_b.id,
        guest_a_id=guest_a.id,
        guest_b_id=guest_b.id,
        table_a_id=table_a.id,
        table_b_id=table_b.id,
        reservation_a_id=reservation_a.id,
        reservation_b_id=reservation_b.id,
        billing_order_a_id=order_a.id,
        billing_order_b_id=order_b.id,
        inventory_item_a_id=inv_a.id,
        inventory_item_b_id=inv_b.id,
        vendor_a_id=vendor_a.id,
        vendor_b_id=vendor_b.id,
    )
