# Repository Guide

## System Summary

This repository is a shared-backend hospitality monorepo.

- `backend/` is the central FastAPI API and business-logic layer.
- `frontend/` is the management SaaS for gastronomy and hotel operations.
- `das-elb-hotel/` is the public landing and hotel website deploy target.
- `das-elb-rest/` is the guest-facing restaurant app deploy target and is the closest thing in this repo to a mobile-oriented app target.
- `management/` is currently not the live SaaS codebase and should be treated as a placeholder unless the user explicitly asks otherwise.

The system uses one shared PostgreSQL database, one shared backend, Redis, and Celery. Public apps and internal admin tools all depend on the same backend contracts.

## System Intent

This project is a unified hospitality platform.

It combines:

- hotel management: rooms, bookings, operations
- restaurant management: menu, orders, reservations, billing
- guest-facing experiences: landing page and mobile-oriented ordering flows
- internal management SaaS

The goal is to operate both hotel and restaurant domains on a single shared backend and database.

All applications must:

- remain consistent with shared data
- avoid duplicating business logic
- respect tenant isolation

## Main Apps

### `backend/`

Shared API for:

- auth and tenant-aware access
- restaurant menu, reservations, QR ordering, billing, guests, inventory, workforce, and dashboard flows
- hotel/HMS room and reservation flows
- integrations, metrics, and websocket events

### `frontend/`

Management SaaS deploy target.

- Restaurant operations live mainly under `src/app/(dashboard)`
- Hotel/HMS operations live mainly under `src/app/(management)`
- Shared auth, API, and websocket helpers live under `src/lib`

### `das-elb-hotel/`

Public landing/hotel deploy target.

- This folder is mostly a built static artifact served by `server.js`
- Treat it as its own deployable app
- Avoid casually patching compiled `_next` bundles unless the user explicitly asks for artifact-level fixes

### `das-elb-rest/`

Guest-facing restaurant deploy target.

- Uses public backend endpoints for menu, table lookup, and ordering
- Build/test scaffolding is minimal compared with `frontend/`

## Backend Module Map

The backend is a modular monolith, not a microservice system. Major modules include:

- Core restaurant flows: `auth`, `menu`, `reservations`, `qr_ordering`, `billing`, `guests`, `inventory`, `workforce`, `dashboard`
- Hotel flows: `hms`
- Extended ops and analytics: `accounting`, `forecasting`, `marketing`, `franchise`, `vision`, `food_safety`, `digital_twin`, `maintenance`, `menu_designer`, `signage`, `vouchers`, `core`, `integrations`
- Cross-cutting platform modules: `middleware`, `observability`, `security`, `shared`, `websockets`

Most mature paths are the restaurant-side reservation, menu, order, billing, and tenant-aware admin flows.

## API Contract Rules

The backend API is the single source of truth.

Rules:

- Frontends must not invent or assume API behavior.
- Any API change must either be backward compatible or explicitly update all affected clients.
- Public endpoints used by the landing page or guest app must be treated as stable contracts.
- Breaking changes must be documented and coordinated across:
  - `frontend/`
  - `das-elb-rest/`
  - `das-elb-hotel/`

## Environment Model

The system uses multiple environments:

- development
- staging
- production

Rules:

- Never hardcode environment-specific URLs.
- Always use environment variables.
- Backend must support different DB and Redis instances per environment.
- Frontends must use environment-specific API base URLs.

## Data Ownership

The backend owns all data.

Domain boundaries:

- Restaurant domain: menu, orders, reservations, billing
- Hotel domain: rooms, bookings, properties
- Shared domain: users, guests, auth

Rules:

- Do not duplicate data across domains.
- Do not move logic to the frontend if it belongs in the backend.
- Cross-domain interactions must go through backend services.

## Realtime and WebSockets

- WebSocket events are part of the backend contract.
- Current realtime usage includes:
  - order updates
  - reservation updates
  - dashboard refresh
- Do not replace websocket logic with polling unless explicitly required.
- Any new realtime feature should reuse the existing websocket infrastructure before introducing a new transport.

## Mobile App Direction

The guest-facing restaurant app is expected to evolve toward a more native-mobile experience over time.

Rules:

- Backend APIs used by `das-elb-rest/` must remain stable and mobile-friendly.
- Avoid tight coupling to browser-only features.
- Prefer stateless API design where possible.
- Authentication and session handling must stay mobile-compatible.

## Critical Production Flows

These flows must not break.

Restaurant:

- QR table to menu to order to billing
- reservation to table assignment

Hotel:

- room availability to booking
- reservation management

Shared:

- authentication
- tenant isolation
- API contract consistency

Any change affecting these flows must be tested explicitly.

## Current Production Gaps

Assume these are real risks until verified fixed in code:

- `das-elb-hotel/` is stored as built output instead of maintainable source, so large changes there are risky.
- `das-elb-rest/` has very light tooling and limited automated validation.
- Many HMS and advanced admin pages still appear to rely on fallback or mock-style frontend data.
- Existing repo review docs call out historical or ongoing risks around auth coverage, tenant isolation, websocket hardening, metrics exposure, and route/model drift.
- Backend contract changes can break three separate deploy targets at once.

## Coding Conventions

### General

- Prefer small, scoped changes over broad refactors.
- Do not modify application code outside the requested scope.
- Keep backend, landing site, guest app, and management SaaS concerns separated unless a shared contract change is required.
- If a backend contract changes, update only the affected deploy targets and call that out explicitly.

### Backend

