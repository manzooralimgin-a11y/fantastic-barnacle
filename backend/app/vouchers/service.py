import secrets
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import BackgroundTasks
from app.vouchers.models import Voucher, VoucherRedemption, CustomerCard
from app.vouchers.qr_service import generate_qr_base64
from app.vouchers import email_service

# ────────────────────── VOUCHERS ──────────────────────

async def get_vouchers(db: AsyncSession, restaurant_id: int, active_only: bool = False) -> list[Voucher]:
    q = select(Voucher).where(
        Voucher.restaurant_id == restaurant_id,
        Voucher.is_gift_card.is_(False),
    ).order_by(Voucher.created_at.desc())
    if active_only:
        q = q.where(Voucher.status == "active")
    result = await db.execute(q)
    vouchers = list(result.scalars().all())
    for v in vouchers:
        v.qr_code_base64 = generate_qr_base64(v.code)
    return vouchers


async def get_voucher(db: AsyncSession, restaurant_id: int, voucher_id: int) -> Voucher | None:
    result = await db.execute(
        select(Voucher).where(Voucher.id == voucher_id, Voucher.restaurant_id == restaurant_id)
    )
    return result.scalar_one_or_none()


async def create_voucher(db: AsyncSession, restaurant_id: int, data: dict, background_tasks: BackgroundTasks) -> Voucher:
    code = f"GV-{secrets.token_hex(4).upper()}"
    data["amount_remaining"] = data["amount_total"]

    v = Voucher(code=code, restaurant_id=restaurant_id, **data)
    db.add(v)
    await db.flush()
    await db.refresh(v)
    v.qr_code_base64 = generate_qr_base64(v.code)

    if v.customer_email:
        background_tasks.add_task(
            email_service.send_voucher_email,
            voucher_id=v.id,
            code=v.code,
            amount=v.amount_total,
            email=v.customer_email,
            name=v.customer_name
        )

    return v


async def update_voucher(db: AsyncSession, restaurant_id: int, voucher_id: int, data: dict) -> Voucher | None:
    v = await get_voucher(db, restaurant_id, voucher_id)
    if not v:
        return None
    for k, val in data.items():
        if val is not None:
            setattr(v, k, val)
    await db.flush()
    await db.refresh(v)
    return v


async def delete_voucher(db: AsyncSession, restaurant_id: int, voucher_id: int) -> bool:
    v = await get_voucher(db, restaurant_id, voucher_id)
    if not v:
        return False
    await db.delete(v)
    await db.flush()
    return True


async def validate_voucher(db: AsyncSession, restaurant_id: int, code: str):
    """Validate a voucher code against POS system rules."""
    result = await db.execute(
        select(Voucher).where(Voucher.code == code, Voucher.restaurant_id == restaurant_id)
    )
    v = result.scalar_one_or_none()

    if not v:
        return {"valid": False, "message": "Voucher not found", "voucher": None}

    if v.status != "active":
        return {"valid": False, "message": f"Voucher is marked as {v.status}", "voucher": v}

    if v.amount_remaining <= 0:
        return {"valid": False, "message": "Voucher balance is completely depleted", "voucher": v}

    if v.expiry_date:
        now = datetime.now(timezone.utc)
        if now > v.expiry_date:
            return {"valid": False, "message": "Voucher has expired", "voucher": v}

    v.qr_code_base64 = generate_qr_base64(v.code)
    return {"valid": True, "message": "Voucher is valid", "voucher": v}


async def redeem_voucher(db: AsyncSession, restaurant_id: int, code: str, order_id: int | None, deduction_amount: float):
    """Redeem a voucher securely using atomic UPDATE to prevent double-spend."""
    # Atomic UPDATE: deducts amount only if sufficient balance exists
    # This prevents race conditions where two concurrent requests both pass a balance check
    result = await db.execute(
        update(Voucher)
        .where(
            Voucher.code == code,
            Voucher.restaurant_id == restaurant_id,
            Voucher.status == "active",
            Voucher.amount_remaining >= deduction_amount,
        )
        .values(
            amount_remaining=Voucher.amount_remaining - deduction_amount,
        )
        .returning(Voucher.id, Voucher.amount_remaining)
    )
    row = result.first()
    if not row:
        return None

    voucher_id, new_balance = row

    # Mark as used if balance is now zero
    if new_balance <= 0:
        await db.execute(
            update(Voucher).where(Voucher.id == voucher_id).values(status="used")
        )

    redemption = VoucherRedemption(
        voucher_id=voucher_id,
        order_id=order_id,
        discount_applied=deduction_amount,
        redeemed_at=datetime.now(timezone.utc),
    )
    db.add(redemption)

    await db.flush()
    await db.refresh(redemption)
    return redemption


