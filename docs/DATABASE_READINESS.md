# Database Readiness Audit

Date: 2026-03-25

## 2026-03-25 Verification Update

This document was re-verified on a fresh disposable PostgreSQL database on 2026-03-25 with the current Alembic head `z001a2b3c4d5`.

### What Was Verified

- Full fresh-database migration cycle:
  - `upgrade head`
  - `current`
  - `downgrade base`
  - `upgrade head`
  - `current`
- Schema drift between the migrated head and current SQLAlchemy metadata
- Voucher, reservation, and HMS table shape alignment against current backend models
- Rollback safety of the voucher, HMS, and payments/bills migration chain

### Verification Result

- `upgrade head` on a fresh disposable database: passed
- `current` after upgrade: `z001a2b3c4d5 (head)`
- `downgrade base` on the same disposable database: passed
- `upgrade head` after downgrade-to-base: passed
- `current` after re-upgrade: `z001a2b3c4d5 (head)`

### Migration Fixes Applied During Verification

The following migration-only fixes were required to make rollback and re-upgrade safe:

- [8378c8dce28c_sync_reservations_and_hms_schema.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/alembic/versions/8378c8dce28c_sync_reservations_and_hms_schema.py)
  - downgrade now drops the generated `hms_reservations.room_type_id` foreign key by inspection instead of `drop_constraint(None, ...)`
  - downgrade now drops overlapping HMS columns with `DROP COLUMN IF EXISTS` to avoid collisions with later downgrade steps
- [7a5db2f9da1f_refactor_vouchers_to_digital_code_system.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/alembic/versions/7a5db2f9da1f_refactor_vouchers_to_digital_code_system.py)
  - downgrade now restores legacy voucher columns as nullable first, backfills values from the current voucher shape, then makes required columns non-null again
  - downgrade now drops the generated `created_by_user_id` foreign key by inspection instead of `drop_constraint(None, ...)`
- [c7b21a91ffb3_phase1_payment_receipts_upsell_supplier.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/alembic/versions/c7b21a91ffb3_phase1_payment_receipts_upsell_supplier.py)
  - downgrade now drops the `payments.refund_of_id` foreign key and `bills.receipt_token` unique constraint by inspection instead of unnamed constraint drops

### Model Alignment Fixes Applied

The following SQLAlchemy model updates were required so migrated schema and code agree structurally:

- [billing/models.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/app/billing/models.py)
  - `CashShift.opened_by` now matches the migrated schema as non-nullable
- [reservations/models.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/app/reservations/models.py)
  - `Reservation` now includes `stripe_payment_intent_id`
  - `Reservation.payment_status` now matches the schema’s current application-side default usage without a server-default drift
- [hms/models.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/app/hms/models.py)
  - `HotelReservation` now includes `guest_phone`, `room_type_id`, and `stripe_payment_intent_id`
  - `payment_status` length now matches the migrated column
  - `booking_id` length now matches the migrated column
  - the unique booking index is now declared in model metadata

### Current Drift Status

After the fixes above:

- structural drift between migrated head and SQLAlchemy metadata: none
- voucher schema mismatch against current models: none
- restaurant reservation schema mismatch against current models: none
- HMS structural schema mismatch against current models: none

The only remaining metadata differences are server-default-only mismatches on:

- `hms_reservations.zahlungs_status`
- several `revenue_control_*` defaults
- several `revenue_experiment_*` defaults
- `tables.rotation`, `tables.width`, `tables.height`
- `vouchers.is_gift_card`

These do not block schema recreation or rollback safety, but they are still worth cleaning up in a later non-Phase-1 schema hygiene pass.

### Regression Coverage Added

- [test_migration_safety.py](/Users/ali/Documents/das elb/Das-Elb-landingpage/backend/tests/test_migration_safety.py)
  - verifies fresh-db `upgrade -> downgrade -> re-upgrade`
  - compares the migrated head against SQLAlchemy metadata
  - fails on any structural drift
  - allows only the current known server-default-only mismatches

