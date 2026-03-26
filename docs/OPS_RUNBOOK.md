# Ops Runbook

## Scope

This runbook defines the production observability surface and first-response procedures for the shared Gestronomy backend, the restaurant guest/mobile API surface, the hotel public site integrations, and the management SaaS.

The current implementation assumes:

- one shared FastAPI backend
- one shared PostgreSQL system of record
- Redis for rate limiting, pub/sub, and Celery infrastructure
- WebSockets for realtime operational updates
- separate deploy targets for hotel public web, management SaaS, and guest/mobile clients

## Implemented Observability Surface

### Structured Logging

Backend logs are emitted as JSON and include:

- `timestamp`
- `logger`
- `level`
- `event`
- `request_id` when available
- `trace_id` when available
- request metadata such as path, method, status code, latency, tenant, and user context where available

Key event families:

- `request_completed`
- `validation_exception`
- `http_exception`
- `unhandled_exception`
- `security_audit`
- `application_startup`
- `application_shutdown`
- `websocket_connected`
- `websocket_disconnected`
- `websocket_client_message`
- `websocket_broadcast`

### Request Tracing

The backend supports lightweight correlation and trace propagation:

- accepts `X-Request-ID`
- accepts `X-Trace-ID`
- derives a trace id from W3C `traceparent` when present
- generates request and trace ids when the client does not send them
- returns `X-Request-ID` and `X-Trace-ID` on responses
- includes both ids in structured logs and JSON error responses

Recommended client behavior:

- SaaS web app: generate a request id per request and forward provider tracing headers when available
- mobile app: generate a request id per screen action or mutation flow
- public site forms: let the backend generate identifiers if the frontend does not already provide them

### Health and Readiness

Endpoints:

- `GET /health`
  - lightweight liveness probe
  - no dependency callouts
- `GET /api/health`
  - operational health snapshot
  - includes database, Redis, Celery, and websocket metrics summary
- `GET /ready`
- `GET /api/ready`
  - readiness probe
  - returns `503` when PostgreSQL, Redis, or the Celery broker is unavailable

Use:

- load balancer / platform liveness: `/health`
- readiness / deploy gating: `/ready` or `/api/ready`
- operator diagnostics: `/api/health`

### Metrics

Protected endpoint:

- `GET /api/metrics`
  - admin only

Current metrics include:

- API request volume
- latency percentiles and averages
- API error rate
- endpoint-level aggregates
- business counters:
  - `restaurant_reservations_total`
  - `restaurant_orders_total`
  - `hotel_bookings_total`
- websocket activity:
  - active connections
  - active channels
  - total connects/disconnects
  - total client messages
  - total broadcasts
  - total broadcast failures
- Celery visibility:
  - broker status
  - result backend status
  - queue lag
  - worker count and names
  - active/reserved/scheduled task counts
- dependency snapshot:
  - database
  - Redis
  - Celery broker
  - Celery result backend
- alert threshold evaluations

### Celery Monitoring

Celery visibility is exposed through the backend metrics endpoint by inspecting:

- broker reachability
- result backend reachability
- queue length for the default queue
- connected workers
- active, reserved, and scheduled task counts

This is intended for operator diagnostics and alerting. It is not a replacement for a dedicated Celery dashboard if task volume grows substantially.

## Production Environment Requirements

Required runtime configuration for production operations:

