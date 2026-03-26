# Production Checklist

## Scope

This checklist is based on the repository as inspected on 2026-03-24. It is a repository-readiness review, not a live-environment audit.

It covers:

- tests
- build output
- migrations
- environment variables
- auth and CORS
- domain separation
- public vs private endpoints
- backup and rollback notes
- docs completeness

## Overall Status

**Overall verdict: FAIL for a full production launch.**

The repository has strong progress in architecture, observability, CI/CD, and production documentation, but it is **not yet release-ready as a whole**. The biggest blockers are:

- backend test suite is not green
- SaaS production build/test was not locally verifiable in this workspace
- auth and CORS are not yet aligned with the documented target production model
- public/private route boundaries still contain legacy collisions
- backup and rollback guidance exists, but remains incomplete and partially inconsistent with the current hosting model

## Checks Performed

### Executed during this review

- `backend/.venv/bin/python -m pytest -q`
- `backend/.venv/bin/alembic heads`
- `npm test` in `das-elb-hotel/`
- `npm run check` in `das-elb-hotel/`
- `npm run build` in `das-elb-rest/`
- `node --test tests/*.test.mjs` in `das-elb-mobile/`

### Inspected but not executed

- `frontend/` SaaS build and tests
  - local dependencies were not installed in this workspace
- full migration apply against a disposable database
  - not run in this review because it would require a dedicated throwaway database target

## Status Matrix

| Area | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Backend tests | `FAIL` | `77 passed, 13 failed` in `backend/.venv/bin/python -m pytest -q` | Failing areas include config validation, reservations API, and vouchers API |
| Landing page tests | `PASS` | `npm test` in `das-elb-hotel/` | 2/2 tests passed |
| Landing page build integrity | `PASS` | `npm run check` in `das-elb-hotel/` | Static output, hashed assets, and endpoint hygiene checks passed |
| Guest web build | `PARTIAL` | `npm run build` in `das-elb-rest/` passed | Build is only a static copy of `public/*` to `dist/`; does not validate `src/` behavior |
| Mobile tests | `PASS` | `node --test tests/*.test.mjs` in `das-elb-mobile/` | 6/6 tests passed |
| Mobile build reproducibility | `PARTIAL` | `das-elb-mobile/` has no lockfile and build was not run | CI currently uses `npm install`, not `npm ci` |
| SaaS tests/build | `FAIL` | not runnable locally in this review | `frontend/` has a lockfile, but local dependencies were absent; current tests are also minimal |
| Migrations | `PARTIAL` | `alembic heads` reports single head `z001a2b3c4d5` | Chain is single-head, but migration apply/rollback was not re-verified in this review |
| Environment variable documentation | `PARTIAL` | `.env.example` exists at repo root and in `das-elb-mobile/` | No dedicated `.env.example` for `frontend/` or `das-elb-hotel/`; several production vars are undocumented there |
| Auth model | `FAIL` | `frontend/src/lib/auth.ts`, `frontend/src/stores/auth-store.ts` | SaaS still persists bearer tokens in `localStorage`, while production architecture recommends HTTP-only cookies |
| CORS | `PARTIAL` | `backend/app/config.py`, `backend/app/main.py`, `render.yaml` | CORS is centralized, but defaults still target localhost and old Render domains instead of final custom domains |
| Domain separation in SaaS | `PARTIAL` | `frontend/src/app/(gastronomy)`, `frontend/src/app/(hotel)`, `frontend/src/lib/domain-config.ts` | Route groups and per-domain navigation exist, but the refactor is still in-flight in the worktree |
| Public vs private endpoint separation | `PARTIAL` | `backend/app/main.py`, public routers, landing adapter | Namespaces exist, but legacy `/api/reservations/` landing route collides with private reservations behavior |
| Backup notes | `PARTIAL` | `ROLLBACK.md`, `backend/ROLLBACK_RUNBOOK.md`, `docs/DATABASE_READINESS.md` | Snapshot guidance exists, but automated backup/restore policy is not fully documented |
| Rollback notes | `PARTIAL` | `ROLLBACK.md`, `backend/ROLLBACK_RUNBOOK.md`, `docs/CI_CD.md` | Rollback procedures exist, but root rollback doc still references Vercel-style flow instead of the current provider-agnostic/Render model |
| Docs completeness | `PARTIAL` | `docs/ARCHITECTURE_AUDIT.md`, `docs/PRODUCTION_ARCHITECTURE.md`, `docs/DATABASE_READINESS.md`, `docs/OPS_RUNBOOK.md`, `docs/CI_CD.md` | Core docs are much better now, but env/runbook/release ownership is still split across several files |