## Executive Summary

The repository is using a shared PostgreSQL schema for restaurant, hotel/HMS, guest-facing flows, and the management SaaS. The restaurant domain is much closer to production readiness than the hotel/HMS domain, but the database layer still shows legacy tenant-retrofit debt:

- Core restaurant tables mostly have `restaurant_id`, but many are still nullable and several are missing tenant indexes.
- HMS core tables use `property_id`, but the database model and API layer are not yet consistently property-scoped.
- Several non-Phase-1 modules still have no tenant key at all.
- A few migrations are risky for live multi-tenant data because they silently backfill to `restaurant_id = 1`, create synthetic fallback tenants, or drop/recreate indexes and nullability in ways that are not operationally safe.
- Seed/import scripts remain single-tenant oriented, and one table-update script is destructive and not production safe.

During this audit, targeted integrity fixes were applied only where they were clearly necessary for shared-database correctness:

- QR orders now persist `restaurant_id` on `table_orders` and `order_items`, validate menu items against the table's tenant, and populate required order item fields.
- Billing order creation now validates `table_id`, `session_id`, `server_id`, and menu item references against the caller's restaurant.
- Inventory item writes now validate `vendor_id` against the caller's restaurant.
- New tests were added to protect those paths and basic HMS property integrity.

No schema migration was added in this step. The missing index and nullability work should be rolled out deliberately with online-safe migrations.

## Scope Reviewed

Reviewed artifacts:

- All SQLAlchemy model modules under `backend/app/**/models.py`
- All Alembic revisions in `backend/alembic/versions/`
- Seed/import/update scripts in `backend/scripts/`
- Relevant frontend assumptions in `frontend/`, `das-elb-rest/`, and `das-elb-hotel/`
- Existing tenant-isolation and public API tests under `backend/tests/`

## Current Database Model State

### Restaurant Domain

Restaurant core entities are present and actively used:

- `restaurants`
- `users`
- `menu_categories`, `menu_items`, `menu_modifiers`, `menu_combos`, `upsell_rules`
- `guest_profiles`, `orders`, `loyalty_accounts`, `promotions`
- `floor_sections`, `tables`, `reservations`, `waitlist`, `qr_table_codes`, `table_sessions`
- `table_orders`, `order_items`, `bills`, `payments`, `cash_shifts`, `kds_station_configs`
- `vendors`, `inventory_items`, `purchase_orders`, `inventory_movements`, `supplier_catalog_items`, `auto_purchase_rules`, `tva_reports`

These tables are intended to be tenant scoped by `restaurant_id`. In practice:

- Tenant keys exist on the Phase 1 restaurant tables.
- Service-layer scoping is generally good for menu, reservations, billing, inventory, and guests.
- Several tenant columns are still nullable due to the historical migration sequence.
- Many cross-table consistency rules are enforced in services, not in the database.

### Hotel / HMS Domain

Hotel core entities are present:

- `hms_properties`
- `hms_room_types`
- `hms_rooms`
- `hms_reservations`

These tables are scoped by `property_id`, but readiness is lower:

- `property_id` exists on the core tables.
- Model/schema structural drift on `hms_reservations` was closed in the 2026-03-25 verification pass.
- `property_id` indexing and strict property-scoped service behavior are still weaker than the restaurant tenant model.
- The authenticated HMS API still behaves as a single-property/global view in multiple places.

### Shared / Global Modules

Shared models like `users` and `guest_profiles` make sense in a shared database. Other modules are more mixed:

- `integrations` webhook tables are globally scoped by design, but they do not carry tenant routing metadata.
- `dashboard.audit_events` has `restaurant_id`.
- Many analytics/AI/support modules are only partially tenantized.

## Scoping Verification

### Tables That Already Carry `restaurant_id`

Critical restaurant tables with an explicit tenant key:

- `users`
- `menu_categories`
- `menu_items`
- `guest_profiles`
- `orders`
- `loyalty_accounts`
- `promotions`
- `floor_sections`
- `tables`
- `reservations`
- `waitlist`
- `qr_table_codes`
- `table_sessions`
- `table_orders`
- `order_items`
- `bills`
- `payments`
- `cash_shifts`
- `kds_station_configs`
- `vendors`
- `inventory_items`
- `purchase_orders`
- `inventory_movements`
- `supplier_catalog_items`
- `auto_purchase_rules`
- `tva_reports`

### Tables That Already Carry `property_id`

- `hms_room_types`
- `hms_rooms`
- `hms_reservations`

### Tables With Weak or Incomplete Scoping

These tables have a tenant key, but readiness is still weak because the key is nullable, unindexed, or integrity is only app-enforced:

- `floor_sections`
- `waitlist`
- `qr_table_codes`
- `table_sessions`
- `order_items`
- `bills`
- `payments`
- `cash_shifts`
- `kds_station_configs`
- `orders`
- `loyalty_accounts`
- `promotions`
- `inventory_movements`
- `supplier_catalog_items`
- `auto_purchase_rules`
- `tva_reports`
- `menu_modifiers`
- `menu_combos`
- `upsell_rules`
- `hms_room_types`
- `hms_rooms`
- `hms_reservations`

### Modules Still Missing Explicit Tenant Scoping

These modules still contain models without `restaurant_id` or `property_id`, even though the data appears location-specific:

`food_safety`
- `haccp_logs`
- `temperature_readings`
- `allergen_alerts`
- `compliance_scores`

`dashboard`
- `alerts`
- `kpi_snapshots`

`accounting`
- `chart_of_accounts`
- `gl_entries`
- `invoices`
- `budgets`
- `reconciliations`

`forecasting`
- `forecasts`
- `forecast_inputs`

`digital_twin`
- `scenarios`
- `simulation_runs`

Additional partial-scoping caveats:

- `maintenance` uses `restaurant_id` on parent entities, but child rows like `iot_readings` and `maintenance_tickets` are indirectly scoped through `equipment_id`.
- `workforce` child rows like `shifts` and `training_progress` are indirectly scoped through schedule/employee/module relationships.
- `franchise.location_metrics` is scoped only through `location_id`, not directly by restaurant.

## Data Integrity Findings

### Restaurant Cross-Entity Integrity

The following relationships are still vulnerable at the schema layer and rely on service code rather than DB constraints:

- `tables.section_id` can point to a section from another restaurant.
- `reservations.table_id` can point to a table from another restaurant.
- `table_sessions.table_id` and `table_sessions.reservation_id` are not DB-enforced to match the same `restaurant_id`.
- `table_orders.table_id`, `table_orders.session_id`, and `table_orders.server_id` are not DB-enforced to belong to the same restaurant.
- `order_items.menu_item_id` is not DB-enforced to belong to the same restaurant as the order.
- `inventory_items.vendor_id` is not DB-enforced to match the same restaurant.
- `supplier_catalog_items.vendor_id` and `inventory_item_id` are not DB-enforced to stay within one tenant.

### Hotel Cross-Entity Integrity

- `hms_rooms.room_type_id` is not DB-enforced to reference a room type from the same `property_id`.
- `hms_reservations` stores `property_id`, but current model design does not strictly tie room assignment and room type assignment to that property.
- The public hotel booking flow correctly checks `room_type.property_id == booking.property_id`, but authenticated HMS routes still do not consistently scope by property.

## Missing Indexes

### Critical Missing Tenant / Property Indexes

These keys are present in model metadata but currently lack a declared single-column index:

Restaurant:

- `floor_sections.restaurant_id`
- `waitlist.restaurant_id`
- `qr_table_codes.restaurant_id`
- `table_sessions.restaurant_id`
- `order_items.restaurant_id`
- `bills.restaurant_id`
- `payments.restaurant_id`
- `cash_shifts.restaurant_id`
- `kds_station_configs.restaurant_id`
- `orders.restaurant_id`
- `loyalty_accounts.restaurant_id`
- `promotions.restaurant_id`
- `inventory_movements.restaurant_id`
- `supplier_catalog_items.restaurant_id`
- `auto_purchase_rules.restaurant_id`
- `tva_reports.restaurant_id`
- `menu_modifiers.restaurant_id`
- `menu_combos.restaurant_id`
- `upsell_rules.restaurant_id`

Hotel:

- `hms_room_types.property_id`
- `hms_rooms.property_id`
- `hms_reservations.property_id`

Advanced / observability modules:

- `audit_events.restaurant_id`
- `revenue_experiment_events.restaurant_id`
- `revenue_experiments.restaurant_id`
- `revenue_upsell_recommendations.restaurant_id`
- `service_autopilot_predictions.restaurant_id`

### Recommended Composite Indexes

The following composite indexes are recommended before production scale:

- `reservations (restaurant_id, reservation_date, status)`
- `tables (restaurant_id, section_id)`
- `qr_table_codes (restaurant_id, code)`
- `table_sessions (restaurant_id, status, started_at)`
- `table_orders (restaurant_id, status, created_at)`
- `order_items (restaurant_id, order_id, status)`
- `inventory_items (restaurant_id, category, name)`
- `purchase_orders (restaurant_id, status, order_date)`
- `hms_reservations (property_id, check_in)`
- `hms_reservations (property_id, check_out)`
- `hms_reservations (property_id, status)`

## Migration Risk Review

### High-Risk Migrations

`ab57cd3db3df_phase5_enforce_tenant_not_null_and_...`
- Creates a synthetic legacy tenant (`__legacy_unassigned_tenant__`)
- Backfills null tenant values using inferred relationships
- Can silently change business meaning of orphaned data
- Not safe to apply blindly on a live multi-tenant production dataset

`a1b2c3d4e5f6_add_tenant_columns_to_remaining_modules.py`
- Adds `restaurant_id` to many tables
- Backfills all existing rows to `restaurant_id = 1`
- Operationally safe only if the database is known to be single-tenant at migration time

`f5a1b2c3d4e5_restore_tenant_indexes_and_not_null.py`
- Restores indexes/nullability after a bad prior migration
- Backfills null tenant rows to `restaurant_id = 1`
- Dangerous for live multi-tenant data

`e277dec60b9a_increase_table_number_length.py`
- Intended as a narrow table-number change
- Also drops/recreates many indexes and alters tenant-nullability
- High blast radius for a nominally small schema change

`8378c8dce28c_sync_reservations_and_hms_schema.py`
- Alters many restaurant tables and drops/restores indexes
- Changes HMS reservation columns
- Introduces drift against current ORM expectations
- Too broad to be considered a safe production migration without staging validation

`7a5db2f9da1f_refactor_vouchers_to_digital_code_system.py`
- Drops many voucher columns and rewrites the voucher shape
- Safe only if production data has already been mapped to the new gift-card model

### Moderate-Risk Migrations

`95069ca497e7_add_hms_models.py`
- Cleaner than the tenant retrofits, but lacks the property-scoped indexing needed for production usage

`z001_hms_reservations_extended_and_gift_cards.py`
- Uses `ADD COLUMN IF NOT EXISTS`, which is relatively safe
- Still requires production data validation because it extends the HMS reservation contract further

### Structural Observation

The migration graph is not a simple linear chain:

- `e277dec60b9a` forks into a restore branch (`f5a1...`) and a webhook/table-layout branch (`bf183... -> 7a5...` and `d4e5...`)
- These branches merge later in `5eb71fbec071_merge_heads.py`

This means migration rollout must be treated as a graph-aware deployment, not a naive file-order sequence.

