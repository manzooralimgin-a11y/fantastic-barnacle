# Mobile App Decision

## Purpose

This document defines the recommended direction for the restaurant guest mobile app based on the current repository state.

It is intentionally grounded in the code that already exists in:

- `das-elb-rest/`
- `frontend/src/app/order/`
- `backend/app/reservations/public_router.py`
- `backend/app/qr_ordering/*`
- `backend/app/websockets/*`

The goal is to move the restaurant guest experience from the current web/static form into a production-ready native iOS/Android app without duplicating backend business logic.

---

## Current Repository Reality

There is not one clean, production-ready guest app today. There are effectively two overlapping implementations:

### 1. `das-elb-rest/` deploy target

Current behavior:

- Contains a static `public/index.html` implementation that directly calls:
  - `GET /api/public/restaurant/menu`
  - `GET /api/public/restaurant/table/{code}`
  - `POST /api/public/restaurant/order`
- Contains a separate `src/` React-style implementation, but `package.json` only copies `public/*` into `dist/`.
- The checked-in build path does not actually compile the React source.

Current issues:

- Hardcoded production API URL: `https://gestronomy-api.onrender.com`
- Uses mixed env naming (`NEXT_PUBLIC_API_URL`) even though the app is not actually a Next.js build
- The React source submits the wrong payload shape for the current backend public order endpoint
- Packaging and deploy story are inconsistent

### 2. `frontend/src/app/order/`

Current behavior:

- Contains a much cleaner QR ordering flow in `frontend/src/app/order/order-client.tsx`
- Uses:
  - `GET /api/qr/menu/{code}`
  - `POST /api/qr/order`
- Presents a mobile-first category/cart/order UX

Current issues:

- Lives inside the management/frontend codebase rather than a dedicated mobile app
- Does not currently poll or subscribe for guest-facing order status updates after submission
- Is still a web route, not a native mobile app

### Conclusion

The best reusable product flow currently in the repo is the QR ordering flow in `frontend/src/app/order/order-client.tsx`, not the current `das-elb-rest` packaging.

The future native app should reuse that flow and backend contract, not the current static `das-elb-rest/public/index.html` as its primary foundation.

---

## Recommended Mobile Stack

Recommended stack:

- React Native with Expo
- TypeScript
- Expo Router
- TanStack Query for server state
- Zustand for local cart/session state
- Zod for request/response validation at the app boundary
- `expo-secure-store` for any token storage
- `expo-camera` for QR scanning
- `expo-notifications` for push and local notifications

### Why this stack fits the codebase

1. The repository already uses React and TypeScript heavily.
   - `frontend/` is Next.js + TypeScript.
   - The cleanest guest flow already exists as a React client in `frontend/src/app/order/order-client.tsx`.

2. The mobile feature set is mostly API-driven, not device-heavy.
   - QR scan
   - fetch menu
   - maintain cart
   - submit order
   - refresh status

3. Expo is the fastest path to dual-platform delivery.
   - iOS and Android can ship from one codebase
   - camera, deep links, notifications, and secure storage are all well-supported

4. It avoids introducing a second frontend paradigm.
   - Flutter would add Dart to a repo that is already JavaScript/TypeScript-first
   - separate Swift/Kotlin apps would increase delivery time and maintenance overhead

5. It keeps the backend as the single source of truth.
   - no mobile-only backend
   - no duplicated ordering logic
   - no business logic moving into the client

---

## Recommended API Contract for Mobile

## Decision

The native app should standardize on the `qr_ordering` endpoints as the canonical guest ordering contract.

Use these as primary endpoints:

- `GET /api/qr/menu/{code}`
- `POST /api/qr/order`
- `GET /api/qr/order/{order_id}/status`

Keep these as compatibility/legacy public aliases during transition:

- `GET /api/public/restaurant/menu`
- `GET /api/public/restaurant/table/{code}`
- `POST /api/public/restaurant/order`

### Why prefer `/api/qr/*`

- `GET /api/qr/menu/{code}` already combines:
  - QR validation
  - table resolution
  - restaurant-scoped menu fetch
- `GET /api/qr/order/{order_id}/status` already exists
- This contract is closer to what a native QR ordering app actually needs

