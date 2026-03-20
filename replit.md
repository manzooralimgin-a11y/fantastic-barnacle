# Gestronomy — AI-Powered Restaurant Management System

## Project Overview
Full-stack restaurant management platform with an AI-powered backend (Python FastAPI) and a modern frontend (Next.js 16 + React 19 + Tailwind CSS).

## Architecture

### Frontend (`/frontend`)
- **Framework**: Next.js 16 with Turbopack, React 19
- **UI**: Tailwind CSS, Radix UI, shadcn/ui components
- **State**: Zustand + React Query
- **Port**: 5000 (Replit webview)
- **Package manager**: npm

### Backend (`/backend`)
- **Framework**: FastAPI + Uvicorn
- **Database**: PostgreSQL via SQLAlchemy (async) + Alembic migrations
- **Cache/Queue**: Redis + Celery
- **Auth**: JWT (PyJWT + passlib/bcrypt)
- **AI**: Anthropic Claude
- **Port**: 8000

## Running the Project

Two workflows are configured:
1. **Start application** — Next.js frontend dev server on port 5000
2. **Backend API** — FastAPI backend on port 8000

The frontend proxies all `/api/*` and `/ws/*` requests to `http://localhost:8000` via Next.js rewrites (configured in `frontend/next.config.ts`).

## Environment Variables / Secrets

Required secrets (set in Replit Secrets panel):
- `DATABASE_URL` — PostgreSQL connection string (already configured)
- `SECRET_KEY` — JWT signing secret (request from user if not set)
- `ANTHROPIC_API_KEY` — For AI features (optional)
- `STRIPE_API_KEY` — For billing (optional)
- `STRIPE_WEBHOOK_SECRET` — For Stripe webhooks (optional)
- `RESEND_API_KEY` — For transactional emails (optional)
- `VOICEBOOKER_SECRET` — For VoiceBooker webhook verification (optional)

Non-sensitive env vars are set as Replit environment variables:
- `APP_ENV=development`
- `BACKEND_URL=http://localhost:8000`
- `CORS_ORIGINS=http://localhost:5000,http://localhost:3000`
- `PYTHONPATH=/home/runner/workspace/backend`

## Key Files
- `frontend/next.config.ts` — Next.js config with API proxy rewrites
- `frontend/src/lib/api.ts` — Axios client with relative `/api` base URL
- `backend/app/main.py` — FastAPI app entry point with all routers
- `backend/app/config.py` — Pydantic settings (reads from env)
- `backend/alembic/` — Database migrations

## Replit Compatibility Notes
- Static export (`output: "export"`) is disabled — it breaks the dev server
- Frontend uses relative `/api` URLs, proxied by Next.js to the backend
- Both servers bind to `0.0.0.0` for Replit's proxied preview
- Port 5000 is used for the frontend (required for Replit webview)
- WebSocket URL derives from `window.location.hostname` at runtime (port 8000)
- **Production-mode workflow** (`frontend/start-dev.sh`): the "Start application" workflow runs `next build` → `next start`. This eliminates the Turbopack cold-compile race that caused repeated "crashed" banners. `next start` binds port 5000 in ~500 ms and serves every page as pre-compiled static HTML (< 30 ms per request). `next build` only re-runs when the git HEAD commit changes (tracked via `.next/.build-commit`); each build takes ~17 seconds.
- **Placeholder server during build**: a tiny Node.js HTTP server binds port 5000 within milliseconds of the script starting (before and throughout `next build`) and returns HTTP 200 for every request. It is `kill -9`'d the moment the build finishes, then `exec npm start` binds port 5000 within ~200ms. The health-check never sees an unresponsive port.
- **SIGKILL is intentional in the startup script**: the old `next start` (production) process is killed with `SIGKILL` immediately. This is safe because `next start` only READS the pre-built `.next/` output — there is no incremental Turbopack cache being written that could be corrupted. The fast kill minimises the time port 5000 is dark before the placeholder takes over.
- **Do NOT use `pkill -9 next-server` if running `next dev`** — in dev mode, SIGKILL interrupts Turbopack's incremental cache flush and corrupts `.next/dev/cache`, causing a 6-second cold re-init.
- **No hot-reload in the webview** — the workflow serves the production bundle. To develop with live reloading, stop the workflow and run `cd frontend && npm run dev` in a shell instead.

## Design System
**Luxury Forest — 2026 Editorial**: `--color-brand-green: #1A2F24`, `--color-brand-cream: #FDFBF7`, `--color-brand-gold: #C5A059`.

