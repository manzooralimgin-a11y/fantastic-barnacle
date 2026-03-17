from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.workforce.schemas import (
    ApplicantCreate,
    ApplicantRead,
    EmployeeCreate,
    EmployeeRead,
    ScheduleCreate,
    ScheduleRead,
)
from app.workforce.service import (
    approve_schedule,
    create_applicant,
    create_employee,
    generate_schedule,
    get_applicants,
    get_employees,
    get_labor_tracker,
    get_schedules,
    get_training_overview,
)

router = APIRouter()


@router.get("/schedule", response_model=list[ScheduleRead])
async def list_schedules(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_schedules(db, current_user.restaurant_id, status)


@router.post("/schedule/generate", response_model=ScheduleRead, status_code=201)
async def gen_schedule(
    payload: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await generate_schedule(db, current_user.restaurant_id, payload)


@router.put("/schedule/{schedule_id}/approve", response_model=ScheduleRead)
async def approve(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await approve_schedule(db, current_user.restaurant_id, schedule_id, current_user.id)


@router.get("/employees", response_model=list[EmployeeRead])
async def list_employees(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_employees(db, current_user.restaurant_id, status, limit)


@router.post("/employees", response_model=EmployeeRead, status_code=201)
async def add_employee(
    payload: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_employee(db, current_user.restaurant_id, payload)


@router.get("/labor-tracker")
async def labor_tracker(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_labor_tracker(db, current_user.restaurant_id)


@router.get("/hiring", response_model=list[ApplicantRead])
async def list_hiring(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_applicants(db, current_user.restaurant_id, status)


@router.post("/hiring", response_model=ApplicantRead, status_code=201)
async def add_applicant(
    payload: ApplicantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_applicant(db, current_user.restaurant_id, payload)


@router.get("/training")
async def training(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_training_overview(db, current_user.restaurant_id)