- `APP_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `CELERY_BROKER_URL`
- `CELERY_RESULT_BACKEND`
- `SECRET_KEY`
- `CORS_ORIGINS`

Recommended observability tuning:

- `SLO_API_P95_MS_THRESHOLD`
- `SLO_API_P95_MS_CRITICAL_THRESHOLD`
- `SLO_ERROR_RATE_PCT_THRESHOLD`
- `SLO_ERROR_RATE_PCT_CRITICAL_THRESHOLD`
- `SLO_QUEUE_LAG_THRESHOLD`
- `SLO_QUEUE_LAG_CRITICAL_THRESHOLD`
- `WEBSOCKET_BROADCAST_FAILURE_THRESHOLD`
- `CELERY_MONITOR_TIMEOUT_SECONDS`

If your platform maps env names differently, ensure the settings layer resolves them before production rollout.

## Alert Thresholds

Default backend thresholds currently implemented:

- API p95 latency warning: `800ms`
- API p95 latency critical: `1500ms`
- API error rate warning: `1%`
- API error rate critical: `5%`
- Celery queue lag warning: `100`
- Celery queue lag critical: `500`
- WebSocket broadcast failure warning: `5`

Recommended production alerts:

- page immediately on sustained database or Redis unavailability
- page on readiness failures across all backend instances
- warn on elevated latency or queue lag before customer-facing timeouts begin
- page on sustained QR/mobile ordering failures during service hours

## Suggested Alert Rules

### Backend/API

- Critical: readiness failing on all instances for 2 minutes
- Critical: API 5xx error rate above 5% for 5 minutes
- Warning: API p95 latency above 800ms for 10 minutes
- Critical: API p95 latency above 1500ms for 5 minutes

### Database

- Critical: database connectivity check failing for 1 minute
- Warning: connection saturation above 80%
- Warning: long-running query over 10 seconds

### Redis

- Critical: Redis ping failing for 1 minute
- Warning: reconnect storms or repeated timeouts

### Celery

- Warning: queue lag above 100 for 10 minutes
- Critical: queue lag above 500 for 5 minutes
- Critical: zero workers while scheduled/background work is expected

### WebSockets

- Warning: broadcast failures above threshold in a 15-minute window
- Warning: unusually sharp drop in active operational channels during service

## Incident Triage Checklist

Before diving deep:

1. Confirm whether the issue affects:
   - public hotel site
   - restaurant guest/mobile ordering
   - management SaaS
   - backend globally
2. Check:
   - `/health`
   - `/api/health`
   - `/api/ready`
   - `/api/metrics`
3. Identify whether the failure is:
   - dependency outage
   - deploy regression
   - traffic spike / abuse
   - data integrity issue
   - realtime delivery issue
4. Capture:
   - request ids
   - trace ids
   - time window
   - tenant or property affected
   - failing endpoint(s)

## Runbook: PostgreSQL Outage or Degradation

### Symptoms

- `/api/ready` returns `503` with `database=error`
- API mutations fail across domains
- elevated request latency and 5xx errors
- SaaS dashboards fail to load or mutate data

### Immediate Actions

1. Confirm scope from `/api/ready` and deployment logs.
2. Check database instance health, CPU, memory, storage, and connection count.
3. Check for long-running queries and lock contention.
4. Stop or reduce non-critical migration or import jobs if they are active.
5. If the issue started with a deployment, halt rollout and prepare rollback.

### Mitigation

- fail traffic away from unhealthy backend instances only if DB recovers
- increase DB capacity or connection limits if saturation is the cause
- terminate obviously stuck long-running queries when safe
- rollback recent schema or code deploys if they correlate with the incident

### Exit Criteria

- `/api/ready` returns `200`
- request latency and error rate return below alert thresholds
- representative SaaS and mobile/QR flows pass smoke checks

## Runbook: Redis Outage or Degradation

### Symptoms

- `/api/ready` returns `503` with `redis=error` or `celery_broker=error`
- rate limiting falls back to in-process counters
- websocket cross-instance delivery degrades
- Celery broker and result backend checks fail

### Immediate Actions

1. Confirm whether Redis is completely unavailable or intermittently timing out.
2. Check whether customer-facing writes still succeed against PostgreSQL.
3. Inspect Celery worker connectivity and backlog growth.
4. Inspect websocket failure counts in `/api/metrics`.

### Mitigation

- restore Redis availability first; it supports rate limiting, pub/sub, and Celery infrastructure
- if Redis is degraded but PostgreSQL is healthy, keep core API traffic flowing while communicating reduced realtime behavior
- scale Redis or move to a healthier node/plan if saturation is the cause

### Exit Criteria

- Redis ping succeeds consistently
- Celery broker and result backend report healthy
- websocket failures normalize
- rate limiting returns to shared-store behavior

## Runbook: Backend API Outage

### Symptoms

- `/health` fails
- all clients report backend unreachable
- deploy platform shows crash loops or readiness failures

### Immediate Actions

1. Check platform status and the latest release event.
2. Inspect startup logs for configuration, migration, or import errors.
3. Verify required env vars and secrets are present.
4. Check whether the failure is isolated to one instance or global.

### Mitigation

- rollback to the last known-good release when the issue is release-linked
- scale out replacement instances if capacity or crash isolation is the issue
- if startup depends on a bad migration, stop rollout and revert to the last schema-compatible release

### Exit Criteria

- all instances pass readiness
- health endpoints are stable for at least one monitoring window
- smoke checks pass for public and authenticated endpoints

## Runbook: Mobile API / QR Ordering Outage

### Symptoms

- QR scans resolve but menu/order requests fail
- elevated failures on:
  - `/api/qr/menu/{code}`
  - `/api/qr/order`
  - `/api/qr/order/{order_id}/status`
  - `/api/public/restaurant/order`
- restaurant orders drop unexpectedly while traffic is normal

### Immediate Actions

1. Check `/api/metrics` for:
   - `restaurant_orders_total`
   - API error rate
   - websocket broadcast failures
2. Verify public route validation errors versus server errors.
3. Confirm the affected tenant/table/QR code scope.
4. Test a known-good QR code path end to end.

### Mitigation

- if only realtime status is degraded, keep order submission open and communicate delayed status refresh
- if menu resolution fails for one tenant, verify QR/table records and tenant scoping
- if submissions fail globally, rollback the latest backend deploy and validate DB/Redis reachability

### Exit Criteria

- QR table resolution works
- menu loads
- order submission succeeds
- order status refresh recovers

## Runbook: Management SaaS Outage

### Symptoms

- SaaS host is down while backend may still be healthy
- authenticated dashboards fail to load or mutate data
- only admin/staff flows are affected

### Immediate Actions

1. Separate frontend-host failure from backend/API failure.
2. Test:
   - SaaS host root
   - login flow
   - one dashboard API call
3. Check deploy logs, CDN status, and environment configuration for the SaaS host.

### Mitigation

- rollback the SaaS frontend deploy independently of the backend when possible
- if auth-related, verify token issuance and CORS alignment with the SaaS domain
- if only one route group is affected, confirm domain-specific navigation or role-routing regressions

### Exit Criteria

- login works
- protected routes load by role
- core dashboards render and refresh data

## Runbook: WebSocket Degradation

### Symptoms

- orders or reservations are created but dashboards do not update live
- websocket broadcast failures rise in `/api/metrics`
- active channels drop unexpectedly

### Immediate Actions

1. Confirm whether writes still succeed through normal HTTP APIs.
2. Compare websocket metrics before and after the incident window.
3. Check Redis pub/sub availability and backend instance count.

### Mitigation

- treat realtime as degraded but keep write flows open if HTTP and DB are healthy
- recycle only the unhealthy instances if the problem is isolated
- restore Redis if cross-instance message delivery is impaired

### Exit Criteria

- websocket connects/disconnects stabilize
- dashboards receive new reservation/order events again

## Runbook: Celery Backlog or Worker Failure

### Symptoms

- queue lag rises
- zero workers reported
- active/reserved/scheduled tasks stop moving

### Immediate Actions

1. Check worker process health and recent deploy changes.
2. Inspect queue lag and worker counts from `/api/metrics`.
3. Identify whether backlog is caused by one stuck task family or global worker loss.

### Mitigation

- restart workers
- scale worker count temporarily
- pause non-critical task producers if backlog is causing customer impact
- rollback the latest task code if failures correlate with a release

### Exit Criteria

- workers reappear
- queue lag trends down
- critical background jobs complete successfully

## Operational Checks After Any Incident

Run these post-recovery checks:

1. `GET /health`
2. `GET /api/ready`
3. `GET /api/health`
4. `GET /api/metrics` as an admin
5. restaurant smoke:
   - reservation create
   - QR menu fetch
   - order submit
6. SaaS smoke:
   - login
   - dashboard load
7. hotel/public smoke if that surface is in scope:
   - rooms/availability
   - booking form submission path

## Follow-Up Expectations

After a production incident:

- link the incident to request ids or trace ids when possible
- capture tenant or property scope
- document whether the issue was code, config, capacity, or dependency related
- add or extend tests if the incident exposed a missing guardrail
- update this runbook when the operating model changes
