# Hotel Management System Architecture Breakdown

Generated from the codebase under `/Users/ali/Documents/das elb/Das-Elb-landingpage-local`.

Companion appendices:

- `ARCHITECTURE_API_INVENTORY.md` — full backend endpoint catalog from router declarations
- `ARCHITECTURE_DB_SCHEMA.md` — full database table inventory from SQLAlchemy models

---

## 1. System Overview

This repository is a multi-app hospitality platform rather than a single-purpose PMS. It combines:

- a unified FastAPI backend under `backend/app`
- a management SaaS under `frontend`
- a public hotel landing site under `das-elb-hotel`
- a public restaurant guest app under `res-web`
- a mounted MCP server for AI/tooling integration under `/mcp/voicebooker`

At runtime, the platform supports two business domains inside one codebase:

- **Gastronomy domain**: restaurant reservations, table/floor management, waiter station, kitchen board, billing/POS, QR ordering, menu management, vouchers, guests/loyalty, inventory, forecasting, workforce, food safety, signage, marketing, accounting, franchise analytics, digital twin simulation, and AI agents.
- **Hotel domain**: hotel inventory, room categories, front desk, hotel reservations, housekeeping/operations pages, revenue/rate/channel pages, CRM/marketing surfaces, security/settings, finance, AI agents, and an AI-filtered email inbox.

### Primary apps

1. **Backend API**
   - Framework: FastAPI
   - Data layer: async SQLAlchemy + PostgreSQL
   - Cache / concurrency: Redis
   - Async jobs: Celery
   - Real-time events: websocket manager
   - AI / integrations: MCP server, email AI pipeline, Stripe webhook, optional third-party providers

2. **Management SaaS**
   - Framework: Next.js App Router
   - UI stack: React, Tailwind, Radix UI, Zustand, Axios
   - Supports domain switching between `gastronomy` and `hotel`

3. **Public hotel site**
   - Static/public site with runtime integration script
   - Uses canonical backend reservation and availability APIs

4. **Public restaurant app**
   - Vite + React SPA
   - Uses canonical backend reservation, public menu, QR/order, and order-status APIs

### Architectural shape

The backend is a **single hospitality monolith with modular bounded contexts**. The strongest operational backbone is:

- reservations
- billing / ordering
- menu
- inventory
- auth / tenanting
- HMS room inventory

The system is not split into separate microservices. Instead, domains are organized as backend modules with their own router, service, models, and schemas.

---

## 2. Main Modules / Domains

### 2.1 Authentication / Tenant Context

**Purpose**

- JWT-based auth for the management SaaS and protected APIs
- stores users and the restaurant tenant anchor

**Code**

- `backend/app/auth/models.py`
- `backend/app/auth/router.py`
- `backend/app/auth/service.py`
- `backend/app/auth/utils.py`
- `frontend/src/stores/auth-store.ts`

**Features**

- user registration (`POST /api/auth/register`)
- login (`POST /api/auth/login`)
- token refresh (`POST /api/auth/refresh`)
- current user lookup (`GET /api/auth/me`)
- password hashing with bcrypt
- access + refresh JWT issuance

**Role system**

- roles: `admin`, `manager`, `staff`
- role carried in JWT payload
- restaurant tenant id also carried in JWT payload

**Frontend behavior**

- token stored in Zustand/localStorage
- protected layouts wait for `getMe()` before rendering
- frontend route-level access gates defined in `frontend/src/lib/access-control.ts`

**Architectural note**

- tenant identity is centered on `restaurant_id`, not on hotel property identity
- hotel APIs are therefore not truly first-class in the auth model; they rely on `property_id` query/body parameters instead

---

### 2.2 Reservations (Unified Booking Backbone)

**Purpose**

- single reservation entry point for restaurant and hotel bookings
- shared idempotency, availability protection, consistency checks, cache invalidation, and event broadcasting

**Code**

- `backend/app/reservations/router.py`
- `backend/app/reservations/unified_service.py`
- `backend/app/reservations/availability.py`
- `backend/app/reservations/availability_router.py`
- `backend/app/reservations/public_router.py`
- `backend/app/reservations/models.py`

