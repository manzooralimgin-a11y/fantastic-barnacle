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