- Follow the existing FastAPI module pattern: `router.py`, `service.py`, `models.py`, and `schemas.py` where applicable.
- Keep request handling thin and business logic in services.
- Use async SQLAlchemy patterns already present in `backend/app`.
- Preserve tenant scoping and role checks in every new or modified route.
- Match the existing Ruff rules in `backend/pyproject.toml`; line length is 100.
- Add Alembic migrations for schema changes. Do not make schema changes without migration coverage.

### Frontend SaaS

- Prefer TypeScript-first changes in `frontend/`.
- Use shared helpers in `frontend/src/lib/api.ts`, `frontend/src/lib/auth.ts`, and `frontend/src/lib/websocket.ts` instead of ad hoc API access.
- Avoid hardcoded API URLs, localhost fallbacks, or localStorage-based override mechanisms.
- Keep restaurant pages under the restaurant route group and HMS pages under the management route group unless there is a clear product reason to move them.

### Landing Site

- Treat `das-elb-hotel/` as a separate deploy target with its own build and runtime behavior.
- Because it is primarily built output, do not perform broad code cleanup or framework-level rewrites there unless explicitly requested.
- Prefer configuration, form wiring, and small targeted fixes over bundle surgery.

### Guest / Mobile-Oriented App

- Treat `das-elb-rest/` as its own deploy target.
- Keep it focused on public guest flows: menu, table resolution, ordering, and related UX.
- Use env-driven API base URLs only.

## Codex Working Rules

- Prefer small, incremental changes.
- Do not refactor large parts of the system unless explicitly asked.
- Always inspect existing patterns before adding new ones.
- When unsure, document assumptions instead of guessing.
- If a change may affect multiple apps, call it out explicitly.
- Never introduce breaking API changes silently.

## Testing Expectations

### Before merging backend changes

- Run targeted backend tests at minimum:
  - `cd backend && UV_CACHE_DIR=.uv-cache uv run --extra dev pytest -v`
- If you touch auth, tenancy, reservations, billing, or public endpoints, prefer running the relevant test subset plus a smoke pass.
- Run backend lint if the change is non-trivial:
  - `cd backend && UV_CACHE_DIR=.uv-cache uv run --extra dev ruff check .`

### Before merging management SaaS changes

- Run:
  - `cd frontend && npm run lint`
- Run the most relevant test command available for the touched area:
  - `cd frontend && npm test`
  - `cd frontend && npm run test:e2e`
- If the route is websocket-heavy or dashboard-heavy, do a manual smoke check too.

### Before merging landing-site or guest-app changes

- There is limited automated coverage here, so build and smoke-test are the minimum bar.
- For `das-elb-hotel/`:
  - `cd das-elb-hotel && npm run build`
  - If runtime behavior changed, also smoke `npm run dev`
- For `das-elb-rest/`:
  - `cd das-elb-rest && npm run build`
- If a backend contract used by these public apps changes, verify the affected API paths manually.

### For shared contract changes

- Test the backend first.
- Then smoke the affected deploy targets individually.
- Do not assume a successful `frontend/` run validates `das-elb-hotel/` or `das-elb-rest/`.

## Security Rules

- Never commit `.env`, secrets, tokens, or real customer PII.
- Preserve tenant isolation. If a backend model or query is restaurant-scoped, keep `restaurant_id` filtering intact.
- Every non-public backend endpoint must have explicit auth and, where appropriate, role enforcement.
- Treat `/api/metrics`, MCP/integration endpoints, websockets, and public form endpoints as high-risk surfaces.
- Do not hardcode production URLs, webhook secrets, or API bases in source.
- Reuse the existing request limits, rate limits, and security-header patterns instead of bypassing them.
- Validate external inputs, especially booking refs, payment values, webhook payloads, and public-form submissions.
- Do not introduce new public endpoints without considering abuse rate, auth requirements, and tenant boundaries.

## Deployment Rules

- `render.yaml` is the clearest source of truth for the intended production deploy targets.
- `docker-compose.yml` is for local development orchestration.
- `docker-compose.prod.yml` is the closest production-like local container setup.
- The backend, management SaaS, landing site, and guest app are separate deploy targets. Changes to one should not silently assume deployment of another.
- Keep env var expectations target-specific:
  - `frontend/` uses `NEXT_PUBLIC_API_URL`
  - `das-elb-hotel/` uses `NEXT_PUBLIC_API_URL`
  - `das-elb-rest/` uses `VITE_API_URL`
- Any schema or API change that affects shared data must be reviewed as a multi-target change, even if only one app initiated it.
- Be cautious with migrations. This repo has prior notes about tenant/index regressions, so migration safety matters.

## Deploy Target Rules

Treat these as independent products that happen to share a backend:

### Landing Page

- Deploy target: `das-elb-hotel/`
- Public-facing, brand-sensitive, mostly static
- Changes should avoid breaking marketing pages, booking/contact flows, and asset serving

### Mobile App / Guest App

- Deploy target: `das-elb-rest/`
- Public-facing, mobile-oriented, ordering-focused
- Keep UX lean and backend contract usage stable

### Management SaaS

- Deploy target: `frontend/`
- Authenticated internal tool
- Supports both gastronomy and hotel operations but should not be confused with the public landing or guest app

## Working Rule of Thumb

When in doubt:

- change the shared backend only when the contract truly belongs in the shared platform
- change only one frontend deploy target unless multiple targets are definitely affected
- test the exact target you changed
- call out production gaps or uncertainty instead of guessing