**Features**

- restaurant floor sections and table management
- restaurant reservations
- waitlist
- table sessions
- availability checks
- hotel reservation creation through the same canonical endpoint
- idempotency claims/replays with `Idempotency-Key`
- reservation consistency verification and cache invalidation

**Canonical create path**

- `POST /api/reservations`
- request model: `UnifiedReservationCreate`
- branch selection: `kind = restaurant | hotel`
- service: `ReservationService.create_reservation(...)`

**Restaurant workflows**

- list sections/tables
- create/update/delete sections and tables
- create reservation
- seat reservation
- complete reservation
- cancel reservation
- add/remove waitlist entries
- create/close table sessions

**Hotel workflows**

- hotel booking is still created through the same canonical `POST /api/reservations`
- requires `property_id`, `check_in`, `check_out`, and room information
- uses centralized room inventory normalization instead of free-form room lists

**UI surfaces**

- gastronomy reservations page: `frontend/src/app/(gastronomy)/reservations/page.tsx`
- hotel reservations page: `frontend/src/app/(hotel)/hms/reservations/page.tsx`
- hotel landing forms and restaurant/public apps also post into this same API

**Observed data flow**

1. frontend/public app posts a unified payload
2. service validates by kind
3. availability layer checks overlaps and enforces lock/guard semantics
4. reservation row is persisted
5. availability invalidation + consistency verification is scheduled
6. websocket event is broadcast

---

### 2.3 Availability

**Purpose**

- read/write availability logic for both restaurant and hotel inventory

**Code**

- `backend/app/reservations/availability.py`
- `backend/app/reservations/read_availability.py`
- `backend/app/reservations/availability_router.py`
- `backend/app/hms/public_router.py`

**Features**

- restaurant capacity/time-slot validation
- hotel stay overlap validation
- read-only public availability endpoints
- cache invalidation hooks after create/update operations

**Important rules confirmed in code**

- restaurant occupancy checks use active reservation statuses
- hotel overlap logic excludes terminal states such as `cancelled` and `checked_out`
- hotel capacity comes from centralized room inventory, not arbitrary counts

**Public reads**

- `/api/availability`
- `/api/public/hotel/availability`

---

### 2.4 Hotel Management (HMS)

**Purpose**

- hotel operational read model and reservation update surface

**Code**

- `backend/app/hms/router.py`
- `backend/app/hms/public_router.py`
- `backend/app/hms/models.py`
- `backend/app/hms/room_inventory.py`

**Features**

- overview metrics
- room status list
- same-day front desk arrivals/departures/stats
- hotel reservation list
- hotel reservation patch/put updates
- public room type listing
- public hotel availability check

**Confirmed UI pages**

- dashboard
- front desk
- reservations
- housekeeping
- maintenance
- inventory
- CRM
- marketing
- email inbox
- channels
- rates
- analytics
- finance
- security
- settings
- agents
- comms

**Observed workflows**

- front desk page reads only same-day arrivals and departures
- HMS dashboard reads room inventory and summary metrics
- reservation page creates hotel bookings through the canonical reservations API, then edits through `/api/hms/reservations/{id}`
- reservation page listens for websocket hotel booking events

**UI elements confirmed**

- dashboard stat cards + room status board
- front desk arrival/departure tables
- printable `Meldeschein`
- printable `Rechnung`
- reservation creation/edit flows

**Architectural note**

- HMS router is mostly a thin query/serialization layer over `HotelReservation`, `Room`, and `RoomType`
- it does not have a full PMS subdomain service layer comparable to the restaurant billing/reservation stack

---

### 2.5 Billing / POS / Kitchen Display

**Purpose**

- operational ordering, kitchen queueing, bill generation, payments, receipts, and cash shifts

**Code**

- `backend/app/billing/router.py`
- `backend/app/billing/service.py`
- `backend/app/billing/models.py`
- `backend/app/billing/schemas.py`
- `frontend/src/app/(gastronomy)/orders/page.tsx`
- `frontend/src/app/(gastronomy)/kitchen-display/page.tsx`
- `frontend/src/app/(gastronomy)/billing/page.tsx`

**Features**

