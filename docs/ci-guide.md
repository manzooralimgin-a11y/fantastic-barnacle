# CI/CD Guide — Das Elb Production Safety System

This document covers how the monorepo-wide CI/CD safety system works, how to run
tests locally, how to add a new app, and how to extend the test suite.

---

## Overview

The system is built around three guarantees:

| Guarantee | Enforced By |
|-----------|-------------|
| No broken auth | E2E tests for every app's login/register flow |
| No silent errors | Playwright assertions on error visibility + non-empty message |
| No wrong city / demo content | `scripts/check-content.sh` + E2E forbidden-string checks |
| No API contract drift | `packages/contracts` Zod schemas + `scripts/run-contract-tests.mjs` |
| No bad environment config | `scripts/validate-env.ts` |
| No deploy if anything fails | `deployment-gate` job requires all prior jobs to pass |

---

## CI Jobs (in order)

```
content-guard → load-matrix → app-ci (matrix) → contract-validation → security → docker-builds → deployment-gate
```

1. **`content-guard`** — Runs `scripts/check-content.sh`. Blocks on Hamburg refs,
   demo credential UI, stub backend responses, localhost in prod env files, and
   mock query cycles.

2. **`load-matrix`** — Reads `apps.json` and outputs a strategy matrix. Every
   subsequent app job uses this matrix — adding a new app to `apps.json` is all
   that's needed.

3. **`app-ci`** — Calls `.github/workflows/reusable-ci.yml` for each app in the
   matrix. Runs lint → typecheck → build → unit tests → E2E. Python apps get
   postgres + redis service containers automatically.

4. **`contract-validation`** — Runs `scripts/run-contract-tests.mjs` against the
   live production API to verify deployed contract shape.

5. **`security`** — `npm audit --audit-level=high` + `pip-audit` for Python deps.

6. **`docker-builds`** — Validates all 5 Dockerfiles build cleanly.

7. **`deployment-gate`** — `needs` every prior job. Fails if any job failed.
   Render will not receive a deploy webhook if this gate fails.

---

## Running Tests Locally

### All content checks (fastest — no build needed)

```bash
bash scripts/check-content.sh
```

### E2E tests for a specific app

Each app has a `test:e2e` script and a `playwright.config.ts`. The test server
is started automatically by Playwright's `webServer` config.

```bash
# Hotel Guest
cd hotel-guest
npx playwright install chromium
npm run test:e2e

# Hotel Owner
cd hotel-owner
npx playwright install chromium
npm run test:e2e

# Reservation Web
cd res-web
npx playwright install chromium
npm run test:e2e

# Management Frontend
cd frontend
npx playwright install chromium
npm run test:e2e
```

### Contract tests against production

```bash
node scripts/run-contract-tests.mjs
```

This hits the live Render API. It will fail if:
- Any 4xx response is missing an `error` field
- Pydantic v2 `detail` items are objects instead of strings
- Any endpoint returns 404 (endpoint not deployed)

### Env validation

```bash
# For a specific app
APP_PATH=frontend node scripts/validate-env.ts

# Or check all
for app in frontend hotel-guest hotel-owner res-web; do
  echo "=== $app ===" && APP_PATH=$app node scripts/validate-env.ts
done
```

---

## Adding a New App

1. **Register the app in `apps.json`:**

```json
{
  "app_name": "my-new-app",
  "app_path": "my-new-app",
  "runtime": "node",
  "build_command": "npm ci",
  "lint_command": "npm run lint",
  "typecheck_command": "npm run typecheck",
  "test_command": "npm test",
  "e2e_command": "npm run test:e2e",
  "docker_context": "my-new-app",
  "dockerfile": "my-new-app/Dockerfile"
}
```

2. **Add Playwright config** (`my-new-app/playwright.config.ts`):

