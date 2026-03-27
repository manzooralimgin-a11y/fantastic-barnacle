from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.workforce.models import Applicant, Employee, Schedule, Shift, TrainingModule, TrainingProgress
from app.workforce.schemas import ApplicantCreate, EmployeeCreate, ScheduleCreate, ShiftCreate


async def get_employees(
    db: AsyncSession, restaurant_id: int, status_filter: str | None = None, limit: int = 100
) -> list[Employee]:
    query = (
        select(Employee)
        .where(Employee.restaurant_id == restaurant_id)
        .order_by(Employee.name)
        .limit(limit)
    )
    if status_filter:
        query = query.where(Employee.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_employee(db: AsyncSession, restaurant_id: int, payload: EmployeeCreate) -> Employee:
    employee = Employee(restaurant_id=restaurant_id, **payload.model_dump())
    db.add(employee)
    await db.flush()
    await db.refresh(employee)
    return employee


async def get_schedules(
    db: AsyncSession, restaurant_id: int, status_filter: str | None = None
) -> list[Schedule]:
    query = (
        select(Schedule)
        .where(Schedule.restaurant_id == restaurant_id)
        .order_by(Schedule.week_start.desc())
    )
    if status_filter:
        query = query.where(Schedule.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


async def generate_schedule(db: AsyncSession, restaurant_id: int, payload: ScheduleCreate) -> Schedule:
    schedule = Schedule(
        restaurant_id=restaurant_id,
        week_start=payload.week_start,
        status="draft",
        auto_generated=True,
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def approve_schedule(
    db: AsyncSession, restaurant_id: int, schedule_id: int, approver_id: int
) -> Schedule:
    result = await db.execute(
        select(Schedule).where(
            Schedule.id == schedule_id,
            Schedule.restaurant_id == restaurant_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found"
        )
    schedule.status = "approved"
    schedule.approved_by = approver_id
    await db.flush()
    await db.refresh(schedule)
    return schedule


async def get_shifts(
    db: AsyncSession, restaurant_id: int, schedule_id: int | None = None
) -> list[Shift]:
    query = (
        select(Shift)
        .join(Schedule, Schedule.id == Shift.schedule_id)
        .where(Schedule.restaurant_id == restaurant_id)
        .order_by(Shift.date)
    )
    if schedule_id:
        query = query.where(Shift.schedule_id == schedule_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_shift(db: AsyncSession, restaurant_id: int, payload: ShiftCreate) -> Shift:
    schedule_result = await db.execute(
        select(Schedule.id).where(
            Schedule.id == payload.schedule_id,
            Schedule.restaurant_id == restaurant_id,
        )
    )
    if schedule_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    employee_result = await db.execute(
        select(Employee.id).where(
            Employee.id == payload.employee_id,
            Employee.restaurant_id == restaurant_id,
        )
    )
    if employee_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    shift = Shift(**payload.model_dump())
    db.add(shift)
    await db.flush()
    await db.refresh(shift)
    return shift


async def get_labor_tracker(db: AsyncSession, restaurant_id: int) -> dict:
    employee_count = await db.execute(
        select(func.count(Employee.id)).where(
            Employee.restaurant_id == restaurant_id,
            Employee.status == "active",
        )
    )
    shift_count = await db.execute(
        select(func.count(Shift.id))
        .join(Schedule, Schedule.id == Shift.schedule_id)
        .where(Schedule.restaurant_id == restaurant_id)
    )
    total_hours = await db.execute(
        select(func.sum(Schedule.total_hours)).where(Schedule.restaurant_id == restaurant_id)
    )
    total_cost = await db.execute(
        select(func.sum(Schedule.total_cost)).where(Schedule.restaurant_id == restaurant_id)
    )

    return {
        "active_employees": employee_count.scalar() or 0,
        "total_shifts": shift_count.scalar() or 0,
        "total_scheduled_hours": float(total_hours.scalar() or 0),
        "total_labor_cost": float(total_cost.scalar() or 0),
    }


async def get_applicants(
    db: AsyncSession, restaurant_id: int, status_filter: str | None = None
) -> list[Applicant]:
    query = (
        select(Applicant)
        .where(Applicant.restaurant_id == restaurant_id)
        .order_by(Applicant.created_at.desc())
    )
    if status_filter:
        query = query.where(Applicant.status == status_filter)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_applicant(db: AsyncSession, restaurant_id: int, payload: ApplicantCreate) -> Applicant:
    applicant = Applicant(restaurant_id=restaurant_id, **payload.model_dump())
    db.add(applicant)
    await db.flush()
    await db.refresh(applicant)
    return applicant


async def get_training_overview(db: AsyncSession, restaurant_id: int) -> dict:
    modules = (
        await db.execute(
            select(TrainingModule)
            .where(TrainingModule.restaurant_id == restaurant_id)
            .order_by(TrainingModule.title)
        )
    ).scalars().all()
    module_ids = [module.id for module in modules]
    progress_query = select(TrainingProgress)
    if module_ids:
        progress_query = progress_query.where(TrainingProgress.module_id.in_(module_ids))
    else:
        progress_query = progress_query.where(False)
    progress = (await db.execute(progress_query)).scalars().all()

    return {
        "modules": [
            {
                "id": module.id,
                "title": module.title,
                "category": module.category,
                "duration_min": module.duration_min,
                "content_url": module.content_url,
                "required_for_roles": module.required_for_roles,
                "created_at": module.created_at,
                "updated_at": module.updated_at,
            }
            for module in modules
        ],
        "progress": [
            {
                "id": item.id,
                "employee_id": item.employee_id,
                "module_id": item.module_id,
                "status": item.status,
                "score": item.score,
                "completed_at": item.completed_at,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
            for item in progress
        ],
    }
