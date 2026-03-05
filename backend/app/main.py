from contextlib import asynccontextmanager
import json
import logging
import sys
import time

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s", "name":"%(name)s", "level":"%(levelname)s", "message":"%(message)s"}',
    stream=sys.stdout
)

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from app.auth.models import UserRole
from app.config import settings
from app.dependencies import get_current_tenant_user, require_roles
from app.security.rate_limit import enforce_rate_limit, get_client_identifier
from app.observability.metrics import api_metrics, get_queue_lag
from app.database import get_db, AsyncSession

logger = logging.getLogger("app.security")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


app = FastAPI(
    title=settings.app_name,
    description="AI-Powered Restaurant Management System",
    version="0.1.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS — use cors_origins_list property for comma-separated env var support
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit():
        if int(content_length) > settings.max_request_size_bytes:
            return JSONResponse(status_code=413, content={"detail": "Payload too large"})

    allowed, retry_after = await enforce_rate_limit(request)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests"},
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

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    if settings.app_env.lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    # Structured audit events for sensitive public/auth endpoints.
    if request.url.path.startswith("/api/auth/") or request.url.path == "/api/qr/order":
        logger.info(
            json.dumps(
                {
                    "event": "security_audit",
                    "path": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code,
                    "client_ip": get_client_identifier(request),
                    "user_agent": request.headers.get("user-agent", ""),
                    "latency_ms": elapsed_ms,
                }
            )
        )

    return response

# --- Register routers ---
from app.auth.router import router as auth_router  # noqa: E402
from app.core.router import router as agents_router  # noqa: E402
from app.accounting.router import router as accounting_router  # noqa: E402
from app.vision.router import router as vision_router  # noqa: E402
from app.forecasting.router import router as forecasting_router  # noqa: E402
from app.inventory.router import router as inventory_router  # noqa: E402
from app.workforce.router import router as workforce_router  # noqa: E402
from app.guests.router import router as guests_router  # noqa: E402
from app.dashboard.router import router as dashboard_router  # noqa: E402
from app.maintenance.router import router as maintenance_router  # noqa: E402
from app.digital_twin.router import router as simulation_router  # noqa: E402
from app.food_safety.router import router as safety_router  # noqa: E402
from app.franchise.router import router as franchise_router  # noqa: E402
from app.marketing.router import router as marketing_router  # noqa: E402
from app.menu.router import router as menu_router  # noqa: E402
from app.reservations.router import router as reservations_router  # noqa: E402
from app.billing.router import public_router as billing_public_router  # noqa: E402
from app.billing.router import router as billing_router  # noqa: E402
from app.qr_ordering.router import router as qr_router  # noqa: E402
from app.vouchers.router import router as vouchers_router  # noqa: E402
from app.menu_designer.router import router as menu_designer_router  # noqa: E402
from app.signage.router import router as signage_router  # noqa: E402

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
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
    reservations_router,
    prefix="/api/reservations",
    tags=["Reservations"],
    dependencies=[Depends(get_current_tenant_user)],
)
app.include_router(
    billing_router,
    prefix="/api/billing",
    tags=["Billing"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
)
app.include_router(billing_public_router, prefix="/api/billing", tags=["Billing"])
app.include_router(qr_router, prefix="/api/qr", tags=["QR Ordering"])
app.include_router(
    vouchers_router,
    prefix="/api/vouchers",
    tags=["Vouchers"],
    dependencies=[Depends(require_roles(UserRole.admin, UserRole.manager))],
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


@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    """Verifies that the API and the database are both reachable."""
    try:
        from sqlalchemy import text
        await db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"
    
    return {
        "status": "healthy" if db_status == "connected" else "unhealthy",
        "service": settings.app_name,
        "database": db_status
    }


@app.get("/api/metrics", tags=["Observability"])
async def get_metrics(window_minutes: int = 15):
    """Exposes internal API metrics and background queue lag."""
    snapshot = await api_metrics.snapshot(window_minutes=window_minutes)
    lag = await get_queue_lag()
    snapshot["celery_queue_lag"] = lag
    return snapshot
