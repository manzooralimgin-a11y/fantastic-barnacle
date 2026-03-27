from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.qr_ordering import service as qr_service, schemas as qr_schemas

router = APIRouter()


# ── Public aliases for menu / table / order ──────────────────────────

@router.get("/menu")
async def public_restaurant_menu(
    restaurant_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
):
    """Get full restaurant menu (public)."""
    menu = await qr_service.get_public_menu(db, restaurant_id=restaurant_id)
    return {"categories": menu}


@router.get("/table/{code}")
async def public_table_info(
    code: str = Path(min_length=3, max_length=128),
    db: AsyncSession = Depends(get_db),
):
    """Get table info by QR code."""
    info = await qr_service.get_table_by_code(db, code)
    if not info:
        raise HTTPException(status_code=404, detail="Invalid or expired QR code")
    return info


@router.post("/order", response_model=qr_schemas.QROrderResponse)
async def public_submit_order(
    data: qr_schemas.QROrderSubmit, db: AsyncSession = Depends(get_db)
):
    """Submit an order from the restaurant app."""
    result = await qr_service.submit_qr_order(
        db, data.table_code, data.guest_name,
        [item.model_dump() for item in data.items], data.notes
    )
    if not result:
        raise HTTPException(status_code=400, detail="Invalid QR code or table")
    return result
