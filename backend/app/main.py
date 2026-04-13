import asyncio
import logging
import os
import sys
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import JSONResponse, RedirectResponse, Response

from app.auth.models import UserRole
from app.config import settings
from app.database import AsyncSession, engine, get_db
from app.dependencies import get_current_tenant_user, get_current_user, require_roles
from app.hms.room_inventory import RoomInventoryValidationError, expected_room_count, validate_room_inventory
from app.middleware.request_id import RequestIdMiddleware, get_request_id
from app.observability.alerts import evaluate_alert_thresholds
from app.observability.logging import configure_logging, log_event
from app.observability.metrics import api_metrics, get_celery_monitor_snapshot
from app.reservations.cache import availability_cache_store
from app.reservations.consistency import check_system_consistency
from app.security.rate_limit import enforce_rate_limit, get_client_identifier
from app.shared.events import get_redis

configure_logging()

logger = logging.getLogger("app.security")
startup_logger = logging.getLogger("app.lifecycle")
request_logger = logging.getLogger("app.requests")
_dependency_status_cache: dict[str, Any] | None = None
_dependency_status_cache_expires_at: float = 0.0
_dependency_status_cache_lock = asyncio.Lock()


def _is_test_environment() -> bool:
    return "PYTEST_CURRENT_TEST" in os.environ or "pytest" in sys.modules


async def _migration_status() -> tuple[str, str | None, list[str]]:
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        backend_dir = Path(__file__).resolve().parents[1]
        config = Config(str(backend_dir / "alembic.ini"))
        config.set_main_option("script_location", str(backend_dir / "alembic"))
        script = ScriptDirectory.from_config(config)
        heads = list(script.get_heads())
        async with engine.connect() as connection:
            result = await connection.execute(text("SELECT version_num FROM alembic_version"))
            current = result.scalar_one_or_none()
        if current in heads and len(heads) == 1:
            return "ok", current, heads
        return "error", current, heads
    except Exception:
        return "error", None, []


async def _validate_startup_state() -> dict[str, object]:
    failures: list[str] = []
    details: dict[str, object] = {"service": settings.app_name}

    try:
        validate_room_inventory()
        details["room_inventory"] = "ok"
        details["room_inventory_count"] = expected_room_count()
    except RoomInventoryValidationError as exc:
        details["room_inventory"] = "error"
        details["room_inventory_error"] = str(exc)
        failures.append("room_inventory")

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        details["database"] = "connected"
    except Exception as exc:
        details["database"] = "error"
        details["database_error"] = str(exc)
        failures.append("database")

    if settings.startup_validation_require_redis:
        try:
            redis = await get_redis()
            await redis.ping()
            await availability_cache_store.initialize_epoch()
            details["redis"] = "connected"
        except Exception as exc:
            details["redis"] = "error"
            details["redis_error"] = str(exc)
            failures.append("redis")
    else:
        details["redis"] = "skipped"

    if settings.startup_validation_require_migrations:
        migration_status, current_revision, heads = await _migration_status()
        details["migrations"] = migration_status
        details["current_revision"] = current_revision
        details["head_revisions"] = heads
        if migration_status != "ok":
            failures.append("migrations")
    else:
        details["migrations"] = "skipped"

    origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
    if not origins:
        details["config"] = "error"
        failures.append("config")
    else:
        details["config"] = "ok"
        details["cors_origin_count"] = len(origins)

    details["status"] = "ok" if not failures else "error"
    details["failures"] = failures
    return details


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_event(startup_logger, logging.INFO, "application_startup", service=settings.app_name)
    startup_validation = await _validate_startup_state()
    if startup_validation["status"] != "ok":
        log_event(
            startup_logger,
            logging.ERROR,
            "startup_validation_failed",
            **startup_validation,
        )
        if settings.startup_validation_enforced and not _is_test_environment():
            raise RuntimeError("Startup validation failed")
    else:
        log_event(
            startup_logger,
            logging.INFO,
            "startup_validation_passed",
            **startup_validation,
        )
    yield
    log_event(startup_logger, logging.INFO, "application_shutdown", service=settings.app_name)
    await engine.dispose()
    log_event(startup_logger, logging.INFO, "database_engine_disposed", service=settings.app_name)