All CSS custom properties are declared in `frontend/src/app/globals.css` (`:root` and `.dark`). This includes the complete glass system (`--glass-bg`, `--glass-blur`, `--glass-border`, etc.), gold tokens (`--gold`, `--gold-hover`, `--gold-dim`, etc.), status palette (`--status-success`, `--status-danger`, etc.), motion tokens (`--motion-fast/base/slow`, `--ease-editorial`), and atmospheric gradient stops (`--atmo-green/gold/emerald`). These variables are consumed by Tailwind via `tailwind.config.ts` theme extensions; missing variables cause silent property failures (transparent backgrounds, no blur, invisible text).

**Operational pages** (orders, reservations, inventory, menu) use emerald/amber/blue for status colour-coding — this is intentional UX (green=available, amber=reserved, red=unavailable) and should not be changed to brand gold.

## Backend — Database URL Handling
Replit's PostgreSQL provides a `DATABASE_URL` with `?sslmode=disable` appended. asyncpg does not accept `sslmode` as a URL query parameter (only psycopg2 does). The `build_database_urls` validator in `backend/app/config.py` strips `sslmode` (and any other unsupported parameters) using `urllib.parse` before constructing the asyncpg URL.

## Database Setup & Seeding
After running migrations (`cd backend && python -m alembic upgrade head`), seed the database with the default restaurant and admin user:
```
PYTHONPATH=/home/runner/workspace/backend python backend/scripts/seed.py
```
Default admin credentials: `admin@gestronomy.app` / `Admin1234!`

The `b1c2d3e4f5a6_add_performance_indexes.py` migration uses `CREATE INDEX IF NOT EXISTS` (raw SQL via `op.get_bind()`) because earlier migrations already create some of these indexes — idempotent indexes prevent duplicate-index errors on fresh installs.

Migration `z001a2b3c4d5` adds extended fields to `hms_reservations` (anrede, phone, room, room_type_label, adults, children, zahlungs_methode, zahlungs_status, special_requests, payment_status, booking_id) and gift card columns to `vouchers` (is_gift_card, purchaser_name).

## HMS Hotel Module — Database Seed
A hotel property ("DAS Elb Magdeburg") with 30 rooms across 5 floors and 3 room types (Komfort €89, Komfort Plus €129, Suite €199) must exist for HMS reservation creation to work. Seed it by running the async seed script in the backend shell if `GET /api/hms/overview` returns fallback static data.

## HMS Endpoints
All HMS routes are under `/api/hms/` (prefixed in main.py):
- `GET /overview` — hotel property + room status summary
- `GET /rooms` — list all rooms
- `GET /front-desk/stats` — today's arrivals, departures, occupancy counts
- `GET /front-desk/arrivals` — today's check-ins with `{ items: [...] }` shape
- `GET /front-desk/departures` — today's check-outs with `{ items: [...] }` shape
- `GET /reservations` — list all reservations (mapped to frontend Reservation type)
- `POST /reservations` — create reservation (auto-generates booking_id and room if not provided)
- `PUT /reservations/{id}` — full/partial update
- `PATCH /reservations/{id}` — alias for PUT (used for cancel: `{status:"cancelled"}`)

## Voucher Gift Cards
Gift cards use the existing `vouchers` table with `is_gift_card=True`. Routes under `/api/vouchers/`:
- `GET /gift-cards` — list only gift cards (filtered by `is_gift_card=True`)
- `POST /gift-cards` — create gift card; auto-generates `GC-XXXXXXXXXX` code
- `GET /vouchers` — regular vouchers only (filtered by `is_gift_card=False`)
Field mapping: `amount_total→initial_balance`, `amount_remaining→current_balance`, `customer_name→recipient_name`, `customer_email→recipient_email`, `notes→message`, `purchaser_name→purchaser_name`.

## Shared Frontend Components
Located at `frontend/src/components/shared/`:
- `loading.tsx` — Loader2 spinner with size variants and optional className
- `stat-card.tsx` — KPI card with icon, value, delta
- `data-table.tsx` — Generic sortable/filterable table
- `empty-state.tsx` — Empty/zero-state placeholder with icon and optional action
- `page-header.tsx` — Consistent page title + subtitle + action slot
- `api-error.tsx` — Dismissible error banner with retry callback

