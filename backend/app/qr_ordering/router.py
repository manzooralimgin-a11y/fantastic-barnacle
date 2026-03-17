from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.qr_ordering import service, schemas

router = APIRouter()


# ── Admin endpoints (auth required) ──

@router.post("/tables/{table_id}/qr-code", response_model=schemas.QRTableCodeRead)
async def create_qr_code(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    return await service.generate_qr_code(db, table_id)


@router.get("/tables/{table_id}/qr-codes", response_model=list[schemas.QRTableCodeRead])
async def list_qr_codes(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    return await service.get_qr_codes_for_table(db, table_id)


# ── Public endpoints (no auth) ──

@router.get("/table/{code}")
async def get_table_info(code: str, db: AsyncSession = Depends(get_db)):
    """Get table info by QR code."""
    info = await service.get_table_by_code(db, code)
    if not info:
        raise HTTPException(status_code=404, detail="Invalid or expired QR code")
    return info


@router.get("/menu")
async def get_general_menu(db: AsyncSession = Depends(get_db)):
    """Get full menu (public, no code required)."""
    menu = await service.get_public_menu(db)
    return {"categories": menu}


@router.get("/menu/{code}")
async def get_menu_for_code(code: str, db: AsyncSession = Depends(get_db)):
    """Get full menu (validates QR code is active)."""
    info = await service.get_table_by_code(db, code)
    if not info:
        raise HTTPException(status_code=404, detail="Invalid or expired QR code")
    menu = await service.get_public_menu(db)
    return {"table": info, "categories": menu}


@router.post("/order", response_model=schemas.QROrderResponse)
async def submit_order(data: schemas.QROrderSubmit, db: AsyncSession = Depends(get_db)):
    """Submit an order from QR code self-ordering."""
    result = await service.submit_qr_order(
        db, data.table_code, data.guest_name,
        [item.model_dump() for item in data.items], data.notes
    )
    if not result:
        raise HTTPException(status_code=400, detail="Invalid QR code or table")
    return result


@router.get("/order/{order_id}/status", response_model=schemas.QROrderStatus)
async def get_order_status(order_id: int, db: AsyncSession = Depends(get_db)):
    """Poll order status."""
    status = await service.get_order_status(db, order_id)
    if not status:
        raise HTTPException(status_code=404, detail="Order not found")
    return status
