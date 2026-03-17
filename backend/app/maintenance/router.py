from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.maintenance.schemas import (
    EnergyReadingRead,
    EquipmentCreate,
    EquipmentRead,
    MaintenanceTicketCreate,
    MaintenanceTicketRead,
)
from app.maintenance.service import (
    create_equipment,
    create_ticket,
    get_energy_savings,
    get_energy_usage,
    get_equipment_by_id,
    get_equipment_list,
    get_failure_predictions,
    get_tickets,
)

router = APIRouter()


@router.get("/equipment", response_model=list[EquipmentRead])
async def list_equipment(
    status: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_equipment_list(db, current_user.restaurant_id, status, limit)


@router.get("/equipment/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_equipment_by_id(db, current_user.restaurant_id, equipment_id)


@router.post("/equipment", response_model=EquipmentRead, status_code=201)
async def add_equipment(
    payload: EquipmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_equipment(db, current_user.restaurant_id, payload)


@router.get("/tickets", response_model=list[MaintenanceTicketRead])
async def list_tickets(
    status: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_tickets(db, current_user.restaurant_id, status, limit)


@router.post("/tickets", response_model=MaintenanceTicketRead, status_code=201)
async def add_ticket(
    payload: MaintenanceTicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await create_ticket(db, current_user.restaurant_id, payload)


@router.get("/predictions", response_model=list[dict[str, Any]])
async def failure_predictions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_failure_predictions(db, current_user.restaurant_id)


@router.get("/energy/usage", response_model=list[EnergyReadingRead])
async def energy_usage(
    zone: str | None = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_energy_usage(db, current_user.restaurant_id, zone, limit)


@router.get("/energy/savings", response_model=dict[str, Any])
async def energy_savings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await get_energy_savings(db, current_user.restaurant_id)
