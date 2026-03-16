from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.database import get_db
from app.dependencies import get_current_tenant_user
from app.vouchers import service, schemas

router = APIRouter()


# ────────────────────── VOUCHERS ──────────────────────

@router.get("", response_model=list[schemas.VoucherRead])
async def list_vouchers(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_vouchers(db, current_user.restaurant_id, active_only)


@router.post("", response_model=schemas.VoucherRead)
async def create_voucher(
    data: schemas.VoucherCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_voucher(db, current_user.restaurant_id, data.model_dump(), background_tasks)


@router.put("/{voucher_id}", response_model=schemas.VoucherRead)
async def update_voucher(
    voucher_id: int,
    data: schemas.VoucherUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    v = await service.update_voucher(db, current_user.restaurant_id, voucher_id, data.model_dump(exclude_unset=True))
    if not v:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return v


@router.delete("/{voucher_id}")
async def delete_voucher(
    voucher_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    ok = await service.delete_voucher(db, current_user.restaurant_id, voucher_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return {"ok": True}


@router.post("/validate", response_model=schemas.VoucherValidateResponse)
async def validate_voucher(
    data: schemas.VoucherValidate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.validate_voucher(db, current_user.restaurant_id, data.code)


@router.post("/redeem", response_model=schemas.VoucherRedemptionRead)
async def redeem_voucher(
    data: schemas.VoucherRedeem,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    redemption = await service.redeem_voucher(db, current_user.restaurant_id, data.code, data.order_id, data.deduction_amount)
    if not redemption:
        raise HTTPException(status_code=400, detail="Voucher is invalid or deduction exceeds balance")
    return redemption


@router.get("/{voucher_id}/redemptions", response_model=list[schemas.VoucherRedemptionRead])
async def list_redemptions(
    voucher_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_redemptions(db, current_user.restaurant_id, voucher_id)


# ────────────────────── CUSTOMER CARDS ──────────────────────

@router.get("/customer-cards", response_model=list[schemas.CustomerCardRead])
async def list_customer_cards(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.get_customer_cards(db, current_user.restaurant_id)


@router.post("/customer-cards", response_model=schemas.CustomerCardRead)
async def create_customer_card(
    data: schemas.CustomerCardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    return await service.create_customer_card(db, current_user.restaurant_id, data.model_dump())


@router.post("/customer-cards/{card_number}/add-points", response_model=schemas.CustomerCardRead)
async def add_points_to_card(
    card_number: str,
    data: schemas.AddPoints,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    cc = await service.add_points(db, current_user.restaurant_id, card_number, data.points)
    if not cc:
        raise HTTPException(status_code=400, detail="Card not found or inactive")
    return cc


@router.post("/customer-cards/{card_number}/redeem-points", response_model=schemas.CustomerCardRead)
async def redeem_points_from_card(
    card_number: str,
    data: schemas.RedeemPoints,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    cc = await service.redeem_points(db, current_user.restaurant_id, card_number, data.points)
    if not cc:
        raise HTTPException(status_code=400, detail="Insufficient points or card inactive")
    return cc


@router.post("/customer-cards/{card_number}/stamp")
async def add_stamp_to_card(
    card_number: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    result = await service.add_stamp(db, current_user.restaurant_id, card_number)
    if result["card"] is None:
        raise HTTPException(status_code=400, detail="Card not found or inactive")
    response = {
        "card": schemas.CustomerCardRead.model_validate(result["card"]),
        "reward_earned": result["reward_earned"],
    }
    if result.get("reward_voucher"):
        response["reward_voucher_code"] = result["reward_voucher"].code
        response["reward_voucher_amount"] = float(result["reward_voucher"].amount_total)
    return response


@router.post("/{voucher_id}/resend-email")
async def resend_voucher_email(
    voucher_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_tenant_user),
):
    v = await service.get_voucher(db, current_user.restaurant_id, voucher_id)
    if not v:
        raise HTTPException(status_code=404, detail="Voucher not found")

    if not v.customer_email:
        raise HTTPException(status_code=400, detail="Voucher has no customer email assigned")

    from app.vouchers import email_service
    background_tasks.add_task(
        email_service.send_voucher_email,
        voucher_id=v.id,
        code=v.code,
        amount=v.amount_total,
        email=v.customer_email,
        name=v.customer_name
    )
    return {"ok": True, "message": f"Resending email to {v.customer_email}"}