```typescript
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://localhost:PORT" },
  webServer: {
    command: "npm run build && npm run preview -- --port PORT",
    url: "http://localhost:PORT",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

3. **Add E2E tests** (`my-new-app/tests/e2e/auth.spec.ts`) covering:
   - Page loads without forbidden strings (Hamburg, Demo Credentials, etc.)
   - Auth error messages are visible and non-empty
   - No raw JSON in the UI
   - No undefined/TypeError rendering

4. **Update `package.json`** to add:
   - `"test:e2e": "playwright test"` in scripts
   - `"@playwright/test": "^1.44.0"` in devDependencies

That's it — the CI matrix picks it up automatically on next push.

---

## Extending Tests

### Adding a new forbidden string

In `packages/contracts/src/api.ts`, add to `FORBIDDEN_UI_STRINGS`:

```typescript
export const FORBIDDEN_UI_STRINGS = [
  "Hamburg",
  "Demo Credentials",
  "fillDemo",
  "stub response",
  "LLM integration pending",
  "YOUR_NEW_STRING_HERE", // ← add here
] as const;
```

Also add it to `scripts/check-content.sh` in the "Wrong content in UI" section.

### Adding a new API endpoint contract

In `packages/contracts/src/`, create or extend a schema file:

```typescript
import { z } from "zod";

export const MyEndpointResponseSchema = z.object({
  id: z.number(),
  status: z.enum(["open", "closed"]),
  created_at: z.string().datetime(),
});

export type MyEndpointResponse = z.infer<typeof MyEndpointResponseSchema>;
```

Then add a live contract check in `scripts/run-contract-tests.mjs`.

### Adding a new backend test

In `backend/tests/test_contract_shapes.py`, add a test using the pytest fixtures
for the FastAPI test client. The test should POST to the endpoint and assert the
response shape matches the Pydantic schema.

---

## Port Map

| App | Dev Port | CI/Preview Port |
|-----|----------|-----------------|
| `frontend` (Next.js management) | 3000 | 3000 (next dev) |
| `hotel-guest` (Vite React) | 5173 | 4173 |
| `hotel-owner` (Next.js) | 3001 | 3001 |
| `res-web` (Vite React) | 5174 | 4174 |
| `backend` (FastAPI) | 8000 | 8000 |

---

## Test Credentials (CI only)

These credentials are only used in intercepted mocks — they never reach a real database.

| Role | Email | Password |
|------|-------|----------|
| Admin | `ci-admin@das-elb.test` | `CITestAdmin2024!` |
| Staff | `ci-staff@das-elb.test` | `CITestStaff2024!` |
| Guest | booking `BK999001`, last name `CIGuest` | — |

Defined in `packages/testing/src/seed.ts`.

---

## Debugging Failures

### "Hamburg" found in content-guard

Run: `bash scripts/check-content.sh 2>&1 | grep -A 2 "Hamburg"`

Check files in `hotel-guest/src/`, `frontend/src/`, `res-web/src/`. The city
should always be **Magdeburg** in user-facing strings.

### E2E test fails: "Error message must not be empty"

This means an auth error occurred but the UI rendered a blank or undefined error
message. Common causes:

1. `detail.map(d => d.msg)` where `d` is a string (Pydantic v2 format returns
   strings, not objects). Fix: check `typeof d === "string"` first.
2. Error state not rendered to DOM (invisible element). Fix: check CSS visibility
   and conditional rendering logic.
3. `error` field missing from API response. Fix: ensure backend returns
   `{ "error": "...", "status": N }` shape for all 4xx responses.

### Contract validation fails: detail items are objects

The backend returned Pydantic v1-style `detail: [{ "loc": [...], "msg": "...", "type": "..." }]`.
Check the Pydantic version: should be v2. In v2, validation errors when returned
as strings look like `"body.field_name: error message"`.

If the backend is sending v1-style, update the frontend `parseErrorMessage()` in
`packages/contracts/src/errors.ts` — it already handles both formats.

### Deployment gate failed

Check which job failed in the GitHub Actions run. Common culprits:
- `content-guard`: forbidden string introduced in a new file
- `app-ci / hotel-guest`: E2E test regression
- `contract-validation`: production API changed shape
- `docker-builds`: Dockerfile syntax error or missing dependency

Fix the root cause and push — the gate will re-run on the new commit.