- create/update/close table orders
- add/update/delete order items
- send orders to kitchen
- KDS station configuration
- ready/recall/bump actions
- bill generation
- split bills
- payments and refunds
- digital/public receipt access
- cash shift open/close
- daily billing summary

**Operational flow**

1. waiter or guest creates `TableOrder`
2. order items are added
3. `send-to-kitchen` moves pending items into kitchen prep lifecycle
4. KDS board reads `/api/billing/kds/orders`
5. bill generated from order
6. payment created/refunded
7. order can be closed

**UI elements confirmed**

- waiter station: active orders, section/table selector, menu categories/items, order item editing, kitchen notifications
- kitchen board: station tabs, urgency timer, ready/recall/bump controls

---

### 2.6 QR Ordering / Guest Ordering

**Purpose**

- guest-facing order flow for table/QR experiences and public restaurant app integrations

**Code**

- `backend/app/qr_ordering/router.py`
- `backend/app/qr_ordering/service.py`
- `backend/app/reservations/public_router.py`
- `res-web/src/lib/restaurantClient.js`

**Features**

- resolve table by QR code
- get scoped QR menu
- submit guest order
- fetch order status
- public menu alias
- public order alias

**Integration rule**

- guest ordering does not bypass the backend
- guest orders create real `TableOrder` and `OrderItem` records
- waiter and kitchen views consume the same persisted records

---

### 2.7 Menu / Menu Designer

**Purpose**

- canonical food catalog and merchandising system

**Code**

- `backend/app/menu/router.py`
- `backend/app/menu/service.py`
- `backend/app/menu/models.py`
- `backend/app/menu_designer/router.py`
- `backend/app/menu_designer/models.py`

**Features**

- category CRUD
- item CRUD
- modifier CRUD and item-modifier linking
- combo CRUD
- upsell rule CRUD and acceptance logging
- menu analytics
- item suggestions
- menu designer templates/designs

**Important architecture rule**

- public restaurant menu is derived from the same menu catalog
- public filtering excludes unavailable and zero-price dishes

**UI surfaces**

- gastronomy menu
- menu designer
- public restaurant app menu browsing
- waiter station menu picker

---

### 2.8 Guests / CRM / Loyalty / Promotions

**Purpose**

- guest profile management and relationship marketing

**Code**

- `backend/app/guests/router.py`
- `backend/app/guests/models.py`
- hotel CRM page routes under `frontend/src/app/(hotel)/hms/crm`
- gastronomy guest pages under `frontend/src/app/(gastronomy)/guests*`

**Features**

- guest profile CRUD
- guest order history
- churn-risk endpoint
- loyalty endpoint
- pricing endpoint
- promotion creation

**UI surfaces**

- gastronomy guests
- gastronomy loyalty
- gastronomy pricing
- hotel CRM

---

### 2.9 Inventory / Procurement / Forecasting

**Purpose**

- stock, suppliers, purchase ordering, automatic replenishment, demand planning

**Code**

- `backend/app/inventory/router.py`
- `backend/app/inventory/models.py`
- `backend/app/forecasting/router.py`
- `backend/app/forecasting/models.py`

**Features**

- inventory item CRUD
- vendor CRUD
- supplier catalog
- purchase order CRUD + receive flow
- low-stock reporting
- TVA reporting
- auto-purchase rules
- sales/labor/item forecasting
- retraining + forecast accuracy

**UI surfaces**

- inventory
- vendor management
- purchase order page
- forecasting page

---

### 2.10 Workforce

**Purpose**

- staffing, scheduling, applicants, labor tracking, training status

**Code**

- `backend/app/workforce/router.py`
- `backend/app/workforce/models.py`
- `frontend/src/app/(gastronomy)/workforce*`

**Features**

- schedule listing/generation/approval
- employee listing/create
- labor tracker
- applicant listing/create
- training overview

**UI surfaces**

- workforce overview
- employees page
- hiring page
- training page

---

### 2.11 Maintenance / Energy / Food Safety / Vision

**Purpose**

- operational risk, equipment, temperature/safety logging, waste/compliance, energy telemetry

**Code**