app = FastAPI(
    title=settings.app_name,
    description="AI-Powered Restaurant Management System",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestIdMiddleware)

_error_logger = logging.getLogger("app.errors")


def _get_request_id_for_response(request: Request) -> str:
    rid = getattr(request.state, "request_id", "") or get_request_id()
    if rid:
        return rid
    return request.headers.get("X-Request-ID", "")


def _get_trace_id_for_response(request: Request) -> str:
    rid = getattr(request.state, "trace_id", "")
    if rid:
        return rid
    return request.headers.get("X-Trace-ID", "")


def _error_content(
    request: Request,
    status_code: int,
    error: str,
    detail=None,
):
    content = {
        "error": error,
        "status": status_code,
        "request_id": _get_request_id_for_response(request),
        "trace_id": _get_trace_id_for_response(request),
    }
    if detail is not None:
        content["detail"] = detail
    return content


def _business_metric_name(request: Request, status_code: int) -> str | None:
    if request.method != "POST" or status_code >= 400:
        return None

    path = request.url.path.rstrip("/") or "/"
    if path == "/api/reservations":
        if getattr(request.state, "created_reservation_kind", None) == "hotel":
            return "hotel_bookings_total"
        return "restaurant_reservations_total"
    if path in {"/api/billing/orders", "/api/qr/order", "/api/public/restaurant/order"}:
        return "restaurant_orders_total"
    return None


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    error = detail if isinstance(detail, str) else "Request failed"
    log_event(
        _error_logger,
        logging.WARNING,
        "http_exception",
        path=request.url.path,
        method=request.method,
        status_code=exc.status_code,
        detail=detail,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_content(request, exc.status_code, error, detail),
        headers=exc.headers,
    )


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    detail = exc.detail
    error = detail if isinstance(detail, str) else "Request failed"
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_content(request, exc.status_code, error, detail),
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    messages = [
        f"{'.'.join(str(loc_part) for loc_part in error['loc'])}: {error['msg']}"
        for error in errors
    ]
    log_event(
        _error_logger,
        logging.WARNING,
        "validation_exception",
        path=request.url.path,
        method=request.method,
        status_code=422,
        detail=messages,
    )
    return JSONResponse(
        status_code=422,
        content=_error_content(request, 422, "Validation error", messages),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log_event(
        _error_logger,
        logging.ERROR,
        "unhandled_exception",
        path=request.url.path,
        method=request.method,
        error=str(exc),
        traceback=traceback.format_exc()[-2000:],
    )
    return JSONResponse(
        status_code=500,
        content=_error_content(
            request,
            500,
            "An unexpected error occurred. Please try again later.",
        ),
    )


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit():
        if int(content_length) > settings.max_request_size_bytes:
            return JSONResponse(
                status_code=413,
                content=_error_content(request, 413, "Payload too large", "Payload too large"),
            )

    allowed, retry_after = await enforce_rate_limit(request)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content=_error_content(request, 429, "Too many requests", "Too many requests"),
            headers={"Retry-After": str(retry_after)},
        )

    started = time.perf_counter()
    response: Response = await call_next(request)
    elapsed_ms = int((time.perf_counter() - started) * 1000)
    await api_metrics.record(
        path=request.url.path,
        method=request.method,
        status_code=response.status_code,
        latency_ms=elapsed_ms,
    )
    business_metric = _business_metric_name(request, response.status_code)
    if business_metric:
        await api_metrics.record_business_event(business_metric)

    log_event(
        request_logger,
        logging.INFO,
        "request_completed",
        path=request.url.path,
        method=request.method,
        status_code=response.status_code,
        latency_ms=elapsed_ms,
        client_ip=get_client_identifier(request),
        user_agent=request.headers.get("user-agent", ""),
        user_id=getattr(request.state, "user_id", None),
        restaurant_id=getattr(request.state, "restaurant_id", None),
        user_role=getattr(request.state, "user_role", None),
        reservation_id=getattr(request.state, "created_reservation_id", None),
        idempotency_key=getattr(request.state, "idempotency_key", None),
    )

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    if settings.app_env.lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # Structured audit events for sensitive public/auth endpoints.
    if request.url.path.startswith("/api/auth/") or request.url.path == "/api/qr/order":
        log_event(
            logger,
            logging.INFO,
            "security_audit",
            path=request.url.path,
            method=request.method,
            status_code=response.status_code,
            client_ip=get_client_identifier(request),
            user_agent=request.headers.get("user-agent", ""),
            latency_ms=elapsed_ms,
        )

    return response

