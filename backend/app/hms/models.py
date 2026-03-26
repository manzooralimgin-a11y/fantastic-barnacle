from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class HotelProperty(Base):
    __tablename__ = "hms_properties"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="EUR", nullable=False)
    settings_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    rooms: Mapped[list["Room"]] = relationship(back_populates="property", cascade="all, delete-orphan")

class RoomType(Base):
    __tablename__ = "hms_room_types"

    property_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_occupancy: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_occupancy: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    base_price: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

class Room(Base):
    __tablename__ = "hms_rooms"

    property_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)
    room_number: Mapped[str] = mapped_column(String(20), nullable=False)
    room_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_room_types.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="available", nullable=False)  # available, occupied, cleaning, maintenance
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)

    property: Mapped["HotelProperty"] = relationship(back_populates="rooms")

class HotelReservation(Base):
    __tablename__ = "hms_reservations"
    __table_args__ = (
        Index("ix_hms_reservations_booking_id", "booking_id", unique=True),
    )

    property_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)
    guest_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True)
    guest_name: Mapped[str] = mapped_column(String(255), nullable=False)
    guest_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guest_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    check_in: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_out: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="confirmed", nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="EUR", nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    room_type_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("hms_room_types.id", ondelete="SET NULL"), nullable=True
    )
    payment_status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    booking_id: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    anrede: Mapped[str | None] = mapped_column(String(20), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    room: Mapped[str | None] = mapped_column(String(20), nullable=True)
    room_type_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adults: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    children: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    zahlungs_methode: Mapped[str | None] = mapped_column(String(50), nullable=True)
    zahlungs_status: Mapped[str] = mapped_column(String(50), default="offen", nullable=True)
    special_requests: Mapped[str | None] = mapped_column(String(500), nullable=True)