## Error Handling Pattern (Frontend Pages)
All operational pages (`orders`, `reservations`, `inventory`, `menu`, `billing`) follow this pattern:
1. `const [fetchError, setFetchError] = useState<string | null>(null)`
2. In `fetchData` catch: `setFetchError("descriptive message")`
3. Loading state: `return <Loading size="lg" className="min-h-[60vh]" />`
4. At top of return JSX: `{fetchError && <ApiError message={fetchError} onRetry={fetchData} />}`
5. Never `/* swallow */` errors silently

## Backend Error Handling
Global exception handlers registered in `backend/app/main.py`:
- `HTTPException` → `{"error": str, "status": int}` JSON
- `RequestValidationError` → `{"error": "Validation error", "detail": [...], "status": 422}`
- Unhandled `Exception` → `{"error": "An unexpected error occurred...", "status": 500}` + full traceback logged at `ERROR` level via `app.errors` logger

## Frontend ↔ Backend Schema Synchronization (Completed)
All frontend modules have been audited and synchronized with backend schemas. Known fixes applied:

### Vouchers Page (`/vouchers/page.tsx`)
- `handleAddVoucher`: Now sends `{amount_total, customer_name, customer_email, expiry_date, notes}` — backend ignores `code`, `voucher_type`, `value`, etc.
- `handleToggleVoucher`: Now sends `{status: "active"|"cancelled"}` — backend `VoucherUpdate` has no `is_active` field
- `VoucherType` interface updated to match `VoucherRead` response; `is_active` derived from `status === "active"`
- Form redesigned: collects Amount, Customer Name/Email, Expiry Date, Notes (not discount coupon fields)

### Inventory Page (`/inventory/page.tsx`)
- `POST /inventory/items`: `unit_cost` → `cost_per_unit` (backend `InventoryItemCreate` uses `cost_per_unit`)
- `POST /inventory/orders`: `total_amount` → `total` + added `order_date: today` (required field, causes 422 without it)
- `POST /inventory/orders/{id}/receive`: added `received_items_json: {}` (required by `GoodsReceiptCreate`)
- `PurchaseOrder` interface: `total_amount` → `total`

### Billing Page (`/billing/page.tsx`)
- `POST /billing/cash-shifts/open`: removed `opened_by` (FK to employees table — always 500 if no employees exist)
- `POST /billing/cash-shifts/{id}/close`: removed `closed_by` (same FK issue)

### Backend Fixes (DB + Models + Schemas)
- `reservations.payment_status`: Column exists in DB (NOT NULL, no default) but not in SQLAlchemy model. Fixed: added `server_default="unpaid"` to DB and model. Prevents 500 on every reservation creation.
- `cash_shifts.opened_by`: Was NOT NULL FK to `employees` (no employees seeded). Fixed: made nullable in DB (`ALTER COLUMN ... DROP NOT NULL`), updated `CashShift` model to `nullable=True`, updated `CashShiftOpen`/`CashShiftClose`/`CashShiftRead` Pydantic schemas to `int | None = None`.

### Verified Working (no changes needed)
- **Reservations**: All payloads match backend schemas exactly
- **Orders**: All payloads match backend schemas exactly  
- **Menu**: All payloads match backend schemas exactly
- **Kitchen Display (KDS)**: All endpoints are action-only POST (no body required)
- **Billing payments, bills, refunds, send-receipt**: All payloads match schemas

## Button Variants
The `default` button variant (`frontend/src/components/ui/button.tsx`) uses solid gold (`bg-accent-DEFAULT`) with dark forest text (`text-[#1A2F24]`) for WCAG AA contrast on both light and dark backgrounds. Use `glow` variant for subtle glass-style buttons on dark dashboard pages.

## Auth / SSR Hydration Pattern
The Zustand auth store (`src/stores/auth-store.ts`) initialises `token` as `null` — never reading `localStorage` at module load time. Next.js 16 (App Router) SSR-renders all `"use client"` components too; reading localStorage there would create a server/client mismatch that React 19 surfaces as a hard runtime error.

Both protected layouts (`(dashboard)/layout.tsx` and `(management)/layout.tsx`) follow this two-step pattern after mount:
1. `useEffect` reads `access_token` / `active_section` from localStorage and calls `setToken` / `setActiveSection` on the store.
2. A second `useEffect` (gated by the `hydrated` flag) calls `getMe()` to verify the token with the backend; redirects to `/login` on failure.
A `hydrated` state flag prevents the protected UI (and any child API calls) from rendering until auth is confirmed — eliminating the 401 storm that previously occurred on page load.