## Key Findings

### 1. Backend test suite is not production-green

Current backend test failures are release blockers.

Observed failures:

- `backend/tests/test_config.py`
  - production secret validation behavior no longer matches the tests
  - `sql_echo` setting expected by tests is missing
- `backend/tests/test_reservations/test_reservation_api.py`
  - `POST /api/reservations/` is hitting validation for landing-style fields (`name`, `date`, `time`, `persons`)
  - `GET /api/reservations/` returns `405`
- `backend/tests/test_vouchers/test_voucher_api.py`
  - `GET/POST /api/vouchers/` return `404`

Interpretation:

- private authenticated routes and legacy public routes are currently colliding at the contract level
- trailing-slash behavior is unsafe because `redirect_slashes=False` is enabled
- release confidence for the shared API is not high enough until these test failures are resolved

### 2. Public vs private route boundaries need cleanup

The route family design is mostly correct:

- public:
  - `/api/public/restaurant/*`
  - `/api/public/hotel/*`
  - `/api/qr/*`
  - `/api/auth/*`
  - legacy landing adapter under `/api/*`
- private:
  - `/api/menu/*`
  - `/api/reservations/*`
  - `/api/billing/*`
  - `/api/inventory/*`
  - `/api/dashboard/*`
  - `/api/hms/*`
  - others

But there is still a concrete collision:

- `backend/app/landing_adapter.py` exposes `POST /api/reservations/`
- `backend/app/reservations/router.py` uses `/api/reservations` without the trailing slash
- because `backend/app/main.py` sets `redirect_slashes=False`, the distinction is now contract-breaking instead of harmless

This is a production blocker for the shared backend.

### 3. SaaS domain separation is structurally better, but not yet release-confirmed

Positive signs:

- separate route groups exist:
  - `frontend/src/app/(gastronomy)`
  - `frontend/src/app/(hotel)`
- per-domain navigation and access control exist:
  - `frontend/src/lib/domain-config.ts`
  - `frontend/src/lib/access-control.ts`
  - `frontend/src/lib/navigation.ts`
  - `frontend/src/lib/role-routing.ts`

Risks:

- the worktree shows large in-progress route migration activity
- old route-group files are deleted while new ones are still untracked
- the local SaaS build was not verified in this review
- current frontend unit coverage is effectively a smoke placeholder

Conclusion:

- architecture direction is good
- production confidence for the SaaS host is still only partial

### 4. Auth strategy does not yet match the documented production target

Current code:

- backend uses bearer JWT auth
- frontend stores `access_token` and `refresh_token` in `localStorage`

Evidence:

- `frontend/src/lib/auth.ts`
- `frontend/src/stores/auth-store.ts`
- `backend/app/auth/router.py`
- `backend/app/dependencies.py`

Documented target:

- `docs/PRODUCTION_ARCHITECTURE.md` recommends HTTP-only cookies for the web SaaS and bearer tokens for native mobile

Conclusion:

- current auth is functional for development and internal usage
- current auth is **not yet aligned** with the target production security model for the SaaS

### 5. CORS is centralized, but not final-production ready

Positive:

- CORS is configured centrally in `backend/app/main.py`
- origins are read from `backend/app/config.py`

Gaps:

- default origins still include localhost and old Render hostnames
- production docs expect final custom domains such as:
  - hotel main domain
  - separate management SaaS domain
  - shared API domain
- there is not yet a documented, repo-local per-environment env example for the SaaS and hotel site

Conclusion:

- CORS implementation exists
- final production origin policy is not yet locked down

### 6. Environment variable coverage is incomplete across deploy targets

Present:

- root `.env.example`
- `das-elb-mobile/.env.example`

Missing or incomplete:

- no `frontend/.env.example`
- no `das-elb-hotel/.env.example`
- root example does not fully document newer SaaS domain variables such as:
  - `NEXT_PUBLIC_SAAS_BASE_URL`
  - `NEXT_PUBLIC_GASTRONOMY_ROUTE_BASE`
  - `NEXT_PUBLIC_HOTEL_ROUTE_BASE`
- hotel public runtime variables are not represented in a checked-in env example:
  - `PUBLIC_SITE_URL`
  - `PUBLIC_API_BASE_URL`
  - `PUBLIC_HOTEL_PROPERTY_ID`
  - `ENABLE_HSTS`
- observability thresholds are not represented in the root env example

Conclusion:

- environment configuration is only partially production-documented

### 7. Build confidence varies sharply by deploy target

#### `das-elb-hotel/`

Status: strongest public deploy target in this review

- tests passed
- static checks passed
- hashed asset model exists
- runtime config and security headers are implemented

#### `das-elb-rest/`

Status: technically buildable, but low confidence

- build passed
- current build is only:
  - `mkdir -p dist && cp -r public/* dist/`
- this means the React `src/` tree is not part of the actual build output path

#### `frontend/`

Status: unverified in this review

- Dockerfile and CI workflow are present
- package lock exists
- local dependencies were not installed in this workspace
- unit and e2e coverage are currently shallow

#### `das-elb-mobile/`

Status: early but promising, not release-ready

- unit tests passed
- no local build export was run in this review
- no lockfile is present, so installs are less reproducible

## Remaining Risks

- Hotel/HMS remains less mature than restaurant flows and should still be treated as a later-phase surface.
- The current worktree is not clean, which lowers release reproducibility and makes “known-good SHA” promotion harder.
- `das-elb-rest` still looks like a transitional artifact rather than a long-term production guest client.
- Frontend test coverage is not proportional to the size of the management SaaS.
- Root rollback guidance is partially stale relative to current provider-agnostic CI/CD.
- Backup policy is documented at a high level, but restore rehearsal and retention policy are not clearly captured in one place.
- Mobile install/build reproducibility is weaker than the web targets because there is no checked-in lockfile.

## Release Blockers

These should be treated as blockers before a production launch of the shared platform:

1. **Backend CI must be green.**
   - Resolve the 13 failing backend tests.
   - In particular, fix reservations and vouchers route contract issues.

2. **Eliminate legacy public/private route collisions.**
   - Remove or remap `/api/reservations/` landing behavior so it cannot interfere with authenticated reservations APIs.
   - Normalize trailing-slash behavior or make route contracts explicit and non-overlapping.

3. **Align SaaS auth with the production architecture.**
   - Move the web SaaS away from `localStorage` bearer-token storage if the documented cookie-based model remains the target.

4. **Lock down production CORS and env configuration.**
   - Replace legacy Render/local defaults with environment-specific production origins and checked-in env examples for each deploy target.

5. **Stabilize the SaaS domain refactor and verify the build.**
   - The gastronomy/hotel split is the right direction, but it needs a clean, reproducible build and stronger route protection tests.

6. **Re-verify migrations on a disposable database before release.**
   - The chain is single-head, but fresh upgrade safety was not re-validated in this review.

## Backup and Rollback Notes

### What exists

- root rollback guidance: `ROLLBACK.md`
- backend-specific rollback guidance: `backend/ROLLBACK_RUNBOOK.md`
- migration and rollout cautions: `docs/DATABASE_READINESS.md`
- release gating and SHA-based rollback flow: `docs/CI_CD.md`

### What is still missing or weak

- no single explicit backup retention policy
- no documented restore test cadence
- root rollback doc still reflects a Vercel-style frontend assumption more than the current shared-hosting model
- no unified runbook tying database snapshot, migration rollback, app rollback, and smoke verification into one operator checklist

