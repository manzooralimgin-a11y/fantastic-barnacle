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

## Auth / SSR Hydration Pattern
The Zustand auth store (`src/stores/auth-store.ts`) initialises `token` as `null` — never reading `localStorage` at module load time. Next.js 16 (App Router) SSR-renders all `"use client"` components too; reading localStorage there would create a server/client mismatch that React 19 surfaces as a hard runtime error.

Both protected layouts (`(dashboard)/layout.tsx` and `(management)/layout.tsx`) follow this two-step pattern after mount:
1. `useEffect` reads `access_token` / `active_section` from localStorage and calls `setToken` / `setActiveSection` on the store.
2. A second `useEffect` (gated by the `hydrated` flag) calls `getMe()` to verify the token with the backend; redirects to `/login` on failure.
A `hydrated` state flag prevents the protected UI (and any child API calls) from rendering until auth is confirmed — eliminating the 401 storm that previously occurred on page load.
