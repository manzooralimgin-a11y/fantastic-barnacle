from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.signage import service, schemas

router = APIRouter()
public_router = APIRouter()


# ── Screens ──

@router.get("/screens", response_model=list[schemas.SignageScreenRead])
async def list_screens(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_screens(db, current_user.restaurant_id)


@router.post("/screens", response_model=schemas.SignageScreenRead)
async def create_screen(
    data: schemas.SignageScreenCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_screen(db, current_user.restaurant_id, data.model_dump())


@router.put("/screens/{screen_id}", response_model=schemas.SignageScreenRead)
async def update_screen(
    screen_id: int,
    data: schemas.SignageScreenUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    s = await service.update_screen(db, current_user.restaurant_id, screen_id, data.model_dump(exclude_unset=True))
    if not s:
        raise HTTPException(status_code=404, detail="Screen not found")
    return s


@router.delete("/screens/{screen_id}")
async def delete_screen(
    screen_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    ok = await service.delete_screen(db, current_user.restaurant_id, screen_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Screen not found")
    return {"ok": True}


# ── Content ──

@router.get("/content", response_model=list[schemas.SignageContentRead])
async def list_content(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_content(db, current_user.restaurant_id)


@router.post("/content", response_model=schemas.SignageContentRead)
async def create_content(
    data: schemas.SignageContentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_content(db, current_user.restaurant_id, data.model_dump())


@router.put("/content/{content_id}", response_model=schemas.SignageContentRead)
async def update_content(
    content_id: int,
    data: schemas.SignageContentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    c = await service.update_content(db, current_user.restaurant_id, content_id, data.model_dump(exclude_unset=True))
    if not c:
        raise HTTPException(status_code=404, detail="Content not found")
    return c


@router.delete("/content/{content_id}")
async def delete_content(
    content_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    ok = await service.delete_content(db, current_user.restaurant_id, content_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Content not found")
    return {"ok": True}


# ── Playlists ──

@router.get("/playlists", response_model=list[schemas.SignagePlaylistRead])
async def list_playlists(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_playlists(db, current_user.restaurant_id)


@router.post("/playlists", response_model=schemas.SignagePlaylistRead)
async def create_playlist(
    data: schemas.SignagePlaylistCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_playlist(db, current_user.restaurant_id, data.model_dump())


@router.put("/playlists/{playlist_id}", response_model=schemas.SignagePlaylistRead)
async def update_playlist(
    playlist_id: int,
    data: schemas.SignagePlaylistUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    p = await service.update_playlist(db, current_user.restaurant_id, playlist_id, data.model_dump(exclude_unset=True))
    if not p:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return p


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(
    playlist_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    ok = await service.delete_playlist(db, current_user.restaurant_id, playlist_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return {"ok": True}


# ── Public Display (no auth) ──

@public_router.get("/display/{screen_code}")
async def get_display(screen_code: str, db: AsyncSession = Depends(get_db)):
    """Public endpoint for screen displays."""
    data = await service.get_display_data(db, screen_code)
    if not data:
        raise HTTPException(status_code=404, detail="Screen not found or inactive")
    return data
