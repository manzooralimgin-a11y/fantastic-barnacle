from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.vision.schemas import (
    ComplianceEventRead,
    VisionAlertCreate,
    VisionAlertRead,
    WasteLogCreate,
    WasteLogRead,
)
from app.vision.service import (
    create_alert,
    get_alerts,
    get_compliance_events,
    get_vision_stats,
    get_waste_logs,
    log_waste,
)

router = APIRouter()


@router.get("/alerts", response_model=list[VisionAlertRead])
async def list_alerts(
    resolved: bool | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_alerts(db, current_user.restaurant_id, resolved, limit)


@router.get("/waste", response_model=list[WasteLogRead])
async def list_waste(
    category: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_waste_logs(db, current_user.restaurant_id, category, limit)


@router.get("/compliance", response_model=list[ComplianceEventRead])
async def list_compliance(
    event_type: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_compliance_events(db, current_user.restaurant_id, event_type, limit)


@router.post("/analyze", response_model=VisionAlertRead, status_code=201)
async def analyze_image(
    payload: VisionAlertCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_alert(db, current_user.restaurant_id, payload)


@router.post("/waste", response_model=WasteLogRead, status_code=201)
async def add_waste_log(
    payload: WasteLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await log_waste(db, current_user.restaurant_id, payload)


@router.get("/stats")
async def vision_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_vision_stats(db, current_user.restaurant_id)
