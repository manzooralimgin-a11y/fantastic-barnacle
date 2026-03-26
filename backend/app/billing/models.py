from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TableOrder(Base):
    __tablename__ = "table_orders"
    __table_args__ = (
        Index("ix_table_orders_created_at", "created_at"),
    )

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    session_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("table_sessions.id", ondelete="SET NULL"), nullable=True
    )
    table_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    server_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False, index=True)
    order_type: Mapped[str] = mapped_column(String(20), default="dine_in", nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    discount_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tip_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    guest_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class OrderItem(Base):
    __tablename__ = "order_items"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("table_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    menu_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=False
    )
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    modifiers_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sent_to_kitchen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    served_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # KDS fields (Phase 2)
    station: Mapped[str | None] = mapped_column(String(50), nullable=True)
    course_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class Bill(Base):
    __tablename__ = "bills"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "bill_number", name="uq_bills_restaurant_id_bill_number"),
    )

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    order_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("table_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bill_number: Mapped[str] = mapped_column(String(50), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 3), default=0.10, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    service_charge: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    tip_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    split_type: Mapped[str] = mapped_column(String(20), default="none", nullable=False)
    split_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Digital receipt fields (F8)
    tip_suggestions_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    receipt_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    receipt_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    receipt_token: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True)


class Payment(Base):
    __tablename__ = "payments"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    bill_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tip_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Payment processing fields (F5)
    processing_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    gateway_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    card_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    card_brand: Mapped[str | None] = mapped_column(String(30), nullable=True)
    wallet_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    refund_of_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True
    )


class CashShift(Base):
    __tablename__ = "cash_shifts"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    opened_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=False
    )
    closed_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )
    opening_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    closing_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    expected_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    variance: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)


class KDSStationConfig(Base):
    __tablename__ = "kds_station_configs"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "name", name="uq_kds_station_configs_restaurant_id_name"),
    )

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6", nullable=False)
    category_ids_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    alert_sound: Mapped[str | None] = mapped_column(String(100), nullable=True)