from app.accounting.router import router as accounting_router  # noqa: E402
from app.auth.router import router as auth_router  # noqa: E402
from app.billing.router import public_router as billing_public_router  # noqa: E402
from app.billing.router import router as billing_router  # noqa: E402
from app.billing.stripe_router import router as stripe_router  # noqa: E402
from app.core.router import router as agents_router  # noqa: E402
from app.dashboard.router import router as dashboard_router  # noqa: E402
from app.digital_twin.router import router as simulation_router  # noqa: E402
from app.email_inbox.router import ingest_router as email_inbox_ingest_router  # noqa: E402
from app.email_inbox.router import router as email_inbox_router  # noqa: E402
from app.food_safety.router import router as safety_router  # noqa: E402
from app.forecasting.router import router as forecasting_router  # noqa: E402
from app.franchise.router import router as franchise_router  # noqa: E402
from app.guests.router import router as guests_router  # noqa: E402
from app.hms.public_router import router as hms_public_router  # noqa: E402
from app.hms.pms.router import router as hms_pms_router  # noqa: E402
from app.hms.router import router as hms_router  # noqa: E402
from app.guest_api.router import router as guest_api_router  # noqa: E402
from app.integrations.mcp_server import mcp_app  # noqa: E402
from app.integrations.router import router as integrations_router  # noqa: E402
from app.inventory.router import router as inventory_router  # noqa: E402
from app.maintenance.router import router as maintenance_router  # noqa: E402
from app.marketing.router import router as marketing_router  # noqa: E402
from app.menu.router import router as menu_router  # noqa: E402
from app.menu_designer.router import router as menu_designer_router  # noqa: E402
from app.qr_ordering.router import admin_router as qr_admin_router  # noqa: E402
from app.qr_ordering.router import router as qr_router  # noqa: E402
from app.reservations.availability_router import router as availability_router  # noqa: E402
from app.reservations.public_router import router as res_public_router  # noqa: E402
from app.reservations.router import router as reservations_router  # noqa: E402
from app.signage.router import public_router as signage_public_router  # noqa: E402
from app.signage.router import router as signage_router  # noqa: E402
from app.vision.router import router as vision_router  # noqa: E402
from app.vouchers.router import router as vouchers_router  # noqa: E402
from app.websockets.router import router as ws_router  # noqa: E402
from app.workforce.router import router as workforce_router  # noqa: E402

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])


@app.get("/mcp/voicebooker", include_in_schema=False)
async def mcp_voicebooker_root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/mcp/voicebooker/", status_code=307)


@app.head("/mcp/voicebooker/", include_in_schema=False)
async def mcp_voicebooker_head_ok() -> Response:
    # The mounted SSE transport is intended for GET/POST traffic. Handling HEAD
    # here keeps health checks and manual probes from traversing the streaming
    # middleware path that Starlette's BaseHTTPMiddleware cannot safely wrap.
    return Response(status_code=200)