## Seed / Import / Update Script Readiness

### `backend/scripts/seed.py`

Findings:

- Idempotent for the default restaurant/admin user in a limited sense
- Hardcodes demo credentials
- Assumes one default restaurant
- Not suitable as a production seed without environment-driven credentials and explicit tenant targeting

### `backend/scripts/import_gastronovi.py`

Findings:

- Strongly single-tenant in shape
- No explicit `restaurant_id` argument
- No dry-run mode
- No lock/safeguard to prevent accidental duplicate imports
- Should not be treated as production-safe ingestion in its current form

### `backend/scripts/update_tables.py`

Findings:

- Production unsafe in current form
- Clears all sections/tables and related data globally
- Recreates `floor_sections` and `tables` without setting `restaurant_id`
- Not tenant safe
- Must not be run against shared or multi-tenant production data

## Data Model Drift Between Backend and Frontend

### Confirmed Drift

`das-elb-rest`
- The guest app still hardcodes `restaurant_id: 1` in the order payload.
- This is incompatible with a real multi-tenant shared database unless one tenant is permanently special-cased.

`frontend/src/app/(management)/hms/dashboard/page.tsx`
- Expects room rows shaped like:
  - `id`
  - `number`
  - `room_type_name`
  - `status`
- The backend `/hms/rooms` route currently returns raw `Room` ORM records with fields like:
  - `room_number`
  - `room_type_id`
  - `property_id`
- This is a payload-shape drift, not only a UI issue.

`backend/app/hms/models.py` vs migrations
- The structural model drift around `room_type_id`, `stripe_payment_intent_id`, and `booking_id` was closed in the 2026-03-25 verification pass.
- Remaining HMS concerns are now service-layer scoping and API payload behavior, not head-vs-model structural mismatch.

`das-elb-hotel`
- The checked-in public hotel bundle suggests legacy/public endpoint assumptions that do not cleanly match the current HMS/public router surface.

### Drift Closed in This Audit

- QR order writes now store `restaurant_id` consistently and reject cross-tenant menu items.
- Billing order/item writes now reject cross-tenant table/menu references.
- Inventory item writes now reject cross-tenant vendor references.

## Tests Added in This Audit

New file:

- `backend/tests/test_database_integrity_guards.py`

Coverage added:

- Critical tables keep their scoping columns in model metadata
- Billing order creation rejects cross-tenant tables
- Billing order items reject cross-tenant menu items
- Inventory item creation rejects cross-tenant vendors
- Public QR ordering persists tenant scope on created orders/items
- Public QR ordering rejects cross-tenant menu items
- Public hotel booking rejects cross-property room type usage

Relevant suite executed:

```bash
backend/.venv/bin/python -m pytest -v \
  backend/tests/test_database_integrity_guards.py \
  backend/tests/test_tenant_isolation_api.py \
  backend/tests/test_inventory/test_inventory_api.py \
  backend/tests/test_public_security_hardening.py
```

Result:

- `26 passed`

## Remaining Test Coverage Gaps

### High Priority

- No HMS authenticated property-isolation tests
- No migration smoke test that validates head schema against ORM metadata
- No tests that detect nullable tenant columns drifting back into critical Phase 1 tables
- No tests around destructive script behavior or import idempotency
- No DB-level constraint tests for cross-tenant foreign-key mismatches

### Medium Priority

- No performance/index regression tests for reservation, billing, and inventory queries
- No tests asserting public restaurant menu scoping for multi-tenant usage
- No tests around legacy landing/public hotel data contracts

## Safe Migration Rollout Order

There are two safe rollout paths, depending on whether the target database is fresh or already contains live shared data.

### A. Fresh Environment / Staging Bootstrap

For a fresh database, the Alembic graph can be applied to head in graph order, but staging validation is still required around the risky tenant retrofit revisions:

1. `3e542e56b138`
2. `2bf2efd05bb7`
3. `c7b21a91ffb3`
4. `a94a1804451a`
5. `83ccdefe48ab`
6. `9b4c1d2e7f10`
7. `ab57cd3db3df`
8. `3649d637c9a4`
9. `f38a933ea2e0`
10. `620206e756c2`
11. `9d372db4a5f1`
12. `e277dec60b9a`
13. Branch A: `f5a1b2c3d4e5`
14. Branch B1: `bf1832e7e1be`
15. Branch B2: `7a5db2f9da1f`
16. Branch B3: `d4e5f6g7h8i9`
17. Merge branch: `b1c2d3e4f5a6`
18. `95069ca497e7`
19. `a1b2c3d4e5f6`
20. `5eb71fbec071`
21. `8378c8dce28c`
22. `z001a2b3c4d5`

Recommendation:

- Do not use this chain as the final production strategy for live shared data.
- Use it only for staging/fresh environments and validate tenant/index state immediately afterward.

### B. Existing Production Database With Live Data

For a real production rollout, do not apply the existing tenant retrofit migrations blindly. Use this order instead:

1. Take a physical backup and verify restore.
2. Run a preflight audit query pack:
   - null `restaurant_id` counts
   - null `property_id` counts
   - cross-tenant FK mismatches
   - duplicate `booking_id` counts
   - orphaned inventory/vendor and order/menu references
3. Freeze deploys that write shared restaurant/hotel data.
4. Replace or wrap the risky backfill migrations (`ab57`, `a1`, `f5`) with environment-specific migrations that:
   - refuse to run if multiple tenants exist and ambiguity remains
   - never silently assign `restaurant_id = 1`
   - log row counts before/after every backfill
5. Apply online-safe index migrations first:
   - critical `restaurant_id` indexes
   - critical `property_id` indexes
   - recommended composite indexes on reservations/orders/HMS reservations
6. Apply constraint migrations next:
   - make Phase 1 `restaurant_id` columns `NOT NULL` only after preflight proves clean
   - make HMS `property_id` constraints stricter only after property routing is verified
7. Apply HMS extension alignment migrations:
   - reconcile `booking_id` uniqueness/indexing
   - reconcile model/migration drift on reservation fields
8. Re-run application smoke tests and tenant/property isolation tests.
9. Re-enable writes.

## Prioritized Production-Readiness Backlog

### P0

- Replace unsafe tenant backfill migrations so they do not silently assign `restaurant_id = 1`
- Add missing Phase 1 tenant indexes with online-safe migrations
- Add missing HMS `property_id` indexes
- Remove or rewrite `backend/scripts/update_tables.py` before any production operator can run it
- Remove `restaurant_id: 1` hardcoding from `das-elb-rest`
- Make QR/public restaurant menu fetching tenant-aware, not just order submission

### P1

- Add HMS authenticated property isolation to API dependencies and tests
- Reconcile `hms_reservations` model drift against applied migrations
- Add DB-level or service-enforced validation for same-tenant foreign-key relationships where practical
- Decide which analytics/support modules are global vs tenant-specific and add explicit keys accordingly

### P2

- Add migration/schema drift CI checks
- Add import-script dry-run and explicit tenant selection
- Add performance validation around reservation, ordering, and booking query plans

## Bottom Line

Phase 1 restaurant production can move forward sooner than hotel/HMS, but only if the database rollout is handled carefully:

- The restaurant runtime paths are now better protected against cross-tenant writes.
- The schema still carries tenant-retrofit debt and missing indexes.
- Hotel/HMS remains structurally weaker because `property_id` exists in the schema but is not yet consistently enforced across models, queries, and frontend contracts.

The safest path is:

- ship restaurant Phase 1 on the strengthened service-layer guards and current tests
- do not promote HMS as production-ready yet
- schedule an explicit database hardening release for indexes, nullability, migration cleanup, and property-scoped HMS behavior