### Mobile endpoints needed

#### Core ordering

- `GET /api/qr/menu/{code}`
  - validates QR/table code
  - returns `table` metadata plus menu categories/items

- `POST /api/qr/order`
  - creates a dine-in guest order from a QR context
  - current payload:
    - `table_code`
    - `guest_name`
    - `items[]`
      - `menu_item_id`
      - `quantity`
      - optional `notes`
    - optional `notes`

- `GET /api/qr/order/{order_id}/status`
  - polls current order status and item statuses

#### Optional future public restaurant features

- `POST /api/reservations`
  - use the canonical reservation payload if restaurant reservations become part of the guest app

### Current response/status model

From current backend code:

- order starts as `pending`
- kitchen submission moves order to `submitted`
- item statuses move through values such as:
  - `pending`
  - `preparing`
  - `ready`
  - `served`
- order can later become `served`

The mobile app should treat this as a state machine, not as free-form text.

---

## Auth Strategy for Mobile

## Phase 1 recommendation

No guest login is required for QR ordering.

Use anonymous guest ordering with:

- QR/table code as the session entry point
- optional guest display name
- no persistent account requirement

### Why

- This matches the current backend public API design
- It keeps the restaurant guest flow fast
- It avoids forcing authentication into the dining-room QR flow

## If guest accounts are added later

Use bearer-token auth, not cookies.

Recommended future model:

- short-lived access token
- refresh token
- secure token storage via `expo-secure-store`
- backend continues to use JWT bearer auth

Do not use browser cookie-style auth in the native app.

## Important boundary

The native guest app is not the management SaaS.

It should not expose:

- staff/admin login
- billing backoffice
- inventory
- reservations dashboard
- internal websocket streams intended for operations

---

## QR and Table Resolution Flow

Recommended flow:

```text
Camera scan or deep link
  -> extract QR code
  -> call GET /api/qr/menu/{code}
  -> validate table + fetch scoped menu
  -> store table context in local session
  -> enter menu/cart/order flow
```

### Entry paths

Support both:

- native QR camera scan inside the app
- deep link / universal link from printed QR codes

Recommended link forms:

- `daselb://order?code=...`
- `https://www.das-elb-hotel.com/order?code=...` or equivalent public order link

### Behavior

1. User scans QR code.
2. App extracts `code`.
3. App calls `GET /api/qr/menu/{code}`.
4. Backend returns:
   - table info
   - section name
   - scoped menu
5. App stores:
   - `table_code`
   - `table_number`
   - `section_name`
   - menu payload
6. If QR code is invalid or expired:
   - show a clear recovery screen
   - ask guest to contact staff

### Why this is better than the current split public flow

Current `das-elb-rest` does:

- `GET /api/public/restaurant/table/{code}`
- then `GET /api/public/restaurant/menu`

That is weaker because the menu call is not inherently bound to the table scope.

The `qr_ordering` flow is the better mobile contract because it validates and scopes in one request.

---

## Menu Browsing and Cart Flow

Recommended flow:

```text
Resolved table
  -> show categories
  -> show items with price, prep time, allergens, dietary tags
  -> add item to cart
  -> edit quantity and item notes
  -> persist cart locally for the current session
```

### Data already available from backend

Menu item payload currently includes:

- `id`
- `name`
- `description`
- `price`
- `category_id`
- `category_name`
- `image_url`
- `is_available`
- `prep_time_min`
- `allergens`
- `dietary_tags`

That is enough for a strong first mobile menu experience.

### Recommended client behavior

- TanStack Query for fetching and caching the menu response
- Zustand store for:
  - current table context
  - cart items
  - guest display name
  - order draft notes
- Persist the cart locally during the active dining session
- Allow per-line-item notes
- Revalidate menu on foreground resume

### Important current gap

The current static guest app and the React guest source do not share one clean typed API client.

Before native implementation, the repo should define one canonical request/response contract for:

- QR menu fetch
- order submit
- order status

---

## Order Submission and Order Status Refresh

## Order submission flow

Recommended payload:

```json
{
  "table_code": "abc123",
  "guest_name": "Guest",
  "items": [
    {
      "menu_item_id": 42,
      "quantity": 2,
      "notes": "No onions"
    }
  ],
  "notes": "Please bring extra napkins"
}
```

Use:

- `POST /api/qr/order`

Expected response includes:

- `order_id`
- `table_number`
- `status`
- `items_count`
- `total`
- `message`

## Status refresh flow

Use:

- `GET /api/qr/order/{order_id}/status`

Recommended mobile behavior:

- after submit, navigate to an order-tracking screen
- poll every 10-15 seconds while that screen is visible
- slow polling when app is backgrounded or unfocused
- stop polling once order reaches a terminal state such as `served`

## Why not use the current websocket directly for guest order status

The current websocket implementation is not a good guest-mobile contract yet:

- websocket path is restaurant-wide: `/ws/{restaurant_id}`
- connection manager is in-memory only
- stream is broadcast-oriented for restaurant operations
- there is no guest-scoped order channel
- current websocket route does not represent a guest-safe subscription model

Conclusion:

- Phase 1 mobile should use polling for guest order status
- a guest-scoped realtime channel can be added later if needed

---

## Offline and Push Notification Needs

## Offline requirements

Recommended offline support:

- cache the last successful menu payload
- persist the in-progress cart locally
- preserve the scanned table context locally for the current session
- show clear offline state when network is lost

Do not support true offline order submission in Phase 1.

Why:

- restaurant orders are time-sensitive
- table context can expire or become invalid
- queued offline order submission can create duplicate or stale kitchen tickets

## Push notification requirements

Phase 1:

- not required for core dining-room QR ordering
- in-app polling is sufficient

Phase 2:

- optional local notifications when order status changes while app is open/backgrounded

Phase 3:

- optional remote push for:
  - order ready
  - served / pickup-ready alerts
  - bill-ready prompts

Backend gap for remote push:

- there is no guest device registration or guest push token flow in the current repository

---

## Phased Implementation Plan

## Phase 0: Contract cleanup in the shared backend

Before building the native app, align the public guest contract.

Required backend/API decisions:

1. Choose the canonical guest endpoint family.
   - Recommended: `/api/qr/*`

2. Keep or deprecate the split aliases.
   - `/api/public/restaurant/menu`
   - `/api/public/restaurant/table/{code}`
   - `/api/public/restaurant/order`

3. Ensure one stable status contract for guest orders.

4. Remove hardcoded deploy URL assumptions from `das-elb-rest`.

5. Add tests for:
   - `GET /api/qr/menu/{code}`
   - `POST /api/qr/order`
   - `GET /api/qr/order/{order_id}/status`

## Phase 1: Build the native QR ordering app

Deliver:

- Expo app skeleton
- QR scan + deep link handling
- table/menu resolution
- menu browsing
- cart
- order submission
- order tracking via polling

Recommended source of truth for UX:

- use `frontend/src/app/order/order-client.tsx` as the primary interaction reference
- do not port the current `das-elb-rest/public/index.html` directly

## Phase 2: Harden the mobile product surface

Add:

- local cart persistence
- better error/retry states
- better menu image caching
- order tracking screen with status timeline
- restaurant reservation support if product scope requires it

## Phase 3: Guest account and notification extensions

Optional additions:

- guest accounts / loyalty
- saved preferences
- push notifications
- order history
- mobile payment or bill settlement flows

## Phase 4: Retire legacy web guest packaging

Once native is stable:

- retire `das-elb-rest` as the primary guest product
- keep only a minimal web fallback or QR landing
- ensure all guest flows use the same shared backend contract

---

## Final Recommendation

Build the native guest app with Expo + React Native + TypeScript.

Base the product flow on:

- `frontend/src/app/order/order-client.tsx`

Standardize the backend contract around:

- `GET /api/qr/menu/{code}`
- `POST /api/qr/order`
- `GET /api/qr/order/{order_id}/status`

Do not treat the current `das-elb-rest` static deployment as the long-term mobile foundation.

It is useful as a temporary proof-of-flow, but the repo already contains a better mobile-shaped QR ordering implementation and a better backend endpoint family for the native app to adopt.
