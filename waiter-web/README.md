# waiter-web

Production waiter web app for the das elb hotel ecosystem. Replaces the SwiftUI
iOS WaiterApp for flows that need browser-based deploy/test (Render, Chrome).

## What it does

- Waiter signs in with staff credentials (`/api/waiter/auth/login`)
- Pulls live tables (`GET /api/waiter/tables`) and menu (`GET /api/waiter/menu`)
- Builds a cart, picks a table, submits an order (`POST /api/waiter/orders`)
- Orders land in the same `TableOrder` + `OrderItem` tables used by management
  and the kitchen screen — **no mock data, no duplicated logic**

## Stack

- Vite 5 + React 19 + TypeScript
- No router (single-page by design — keeps it simple per spec)
- Plain CSS (no framework) in the das elb dark-green / gold palette
- Production container: `nginx:alpine` serving the built SPA

## Endpoints used

All rooted under `VITE_API_BASE_URL` (prod: `https://gestronomy-api-5atv.onrender.com/api`):

| Method | Path                        | Auth | Purpose                |
| ------ | --------------------------- | ---- | ---------------------- |
| POST   | `/waiter/auth/login`        | no   | staff login            |
| GET    | `/waiter/tables`            | yes  | table list + status    |
| GET    | `/waiter/menu`              | yes  | categories + items     |
| POST   | `/waiter/orders`            | yes  | place order            |

Schemas are mirrored in `src/lib/api.ts` from
`backend/app/waiter/router.py`.

## Local dev

```bash
npm install
npm run dev    # http://localhost:5180
```

`.env` ships with the production API URL so the dev server talks to the real
live backend — that's intentional so a waiter running locally places real orders
that management + kitchen can see.

## Build

```bash
npm run build        # tsc -b && vite build
npm run preview      # serve dist/ on :4173
```

## Deploy

Deployed on Render via `render.yaml` as `waiter-web` (Docker web service).
`VITE_API_BASE_URL` is pinned to the gestronomy-api service URL.