## Docs Completeness

### Strong

- `docs/ARCHITECTURE_AUDIT.md`
- `docs/PRODUCTION_ARCHITECTURE.md`
- `docs/DATABASE_READINESS.md`
- `docs/OPS_RUNBOOK.md`
- `docs/CI_CD.md`

### Still incomplete

- per-app environment examples for `frontend/` and `das-elb-hotel/`
- one canonical release-go/no-go checklist until this file
- unified backup policy
- explicit final custom-domain values reflected in checked-in deployment defaults

## Recommended Launch Order

This launch order reflects the current repository state, not only the ideal target architecture.

### 1. Management SaaS

Launch first, but only for the **gastronomy/restaurant scope** and only after the backend blockers are cleared.

Conditions:

- backend tests green
- reservations and vouchers route issues fixed
- SaaS build verified
- auth/CORS/environment configuration finalized for the separate SaaS host

### 2. Landing Page

Launch second on the hotel main domain as a controlled public surface.

Reason:

- the static site itself is in relatively good shape
- but it depends on public backend contracts and domain/CORS/env correctness
- hotel/HMS features are still less mature than restaurant flows

Recommended scope at launch:

- marketing content
- contact/info pages
- only explicitly verified public booking/inquiry flows

### 3. Native Mobile App

Launch last.

Reason:

- the mobile codebase is early-stage and testable, but not yet release-hardened
- build reproducibility and store-release workflow are not yet fully demonstrated in this review
- mobile should ship only after the shared guest-ordering API contract is stable in production

## Final Go/No-Go Recommendation

**No-go for a full multi-surface production launch today.**

**Conditional go later for a phased rollout** if the following happen first:

- backend test suite returns to green
- public/private route collisions are resolved
- SaaS auth and CORS are aligned with production architecture
- migration safety is re-verified
- SaaS build and route-group refactor are validated in a clean environment

At that point, the recommended sequence remains:

1. gastronomy SaaS
2. hotel landing page
3. native mobile app

## Execution Plan (Derived from This Checklist)

This section converts the checklist into an actionable execution order.

All tasks must be executed in order. Do not skip steps.

### Phase 1 — Backend Stability (Blockers)

1. Fix backend test failures
   - Resolve failing config, reservations, and vouchers tests
   - Ensure `pytest` is fully green

2. Resolve public/private route collisions
   - Remove or refactor `/api/reservations/` conflict
   - Ensure no overlapping route behavior
   - Normalize trailing-slash behavior

3. Re-verify migrations
   - Run migrations on a fresh database
   - Test upgrade and rollback paths

### Phase 2 — Security and Core Architecture

4. Align SaaS authentication with production model
   - Move from `localStorage` tokens to HTTP-only cookies
   - Implement `/api/auth/me` session hydration

5. Lock down CORS configuration
   - Replace localhost and legacy domains
   - Use only production domains per environment

6. Complete environment variable coverage
   - Add `.env.example` for:
     - `frontend/`
     - `das-elb-hotel/`
   - Document all required production variables

### Phase 3 — Frontend and Deploy Targets

7. Stabilize SaaS build
   - Install dependencies cleanly
   - Ensure reproducible build
   - Validate route-group refactor

8. Fix `das-elb-rest` build integrity
   - Ensure `src/` is included in build
   - Not just static copy of `public/`

9. Clean working tree and ensure reproducibility
   - Commit or discard untracked files
   - Ensure builds work from clean clone

### Phase 4 — Infrastructure and Reliability

10. Define backup policy
    - Retention duration
    - Backup frequency
    - Restore procedure

11. Define rollback procedure
    - Align with current hosting (Render or other)
    - Remove outdated Vercel assumptions

12. Validate CI/CD pipeline
    - Ensure all builds and tests run in CI
    - Ensure release gating works

### Phase 5 — Launch Preparation

13. Validate SaaS (restaurant scope only)
14. Validate landing page public flows
15. Validate guest ordering API stability

### Final Rule

Do not launch until:

- all Phase 1 tasks are complete
- backend tests are green
- route collisions are eliminated
