from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.menu_designer import service, schemas

router = APIRouter()


# ── Templates ──

@router.get("/templates", response_model=list[schemas.MenuTemplateRead])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_templates(db, current_user.restaurant_id)


@router.post("/templates", response_model=schemas.MenuTemplateRead)
async def create_template(
    data: schemas.MenuTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_template(db, current_user.restaurant_id, data.model_dump())


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    ok = await service.delete_template(db, current_user.restaurant_id, template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found or is system template")
    return {"ok": True}


# ── Designs ──

@router.get("/designs", response_model=list[schemas.MenuDesignRead])
async def list_designs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_designs(db, current_user.restaurant_id)


@router.post("/designs", response_model=schemas.MenuDesignRead)
async def create_design(
    data: schemas.MenuDesignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_design(db, current_user.restaurant_id, data.model_dump())


@router.put("/designs/{design_id}", response_model=schemas.MenuDesignRead)
async def update_design(
    design_id: int,
    data: schemas.MenuDesignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    d = await service.update_design(db, current_user.restaurant_id, design_id, data.model_dump(exclude_unset=True))
    if not d:
        raise HTTPException(status_code=404, detail="Design not found")
    return d


@router.get("/designs/{design_id}/preview")
async def preview_design(
    design_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    preview = await service.get_design_preview(db, current_user.restaurant_id, design_id)
    if not preview:
        raise HTTPException(status_code=404, detail="Design not found")
    return preview


@router.post("/designs/{design_id}/publish", response_model=schemas.PublishResponse)
async def publish_design(
    design_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    d = await service.publish_design(db, current_user.restaurant_id, design_id)
    if not d:
        raise HTTPException(status_code=404, detail="Design not found")
    return {"id": d.id, "status": d.status, "message": "Menu published successfully"}


@router.delete("/designs/{design_id}")
async def delete_design(
    design_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    ok = await service.delete_design(db, current_user.restaurant_id, design_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Design not found")
    return {"ok": True}
