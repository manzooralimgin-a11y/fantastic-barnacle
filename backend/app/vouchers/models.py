from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Voucher(Base):
    __tablename__ = "vouchers"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    amount_total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    amount_remaining: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", nullable=False) # active, used, expired
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class VoucherRedemption(Base):
    __tablename__ = "voucher_redemptions"

    voucher_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False
    )
    order_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("table_orders.id", ondelete="SET NULL"), nullable=True
    )
    discount_applied: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    redeemed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CustomerCard(Base):
    __tablename__ = "customer_cards"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    guest_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True
    )
    card_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    card_type: Mapped[str] = mapped_column(String(50), nullable=False)  # points, stamps, tier
    points_balance: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tier: Mapped[str | None] = mapped_column(String(50), nullable=True)  # bronze, silver, gold, platinum
    stamps_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    stamps_target: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    total_spent: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    holder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