app.mount("/mcp/voicebooker", mcp_app)
app.include_router(
    agents_router,
    prefix="/api/agents",
    tags=["Agents"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    accounting_router,
    prefix="/api/accounting",
    tags=["Accounting"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    vision_router,
    prefix="/api/vision",
    tags=["Vision"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    forecasting_router,
    prefix="/api/forecast",
    tags=["Forecasting"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    inventory_router,
    prefix="/api/inventory",
    tags=["Inventory"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    workforce_router,
    prefix="/api/workforce",
    tags=["Workforce"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    guests_router,
    prefix="/api/guests",
    tags=["Guests"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    dashboard_router,
    prefix="/api/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    email_inbox_router,
    prefix="/api/hms/email-inbox",
    tags=["Email Inbox"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    maintenance_router,
    prefix="/api/maintenance",
    tags=["Maintenance"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    simulation_router,
    prefix="/api/simulation",
    tags=["Simulation"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    safety_router,
    prefix="/api/safety",
    tags=["Food Safety"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    franchise_router,
    prefix="/api/franchise",
    tags=["Franchise"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    marketing_router,
    prefix="/api/marketing",
    tags=["Marketing"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    menu_router,
    prefix="/api/menu",
    tags=["Menu"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    availability_router,
    prefix="/api/availability",
    tags=["Availability"],
)
app.include_router(
    reservations_router,
    prefix="/api/reservations",
    tags=["Reservations"],
)
app.include_router(
    billing_router,
    prefix="/api/billing",
    tags=["Billing"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(billing_public_router, prefix="/api/public/billing", tags=["Public Billing"])
app.include_router(qr_router, prefix="/api/qr", tags=["QR Ordering"])
app.include_router(qr_admin_router, prefix="/api/qr/admin", tags=["QR Ordering"])
app.include_router(
    vouchers_router,
    prefix="/api/vouchers",
    tags=["Vouchers"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    menu_designer_router,
    prefix="/api/menu-designer",
    tags=["Menu Designer"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(
    signage_router,
    prefix="/api/signage",
    tags=["Signage"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(signage_public_router, prefix="/api/public/signage", tags=["Public Signage"])
app.include_router(
    hms_router,
    prefix="/api/hms",
    tags=["HMS"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    hms_pms_router,
    prefix="/api/hms/pms",
    tags=["HMS PMS"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(email_inbox_ingest_router, prefix="/api/email-inbox", tags=["Email Inbox"])
app.include_router(stripe_router, prefix="/api/webhooks/stripe", tags=["Webhooks"])
app.include_router(hms_public_router, prefix="/api/public/hotel", tags=["Public Hotel"])
app.include_router(guest_api_router, prefix="/api/guest", tags=["Guest API"])
app.include_router(res_public_router, prefix="/api/public/restaurant", tags=["Public Restaurant"])
app.include_router(ws_router, prefix="/ws")
app.include_router(integrations_router)


async def _database_status(db: AsyncSession) -> tuple[str, int | None]:
    started = time.perf_counter()
    try:
        await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=0.25)
        return "connected", int((time.perf_counter() - started) * 1000)
    except Exception:
        return "error", None


async def _redis_status() -> tuple[str, int | None]:
    started = time.perf_counter()
    try:
        timeout_seconds = max(settings.redis_operation_timeout_ms, 1) / 1000.0
        redis = await asyncio.wait_for(get_redis(), timeout=timeout_seconds)
        await asyncio.wait_for(redis.ping(), timeout=timeout_seconds)
        return "connected", int((time.perf_counter() - started) * 1000)
    except Exception:
        return "error", None


async def _build_dependency_snapshot(
    db: AsyncSession,
    *,
    celery_snapshot: dict | None = None,
    use_cache: bool = False,
) -> dict:
    async def _base_dependency_status() -> dict[str, Any]:
        nonlocal db, use_cache
        global _dependency_status_cache, _dependency_status_cache_expires_at

        now = time.monotonic()
        if (
            use_cache
            and _dependency_status_cache is not None
            and _dependency_status_cache_expires_at > now
        ):
            return dict(_dependency_status_cache)

        async with _dependency_status_cache_lock:
            now = time.monotonic()
            if (
                use_cache
                and _dependency_status_cache is not None
                and _dependency_status_cache_expires_at > now
            ):
                return dict(_dependency_status_cache)

            database_task = asyncio.create_task(_database_status(db))
            redis_task = asyncio.create_task(_redis_status())
            database_result, redis_result = await asyncio.gather(database_task, redis_task)
            database_status, database_latency_ms = database_result
            redis_status, redis_latency_ms = redis_result
            payload = {
                "database": database_status,
                "database_latency_ms": database_latency_ms,
                "redis": redis_status,
                "redis_latency_ms": redis_latency_ms,
            }
            _dependency_status_cache = dict(payload)
            _dependency_status_cache_expires_at = (
                time.monotonic() + max(settings.metrics_snapshot_cache_ttl_seconds, 1)
            )
            return payload

    dependency_payload_task = asyncio.create_task(_base_dependency_status())

    if celery_snapshot is None:
        celery_task = asyncio.create_task(get_celery_monitor_snapshot())
        dependency_payload, celery_snapshot = await asyncio.gather(
            dependency_payload_task,
            celery_task,
        )
    else:
        dependency_payload = await dependency_payload_task

    return {
        "database": dependency_payload["database"],
        "database_latency_ms": dependency_payload["database_latency_ms"],
        "redis": dependency_payload["redis"],
        "redis_latency_ms": dependency_payload["redis_latency_ms"],
        "celery_broker": celery_snapshot["broker_status"],
        "celery_result_backend": celery_snapshot["result_backend_status"],
        "celery": celery_snapshot,
    }


@app.get("/health")
async def health_check_root():
    """Lightweight liveness probe for Replit's health checker (no DB call)."""
    return {"status": "ok", "service": settings.app_name}


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Verifies that the API and its operational dependencies are reachable."""
    dependencies = await _build_dependency_snapshot(db, use_cache=False)

    return {
        "status": "healthy",
        "service": settings.app_name,
        "database": dependencies["database"],
        "redis": dependencies["redis"],
        "celery": dependencies["celery"],
        "websocket": await api_metrics.websocket_snapshot(),
        "version": "v1.0.0_delivery_03092026",
    }


@app.get("/ready")
async def readiness_root(db: AsyncSession = Depends(get_db)):
    return await readiness(db)


@app.get("/api/ready")
async def readiness(db: AsyncSession = Depends(get_db)):
    """Readiness probe for dependency-aware checks."""
    dependencies = await _build_dependency_snapshot(db, use_cache=False)
    status_code = 200
    if (
        dependencies["database"] == "error"
        or dependencies["redis"] == "error"
        or dependencies["celery_broker"] == "error"
    ):
        status_code = 503

    payload = {
        "status": "ready" if status_code == 200 else "not_ready",
        "service": settings.app_name,
        "database": dependencies["database"],
        "redis": dependencies["redis"],
        "celery_broker": dependencies["celery_broker"],
        "celery_result_backend": dependencies["celery_result_backend"],
    }
    return JSONResponse(status_code=status_code, content=payload)


@app.get(
    "/api/metrics",
    tags=["Observability"],
    dependencies=[Depends(require_roles(UserRole.admin))],
)
async def get_metrics(window_minutes: int = 15, db: AsyncSession = Depends(get_db)):
    """Exposes internal API metrics, endpoint analytics, business counters, and queue state."""
    async def _build_payload() -> dict:
        snapshot = await api_metrics.snapshot(window_minutes=window_minutes)
        snapshot["total_requests_all_time"] = api_metrics.total_requests
        snapshot["total_errors_all_time"] = api_metrics.total_errors
        snapshot["top_endpoints"] = await api_metrics.top_endpoints(limit=10)
        snapshot["slowest_endpoints"] = await api_metrics.slowest_endpoints(limit=10)
        snapshot["business_events"] = await api_metrics.business_snapshot()
        snapshot["business_timings"] = await api_metrics.business_timing_snapshot(
            window_minutes=window_minutes
        )
        snapshot["websocket"] = await api_metrics.websocket_snapshot()
        snapshot["celery"] = await get_celery_monitor_snapshot(use_cache=True)
        snapshot["reservation_conflicts"] = await api_metrics.reservation_conflict_insights(
            window_hours=24
        )
        dependencies = await _build_dependency_snapshot(
            db,
            celery_snapshot=snapshot["celery"],
            use_cache=True,
        )
        snapshot["dependencies"] = {
            "database": dependencies["database"],
            "redis": dependencies["redis"],
            "celery_broker": dependencies["celery_broker"],
            "celery_result_backend": dependencies["celery_result_backend"],
        }
        snapshot["thresholds"] = {
            "api_p95_warning_ms": settings.slo_api_p95_ms_threshold,
            "api_p95_critical_ms": settings.slo_api_p95_ms_critical_threshold,
            "error_rate_warning_pct": settings.slo_error_rate_pct_threshold,
            "error_rate_critical_pct": settings.slo_error_rate_pct_critical_threshold,
            "queue_lag_warning": settings.slo_queue_lag_threshold,
            "queue_lag_critical": settings.slo_queue_lag_critical_threshold,
            "websocket_broadcast_failure_warning": settings.websocket_broadcast_failure_threshold,
            "reservation_availability_slow_ms": settings.reservation_availability_slow_ms,
            "reservation_lock_contention_threshold_ms": settings.reservation_lock_contention_threshold_ms,
        }
        snapshot["alerts"] = evaluate_alert_thresholds(snapshot)
        return snapshot

    started = time.perf_counter()
    try:
        snapshot = await asyncio.wait_for(
            _build_payload(),
            timeout=max(settings.metrics_response_timeout_ms, 1) / 1000.0,
        )
    except asyncio.TimeoutError:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log_event(
            startup_logger,
            logging.WARNING,
            "metrics_slow_response",
            elapsed_ms=elapsed_ms,
            partial=True,
        )
        snapshot = await api_metrics.snapshot(window_minutes=window_minutes)
        snapshot["total_requests_all_time"] = api_metrics.total_requests
        snapshot["total_errors_all_time"] = api_metrics.total_errors
        snapshot["top_endpoints"] = []
        snapshot["slowest_endpoints"] = []
        snapshot["business_events"] = await api_metrics.business_snapshot()
        snapshot["business_timings"] = {}
        snapshot["websocket"] = await api_metrics.websocket_snapshot()
        snapshot["celery"] = await get_celery_monitor_snapshot(use_cache=True)
        snapshot["reservation_conflicts"] = {"partial": True}
        snapshot["dependencies"] = {
            "database": "unknown",
            "redis": "unknown",
            "celery_broker": snapshot["celery"].get("broker_status", "unknown"),
            "celery_result_backend": snapshot["celery"].get("result_backend_status", "unknown"),
        }
        snapshot["thresholds"] = {
            "api_p95_warning_ms": settings.slo_api_p95_ms_threshold,
            "api_p95_critical_ms": settings.slo_api_p95_ms_critical_threshold,
            "error_rate_warning_pct": settings.slo_error_rate_pct_threshold,
            "error_rate_critical_pct": settings.slo_error_rate_pct_critical_threshold,
            "queue_lag_warning": settings.slo_queue_lag_threshold,
            "queue_lag_critical": settings.slo_queue_lag_critical_threshold,
            "websocket_broadcast_failure_warning": settings.websocket_broadcast_failure_threshold,
            "reservation_availability_slow_ms": settings.reservation_availability_slow_ms,
            "reservation_lock_contention_threshold_ms": settings.reservation_lock_contention_threshold_ms,
        }
        snapshot["alerts"] = evaluate_alert_thresholds(snapshot)
        return snapshot

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    if elapsed_ms > settings.metrics_response_timeout_ms:
        log_event(
            startup_logger,
            logging.WARNING,
            "metrics_slow_response",
            elapsed_ms=elapsed_ms,
            partial=False,
        )
    return snapshot


@app.get(
    "/internal/reservations/conflict-insights",
    tags=["Observability"],
    dependencies=[Depends(require_roles(UserRole.admin))],
)
async def reservation_conflict_insights(window_hours: int = 24):
    return await api_metrics.reservation_conflict_insights(window_hours=window_hours)


@app.get(
    "/internal/reservations/system-consistency-check",
    tags=["Observability"],
    dependencies=[Depends(require_roles(UserRole.admin))],
)
async def reservation_system_consistency_check(
    window_hours: int = 24,
    db: AsyncSession = Depends(get_db),
):
    return await check_system_consistency(db, window_hours=window_hours)
