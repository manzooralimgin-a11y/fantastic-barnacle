from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GuestProfile(Base):
    __tablename__ = "guest_profiles"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    salutation: Mapped[str | None] = mapped_column(String(20), nullable=True)
    birthday: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    country_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    custom_fields_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    dietary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    flavor_profile_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    clv: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    churn_risk_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    visit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_visit: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Order(Base):
    __tablename__ = "orders"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    guest_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    order_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    channel: Mapped[str] = mapped_column(String(50), default="dine_in", nullable=False)
    total: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    items_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    tip: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)


class LoyaltyAccount(Base):
    __tablename__ = "loyalty_accounts"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    guest_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("guest_profiles.id"), unique=True, nullable=False
    )
    tier: Mapped[str] = mapped_column(String(20), default="bronze", nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rewards_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Promotion(Base):
    __tablename__ = "promotions"

    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True
    )
    guest_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    offer: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="sent", nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    redeemed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