- `backend/app/maintenance/*`
- `backend/app/food_safety/*`
- `backend/app/vision/*`

**Features**

- equipment registry
- maintenance tickets
- energy usage and savings
- failure predictions
- HACCP logs
- temperature readings
- allergen alerts
- compliance score / compliance Q&A
- vision alerts
- waste logs
- compliance event tracking

**UI surfaces**

- gastronomy maintenance
- maintenance energy page
- safety page
- kitchen waste page
- alerts pages

---

### 2.12 Marketing / Reviews / Social / Vouchers

**Purpose**

- reputation management, campaigns, social publishing, voucher and stored-value features

**Code**

- `backend/app/marketing/*`
- `backend/app/vouchers/*`

**Features**

- review listing and response
- campaign listing/create
- reputation score
- social post listing and AI generation
- voucher CRUD
- voucher validation/redeem
- gift cards
- customer cards
- points/stamps
- resend voucher email

---

### 2.13 Dashboard / Agents / Simulation / Franchise / Accounting / Signage

**Purpose**

- decision support, AI control surfaces, multi-location analytics, accounting reports, scenario modeling, digital signage

**Code**

- `backend/app/dashboard/*`
- `backend/app/core/*`
- `backend/app/digital_twin/*`
- `backend/app/franchise/*`
- `backend/app/accounting/*`
- `backend/app/signage/*`

**Features**

- dashboard KPIs, alerts, activity, audit timeline, exception inbox, SLO dashboard
- agent configs/actions
- revenue control policy / experiments / upsell candidates
- service autopilot suggest / approve / execute
- scenario and simulation runs
- franchise locations / metrics / rankings / anomalies / benchmarks
- budgets / invoices / GL / PL / cash flow / accounting reports
- screens / playlists / signage content + public display route

---

### 2.14 Email Inbox (AI Filtered)

**Purpose**

- reservation-related email ingestion, filtering, extraction, reply generation, and reply tracking

**Code**

- `backend/app/email_inbox/*`
- `frontend/src/components/hms/email-inbox-page.tsx`

**Features**

- email ingest
- reservation/spam/other classification
- structured booking extraction
- reply generation
- draft save
- send reply
- stats and filtered inbox listing

**UI elements confirmed**

- thread cards
- extracted booking label
- reply badges
- generate/save/send actions
- stats cards for filtered/pending/auto/manually replied

---

### 2.15 Public Hotel Landing + Public Restaurant App

**Purpose**

- guest acquisition and direct-booking clients that talk to the same backend

**Code**

- `das-elb-hotel/public/assets/api-integration.js`
- `res-web/src/lib/restaurantClient.js`

**Features**

- hotel public room/category read
- hotel public availability read
- hotel booking creation via canonical reservations endpoint
- restaurant booking creation via canonical reservations endpoint
- table-scoped or public menu browsing
- guest order submission
- order status polling

**Architectural note**

- both public apps act as clients of the canonical backend; they do not own separate reservation/order persistence

---

## 3. Backend Architecture

### Framework and runtime

- FastAPI application with lifespan startup checks
- async SQLAlchemy engine + async sessions
- PostgreSQL via `asyncpg`
- Redis-backed caches/locks/idempotency
- Celery worker integration
- mounted MCP server
- Stripe webhook handling

### Folder structure pattern

Most backend modules follow:

- `models.py` — SQLAlchemy persistence layer
- `schemas.py` — Pydantic request/response models
- `service.py` — business logic
- `router.py` — HTTP surface

### Cross-cutting backend components

- `app/config.py` — environment config
- `app/database.py` — engine/session/base model
- `app/dependencies.py` — auth/role/tenant dependencies
- `app/observability/*` — logging, metrics, middleware
- `app/middleware/*` — request id, rate limit, security, exception handling
- `app/shared/*` — audit, Celery, common helpers

### API design style

- mostly REST-like route groups by module prefix
- authenticated modules use tenant-scoped dependencies
- public routes live under `/api/public/*`
- internal diagnostics live under `/internal/*`
- real-time channel under `/ws/{restaurant_id}`
- tool surface under `/mcp/voicebooker`

### Architecture strengths

