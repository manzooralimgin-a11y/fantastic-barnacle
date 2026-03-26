# Production CI/CD

## Goals

This monorepo ships multiple deploy targets that share one backend and one database system of record:

- `backend/` — shared FastAPI API, WebSockets, Celery, Alembic migrations
- `frontend/` — management SaaS for gastronomy and hotel operations
- `das-elb-hotel/` — hotel public site / landing domain
- `das-elb-rest/` — restaurant guest web app
- `das-elb-mobile/` — native mobile codebase, built and validated in CI but released separately from web deploys

The production pipeline is designed to be:

- provider-agnostic
- rollback-friendly
- migration-aware
- safe for shared backend and database releases

## Pipeline Layout

### 1. Continuous Integration

Workflow: `.github/workflows/ci.yml`

Runs on:

- pull requests
- pushes to `main`

Checks included:

- backend linting with `ruff`
- backend unit tests
- backend integration tests against PostgreSQL and Redis
- migration application check on a disposable database
- SaaS lint, typecheck, tests, and build
- landing page lint/check/build/tests
- restaurant guest app build check
- mobile test, typecheck, and Expo web export check
- Docker build validation for backend, SaaS, landing page, and restaurant guest app
- security scanning:
  - secret scanning with Gitleaks
  - Python dependency audit with `pip-audit`
  - Node dependency audit for the SaaS, landing page, and mobile app

### 2. Staging Deployment

Workflow: `.github/workflows/release.yml`

Runs automatically on push to `main`.

Behavior:

- creates a release manifest for the commit SHA
- optionally runs Alembic migrations against the staging database
- triggers provider deployment hooks
- runs post-deploy smoke checks

### 3. Production Deployment

Workflow: `.github/workflows/release.yml`

Runs manually with `workflow_dispatch`.

Behavior:

- operator selects `production`
- workflow checks out the requested commit SHA or tag
- release manifest is generated and uploaded as an artifact
- migrations run before service deploy when enabled
- GitHub Environment protection acts as the approval gate
- smoke checks confirm the release after deploy

### 4. Codex-Assisted Migration Review

Workflow: `.github/workflows/codex-migration-review.yml`

Runs on pull requests that touch:

- `backend/alembic/**`
- `backend/app/**/models.py`

It uses `openai/codex-action@v1` in read-only mode to review migration safety, rollout risk, and rollback concerns, then posts a PR comment.

## Validation Stages

### Linting

- Backend: `ruff check backend/app backend/scripts backend/tests`
- SaaS: `npm run lint` in `frontend/`
- Landing page: `npm run lint` in `das-elb-hotel/`

### Unit Tests

- Backend fast/unit paths
- SaaS Jest unit tests
- Mobile node-based unit tests
- Landing page node tests

### Integration Tests

- Backend API integration tests with PostgreSQL and Redis services
- Alembic upgrade check on a disposable database

### Build Checks

- Backend Python package install + Docker build
- SaaS `next build` + Docker build
- Landing page static build + Docker build
- Restaurant guest app static build + Docker build
- Mobile `expo export --platform web` as a packaging smoke test

### Security Scanning

- Gitleaks for committed secrets
- `pip-audit` for Python dependencies
- `npm audit --omit=dev --audit-level=high` for Node production dependencies

### Migration Checks

- `alembic upgrade head` against disposable PostgreSQL
- backend smoke test after migrations

## Required GitHub Secrets and Variables

### Shared

- `OPENAI_API_KEY`

### Staging / Production Environment Secrets

Configure these in GitHub Environments so `staging` and `production` can differ safely.

- `DATABASE_URL`
- `REDIS_URL`
- `SECRET_KEY`
- `DEPLOY_PROVIDER`

Optional deploy hooks:

- `BACKEND_DEPLOY_HOOK_URL`
- `SAAS_DEPLOY_HOOK_URL`
- `HOTEL_SITE_DEPLOY_HOOK_URL`
- `RESTAURANT_GUEST_DEPLOY_HOOK_URL`

Optional smoke URLs:

- `API_HEALTHCHECK_URL`
- `SAAS_HEALTHCHECK_URL`
- `HOTEL_HEALTHCHECK_URL`
- `RESTAURANT_GUEST_HEALTHCHECK_URL`

## Provider Adaptation

The release workflow is intentionally not tied to Render, Fly, Railway, or Kubernetes.

Deployment is routed through `scripts/ci/provider-deploy.sh`.

Current supported modes:

- `DEPLOY_PROVIDER=render`
- `DEPLOY_PROVIDER=generic-webhook`
- `DEPLOY_PROVIDER=webhook`
- `DEPLOY_PROVIDER=noop`

For providers without deploy hooks, replace the script internals with provider CLI commands while keeping the workflow contract the same.

## Release and Rollback Model

Rollback is based on immutable Git references:

- every deployment uses a commit SHA or explicit `release_ref`
- every release uploads a manifest artifact
- production deploys are manual and environment-gated
- rollback means re-running the release workflow with a previously known-good SHA or tag

Recommended release order:

1. verify CI is green on the release SHA
2. deploy staging automatically from `main`
3. validate smoke checks and critical flows
4. promote the same SHA to production
5. if needed, re-run production workflow with prior SHA

## Mobile Release Note

`das-elb-mobile/` is validated in CI, but production distribution should remain separate from server deployments.

Recommended mobile release flow:

1. pass CI
2. create signed build in the mobile distribution pipeline
3. distribute to internal testers / beta
4. promote to store release only after backend production is stable