async def get_redemptions(db: AsyncSession, restaurant_id: int, voucher_id: int) -> list[VoucherRedemption]:
    # Verify voucher belongs to restaurant before returning redemptions
    v = await get_voucher(db, restaurant_id, voucher_id)
    if not v:
        return []
    result = await db.execute(
        select(VoucherRedemption).where(VoucherRedemption.voucher_id == voucher_id).order_by(VoucherRedemption.redeemed_at.desc())
    )
    return list(result.scalars().all())


# ────────────────────── CUSTOMER CARDS ──────────────────────

async def get_customer_cards(db: AsyncSession, restaurant_id: int) -> list[CustomerCard]:
    result = await db.execute(
        select(CustomerCard)
        .where(CustomerCard.restaurant_id == restaurant_id)
        .order_by(CustomerCard.created_at.desc())
    )
    return list(result.scalars().all())


async def create_customer_card(db: AsyncSession, restaurant_id: int, data: dict) -> CustomerCard:
    card_number = f"CC-{secrets.token_hex(6).upper()}"
    cc = CustomerCard(card_number=card_number, restaurant_id=restaurant_id, **data)
    db.add(cc)
    await db.flush()
    await db.refresh(cc)
    return cc


async def get_card_by_number(db: AsyncSession, restaurant_id: int, card_number: str) -> CustomerCard | None:
    result = await db.execute(
        select(CustomerCard).where(
            CustomerCard.card_number == card_number,
            CustomerCard.restaurant_id == restaurant_id,
        )
    )
    return result.scalar_one_or_none()


async def add_points(db: AsyncSession, restaurant_id: int, card_number: str, points: int) -> CustomerCard | None:
    cc = await get_card_by_number(db, restaurant_id, card_number)
    if not cc or not cc.is_active:
        return None
    cc.points_balance += points
    # Auto-tier upgrade
    if cc.card_type == "points":
        if cc.points_balance >= 5000:
            cc.tier = "platinum"
        elif cc.points_balance >= 2000:
            cc.tier = "gold"
        elif cc.points_balance >= 500:
            cc.tier = "silver"
        else:
            cc.tier = "bronze"
    await db.flush()
    await db.refresh(cc)
    return cc


async def redeem_points(db: AsyncSession, restaurant_id: int, card_number: str, points: int) -> CustomerCard | None:
    cc = await get_card_by_number(db, restaurant_id, card_number)
    if not cc or not cc.is_active:
        return None
    if cc.points_balance < points:
        return None
    cc.points_balance -= points
    await db.flush()
    await db.refresh(cc)
    return cc


async def add_stamp(db: AsyncSession, restaurant_id: int, card_number: str) -> dict:
    """Add a stamp to a customer card. Returns card + reward info if target reached."""
    cc = await get_card_by_number(db, restaurant_id, card_number)
    if not cc or not cc.is_active:
        return {"card": None, "reward_earned": False, "reward_voucher": None}
    cc.stamps_count += 1
    reward_earned = False
    reward_voucher = None
    if cc.stamps_count >= cc.stamps_target:
        cc.stamps_count = 0  # Reset after completing card
        reward_earned = True
        # Generate a reward voucher for the completed stamps card
        reward_code = f"REWARD-{secrets.token_hex(4).upper()}"
        reward_voucher = Voucher(
            restaurant_id=restaurant_id,
            code=reward_code,
            amount_total=10.00,  # Default reward amount
            amount_remaining=10.00,
            customer_name=cc.holder_name,
            status="active",
            notes=f"Stamps card reward for completing {cc.stamps_target} stamps (card {cc.card_number})",
        )
        db.add(reward_voucher)
    await db.flush()
    await db.refresh(cc)
    if reward_voucher:
        await db.refresh(reward_voucher)
    return {"card": cc, "reward_earned": reward_earned, "reward_voucher": reward_voucher}
