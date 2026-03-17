from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Equipment(Base):
    __tablename__ = "equipment"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    install_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_service: Mapped[date | None] = mapped_column(Date, nullable=True)
    health_score: Mapped[float] = mapped_column(Float, default=100, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="operational", nullable=False)


class IoTReading(Base):
    __tablename__ = "iot_readings"

    equipment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("equipment.id"), nullable=False
    )
    sensor_type: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class MaintenanceTicket(Base):
    __tablename__ = "maintenance_tickets"

    equipment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("equipment.id"), nullable=False
    )
    issue: Mapped[str] = mapped_column(String(1000), nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    technician: Mapped[str | None] = mapped_column(String(255), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class EnergyReading(Base):
    __tablename__ = "energy_readings"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    zone: Mapped[str] = mapped_column(String(100), nullable=False)
    reading_kwh: Mapped[float] = mapped_column(Float, nullable=False)
    cost: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