- strong module separation at package level
- canonical reservation and menu backbone
- clear public/authenticated API separation
- explicit operational domains (billing, inventory, workforce, safety, signage)

### Architecture weaknesses

- hotel functionality is layered into a restaurant-tenant architecture rather than modeled as a first-class tenant type
- many analytic/AI endpoints return untyped dicts instead of strict schemas
- not all domains are equally mature; restaurant operations are much deeper than hotel operations

---

## 4. API Mapping

The complete endpoint inventory is in `ARCHITECTURE_API_INVENTORY.md`.

High-level breakdown from actual router declarations:

- total backend endpoints discovered: **289**
- largest API surfaces:
  - billing: 35
  - reservations: 28
  - menu: 27
  - inventory: 19
  - agents/core: 17
  - vouchers: 17
  - signage: 13
  - dashboard: 11
  - workforce: 9
  - guests: 9
  - HMS: 8

### Important endpoint groups

- Auth: `/api/auth/*`
- Reservations: `/api/reservations/*`
- Availability: `/api/availability*`
- Billing: `/api/billing/*`
- Menu: `/api/menu/*`
- QR: `/api/qr/*`
- Public Restaurant: `/api/public/restaurant/*`
- Public Hotel: `/api/public/hotel/*`
- HMS: `/api/hms/*`
- Dashboard: `/api/dashboard/*`
- Workforce: `/api/workforce/*`
- Inventory: `/api/inventory/*`
- Signage: `/api/signage/*`
- Agents: `/api/agents/*`

---

## 5. Database Schema

The complete table-by-table schema inventory is in `ARCHITECTURE_DB_SCHEMA.md`.

High-level facts from SQLAlchemy models:

- total SQLAlchemy tables/models discovered: **90**
- all tables inherit shared base fields:
  - `id`
  - `created_at`
  - `updated_at`

### Core business tables

- auth: `restaurants`, `users`
- restaurant reservations: `floor_sections`, `tables`, `reservations`, `waitlist_entries`, `qr_table_codes`, `table_sessions`
- hotel: `hms_properties`, `hms_room_types`, `hms_rooms`, `hms_reservations`
- billing: `table_orders`, `order_items`, `bills`, `payments`, `cash_shifts`, `kds_station_configs`
- menu: `menu_categories`, `menu_items`, `menu_modifiers`, `menu_item_modifiers`, `menu_combos`, `upsell_rules`
- guests: `guest_profiles`, `orders`, `loyalty_accounts`, `promotions`
- inventory: vendors, items, purchase orders, movements, supplier catalog, auto-purchase rules, TVA reports

### Important relationship patterns

- restaurant operations hinge on `restaurant_id`
- hotel operations hinge on `property_id`
- guest profiles are shared references for both restaurant and hotel reservations
- billing joins table sessions, tables, employees, and menu items

---

## 6. Data Flows

### 6.1 Create Reservation

**Restaurant**

1. Management UI / public landing / restaurant app / MCP calls `POST /api/reservations`
2. payload validated by `UnifiedReservationCreate`
3. `ReservationService.create_reservation(...)` chooses restaurant branch
4. `ReservationAvailabilityService.prepare_restaurant_reservation(...)` validates slot/capacity
5. `Reservation` row persisted
6. availability invalidation + consistency checks scheduled
7. websocket event broadcast
8. reservation appears in management reservations page

**Hotel**

1. UI / landing / API / MCP calls same canonical endpoint
2. service chooses hotel branch from `kind` or inferred hotel fields
3. room type/category normalized against `room_inventory.py`
4. hotel availability validation runs
5. `HotelReservation` row persisted
6. optional Stripe payment intent may be created
7. hotel availability invalidation scheduled
8. websocket hotel booking event broadcast

### 6.2 Check-in / Check-out

Observed current design:

- front desk stats/arrivals/departures are read models over `HotelReservation`
- there is no separate check-in aggregate
- operationally, check-in/out is represented by reservation `status` plus check-in/check-out dates
- front desk UI prints `Meldeschein` and `Rechnung`
- HMS update route mutates the reservation record directly

This is lighter-weight than a mature PMS that would usually maintain:

- folios
- room move logs
- guest stay lifecycle events
- housekeeping blocking rules
- audit trail of stay state changes

### 6.3 Ordering -> Kitchen -> Billing

1. waiter or guest creates order
2. items appended to `TableOrder`
3. `send-to-kitchen` stamps items and assigns KDS station
4. kitchen board reads active KDS orders
5. ready/recall/bump actions update item/order state
6. bill is generated from order
7. payment/refund records persisted
8. receipt is exposed privately or by receipt token

### 6.4 Email Inbox

1. normalized email ingested
2. classified as reservation/spam/other
3. booking data extracted into JSON
4. persisted in `email_threads`
5. filtered inbox shown in HMS
6. AI reply generated and optionally sent
7. reply status stored

---

## 7. Authentication & Roles

### Auth mechanics

- login verifies bcrypt hash
- JWT access token includes:
  - `sub`
  - `role`
  - `restaurant_id`
- refresh token uses separate token type
- frontend sends bearer token via shared Axios client

### Backend authorization

- `get_current_user`
- `get_current_tenant_user`
- `require_roles(...)`

### Frontend authorization

- route permission matrix in `frontend/src/lib/access-control.ts`
- management surfaces restrict manager/admin pages by path prefix

### Important limitation

- role and tenant model is restaurant-centric
- hotel property access is not embedded into auth claims

---

## 8. Missing / Weak Areas

These are grounded in code structure and current implementation patterns.

1. **Hotel tenanting is weaker than restaurant tenanting**
   - auth carries `restaurant_id`, not hotel property context
   - HMS routes rely on `property_id` request parameters and fallback property resolution

2. **HMS is shallower than a full PMS**
   - there is no rich folio/stay/room-move/housekeeping engine comparable to enterprise PMS products
   - front desk is largely a same-day operational surface plus direct reservation mutation

3. **Mixed domain vocabulary**
   - the platform still carries heavy “Gestronomy” naming even while hotel features are present
   - this suggests hotel capabilities were layered into an originally restaurant-centric product

4. **Route/schema consistency is uneven**
   - some endpoints return strict Pydantic models
   - many analytics/AI endpoints return `dict[str, Any]` or untyped JSON
   - some groups expose duplicate slash/no-slash routes

5. **Hotel public defaults may drift**
   - public hotel router defaults `property_id=1`
   - the active hotel instance in the rest of the stack commonly uses property `546`

6. **Websocket abstraction is restaurant-shaped**
   - websocket manager is keyed by `restaurant_id`
   - hotel booking broadcasts reuse property id on the same channel abstraction

7. **Module maturity is uneven**
   - restaurant ordering/billing/menu is deep and coherent
   - several hotel/admin/AI modules are present as surfaces but not yet enterprise-complete

8. **Environment/tooling debt**
   - local backend virtualenv linkage is inconsistent in this checkout
   - this does not change runtime architecture, but it does affect maintainability/onboarding

---

## 9. Bottom-Line Architecture Assessment

This system is best described as:

> **A unified hospitality operations platform with a strong restaurant operating core and an emerging hotel management layer, exposed through one FastAPI backend, one dual-domain management SaaS, and two public booking/order clients.**

### Where it is strongest

- unified reservation creation
- live order / kitchen / billing flow
- canonical menu system
- modular backend structure
- broad operational surface area

### Where it is weakest compared with a mature PMS

- hotel stay lifecycle depth
- hotel-native tenanting and access control
- richer PMS objects (folios, rate plans, channel/housekeeping/task models, audit-grade stay lifecycle)
- schema and endpoint consistency in some newer/AI-heavy modules

---

## 10. Recommended Next Comparison Step vs Ibelsa

Use this architecture document with the two appendices to compare the current system against Ibelsa in these categories:

1. Reservation engine
2. Front desk / check-in / check-out
3. Folio / billing / payments
4. Room inventory / rate plans / availability
5. Housekeeping / maintenance
6. Guest CRM / email / marketing
7. Channel / distribution / revenue management
8. Role model / multi-property / tenancy
9. Reporting / audit / compliance
10. Restaurant-native capabilities that already exceed standard PMS scope

