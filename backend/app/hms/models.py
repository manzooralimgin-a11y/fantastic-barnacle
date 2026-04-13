from datetime import date, datetime, timezone
from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, JSON, Numeric, String, UniqueConstraint
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
    user_property_roles: Mapped[list["HotelUserPropertyRole"]] = relationship(
        "HotelUserPropertyRole",
        back_populates="property",
        cascade="all, delete-orphan",
    )

class RoomType(Base):
    __tablename__ = "hms_room_types"

    property_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_occupancy: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    max_occupancy: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    base_price: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)


class HotelRateSeason(Base):
    __tablename__ = "hms_rate_seasons"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    color_hex: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HotelRatePlan(Base):
    __tablename__ = "hms_rate_plans"
    __table_args__ = (
        UniqueConstraint("property_id", "code", name="uq_hms_rate_plans_property_code"),
    )

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_type_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_room_types.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="EUR", nullable=False)
    base_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class HotelRatePlanPrice(Base):
    __tablename__ = "hms_rate_plan_prices"
    __table_args__ = (
        UniqueConstraint("rate_plan_id", "rate_date", name="uq_hms_rate_plan_prices_plan_date"),
    )

    rate_plan_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rate_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rate_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    season_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_rate_seasons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)


class HotelRateRestriction(Base):
    __tablename__ = "hms_rate_restrictions"
    __table_args__ = (
        UniqueConstraint("rate_plan_id", "restriction_date", name="uq_hms_rate_restrictions_plan_date"),
    )

    rate_plan_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rate_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    restriction_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    closed_to_arrival: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    closed_to_departure: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    min_stay: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_stay: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

class Room(Base):
    __tablename__ = "hms_rooms"

    property_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_properties.id", ondelete="CASCADE"), nullable=False)
    room_number: Mapped[str] = mapped_column(String(20), nullable=False)
    room_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("hms_room_types.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="available", nullable=False)  # available, occupied, cleaning, maintenance
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True)

    property: Mapped["HotelProperty"] = relationship(back_populates="rooms")
    status_history: Mapped[list["RoomStatusHistory"]] = relationship(
        "RoomStatusHistory",
        back_populates="room",
        cascade="all, delete-orphan",
    )
    housekeeping_tasks: Mapped[list["HousekeepingTask"]] = relationship(
        "HousekeepingTask",
        back_populates="room",
        cascade="all, delete-orphan",
    )
    daily_notes: Mapped[list["RoomDailyNote"]] = relationship(
        "RoomDailyNote",
        back_populates="room",
        cascade="all, delete-orphan",
    )
    blockings: Mapped[list["RoomBlocking"]] = relationship(
        "RoomBlocking",
        back_populates="room",
        cascade="all, delete-orphan",
    )


class RoomStatusHistory(Base):
    __tablename__ = "hms_room_status_history"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    changed_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    task_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_housekeeping_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )

    room: Mapped["Room"] = relationship("Room", back_populates="status_history")


class HousekeepingTask(Base):
    __tablename__ = "hms_housekeeping_tasks"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    task_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="normal", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    assigned_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_to_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    task_source: Mapped[str] = mapped_column(String(30), default="staff", nullable=False, index=True)
    guest_booking_ref: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)

    room: Mapped["Room"] = relationship("Room", back_populates="housekeeping_tasks")


class RoomDailyNote(Base):
    __tablename__ = "hms_room_daily_notes"
    __table_args__ = (
        UniqueConstraint("property_id", "room_id", "note_date", name="uq_hms_room_daily_notes_room_date"),
    )

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    note_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    housekeeping_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    maintenance_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    maintenance_required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    room: Mapped["Room"] = relationship("Room", back_populates="daily_notes")

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
    # --- Phase 2: accounting decoupling & UX fields ---
    billing_guest_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("guest_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    booking_source: Mapped[str | None] = mapped_column(String(80), nullable=True)  # Walk-In, Phone, Booking.com, …
    color_tag: Mapped[str | None] = mapped_column(String(20), nullable=True)        # hex color e.g. #3B82F6
    stay: Mapped["HotelStay | None"] = relationship(
        "HotelStay",
        back_populates="reservation",
        uselist=False,
        cascade="all, delete-orphan",
    )
    folio: Mapped["HotelFolio | None"] = relationship(
        "HotelFolio",
        back_populates="reservation",
        uselist=False,
    )
    documents: Mapped[list["HotelDocument"]] = relationship(
        "HotelDocument",
        back_populates="reservation",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list["HotelInvoice"]] = relationship(
        "HotelInvoice",
        back_populates="reservation",
        cascade="all, delete-orphan",
    )
    message_threads: Mapped[list["HotelMessageThread"]] = relationship(
        "HotelMessageThread",
        back_populates="reservation",
        cascade="all, delete-orphan",
    )


class HotelStay(Base):
    __tablename__ = "hms_stays"
    __table_args__ = (
        UniqueConstraint("reservation_id", name="uq_hms_stays_reservation_id"),
    )

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reservation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_reservations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_rooms.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), default="booked", nullable=False, index=True)
    planned_check_in: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    planned_check_out: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    actual_check_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_check_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    reservation: Mapped["HotelReservation"] = relationship("HotelReservation", back_populates="stay")
    folio: Mapped["HotelFolio | None"] = relationship(
        "HotelFolio",
        back_populates="stay",
        uselist=False,
        cascade="all, delete-orphan",
    )
    assignments: Mapped[list["StayAssignment"]] = relationship(
        "StayAssignment",
        back_populates="stay",
        cascade="all, delete-orphan",
    )
    occupants: Mapped[list["StayOccupant"]] = relationship(
        "StayOccupant",
        back_populates="stay",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list["HotelDocument"]] = relationship(
        "HotelDocument",
        back_populates="stay",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list["HotelInvoice"]] = relationship(
        "HotelInvoice",
        back_populates="stay",
        cascade="all, delete-orphan",
    )


class RoomBlocking(Base):
    __tablename__ = "hms_room_blockings"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    blocked_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    released_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    room: Mapped["Room"] = relationship("Room", back_populates="blockings")


class StayAssignment(Base):
    __tablename__ = "hms_stay_assignments"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stay_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_stays.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assignment_type: Mapped[str] = mapped_column(String(30), default="move", nullable=False, index=True)
    assigned_from: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    assigned_to: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    changed_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    stay: Mapped["HotelStay"] = relationship("HotelStay", back_populates="assignments")


class StayOccupant(Base):
    """Maps physical guest occupants to a stay, independent of the invoice payer."""
    __tablename__ = "hms_stay_occupants"
    __table_args__ = (
        UniqueConstraint("stay_id", "guest_profile_id", name="uq_hms_stay_occupants_stay_guest"),
    )

    stay_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_stays.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    guest_profile_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("guest_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    stay: Mapped["HotelStay"] = relationship("HotelStay", back_populates="occupants")


class HotelFolio(Base):
    __tablename__ = "hms_folios"
    __table_args__ = (
        UniqueConstraint("property_id", "folio_number", name="uq_hms_folios_property_id_folio_number"),
        UniqueConstraint("stay_id", name="uq_hms_folios_stay_id"),
        UniqueConstraint("reservation_id", name="uq_hms_folios_reservation_id"),
    )

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stay_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_stays.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reservation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_reservations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    folio_number: Mapped[str] = mapped_column(String(50), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="EUR", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False, index=True)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    total: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    balance_due: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    stay: Mapped["HotelStay"] = relationship("HotelStay", back_populates="folio")
    reservation: Mapped["HotelReservation"] = relationship("HotelReservation", back_populates="folio")
    lines: Mapped[list["HotelFolioLine"]] = relationship(
        "HotelFolioLine",
        back_populates="folio",
        cascade="all, delete-orphan",
    )
    payments: Mapped[list["HotelFolioPayment"]] = relationship(
        "HotelFolioPayment",
        back_populates="folio",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list["HotelDocument"]] = relationship(
        "HotelDocument",
        back_populates="folio",
        cascade="all, delete-orphan",
    )
    invoices: Mapped[list["HotelInvoice"]] = relationship(
        "HotelInvoice",
        back_populates="folio",
        cascade="all, delete-orphan",
    )


class DocumentBlueprint(Base):
    __tablename__ = "document_blueprints"

    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    document_kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_title_template: Mapped[str] = mapped_column(String(255), nullable=False)
    default_subject_template: Mapped[str | None] = mapped_column(String(255), nullable=True)
    default_body_template: Mapped[str] = mapped_column(String(5000), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    templates: Mapped[list["DocumentTemplate"]] = relationship(
        "DocumentTemplate",
        back_populates="blueprint",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list["HotelDocument"]] = relationship(
        "HotelDocument",
        back_populates="blueprint",
    )


class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    property_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    blueprint_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("document_blueprints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="de", nullable=False)
    subject_template: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title_template: Mapped[str] = mapped_column(String(255), nullable=False)
    body_template: Mapped[str] = mapped_column(String(5000), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    blueprint: Mapped["DocumentBlueprint"] = relationship("DocumentBlueprint", back_populates="templates")
    documents: Mapped[list["HotelDocument"]] = relationship(
        "HotelDocument",
        back_populates="template",
    )


class HotelDocument(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("property_id", "document_number", name="uq_documents_property_id_document_number"),
    )

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reservation_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_reservations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    stay_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_stays.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    folio_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_folios.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    blueprint_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("document_blueprints.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    template_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("document_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    document_kind: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    document_number: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="generated", nullable=False, index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body_text: Mapped[str] = mapped_column(String(12000), nullable=False)
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    reservation: Mapped["HotelReservation | None"] = relationship("HotelReservation", back_populates="documents")
    stay: Mapped["HotelStay | None"] = relationship("HotelStay", back_populates="documents")
    folio: Mapped["HotelFolio | None"] = relationship("HotelFolio", back_populates="documents")
    blueprint: Mapped["DocumentBlueprint | None"] = relationship("DocumentBlueprint", back_populates="documents")
    template: Mapped["DocumentTemplate | None"] = relationship("DocumentTemplate", back_populates="documents")
    invoices: Mapped[list["HotelInvoice"]] = relationship(
        "HotelInvoice",
        back_populates="document",
    )


class HotelInvoice(Base):
    __tablename__ = "hms_invoices"
    __table_args__ = (
        UniqueConstraint("property_id", "invoice_number", name="uq_hms_invoices_property_id_invoice_number"),
    )

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reservation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_reservations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stay_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_stays.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    folio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_folios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    invoice_number: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(10), default="EUR", nullable=False)
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    reservation: Mapped["HotelReservation"] = relationship("HotelReservation", back_populates="invoices")
    stay: Mapped["HotelStay | None"] = relationship("HotelStay", back_populates="invoices")
    folio: Mapped["HotelFolio"] = relationship("HotelFolio", back_populates="invoices")
    document: Mapped["HotelDocument | None"] = relationship("HotelDocument", back_populates="invoices")
    lines: Mapped[list["HotelInvoiceLine"]] = relationship(
        "HotelInvoiceLine",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )
    deliveries: Mapped[list["HotelInvoiceDelivery"]] = relationship(
        "HotelInvoiceDelivery",
        back_populates="invoice",
        cascade="all, delete-orphan",
    )


class HotelInvoiceLine(Base):
    __tablename__ = "hms_invoice_lines"

    invoice_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    folio_line_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_folio_lines.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    charge_type: Mapped[str] = mapped_column(String(30), default="service", nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), default=0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    gross_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    service_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    invoice: Mapped["HotelInvoice"] = relationship("HotelInvoice", back_populates="lines")


class HotelInvoiceDelivery(Base):
    __tablename__ = "hms_invoice_deliveries"

    invoice_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False, index=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    message: Mapped[str | None] = mapped_column(String(5000), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    invoice: Mapped["HotelInvoice"] = relationship("HotelInvoice", back_populates="deliveries")


class HotelMessageTemplate(Base):
    __tablename__ = "hms_message_templates"
    __table_args__ = (
        UniqueConstraint("property_id", "code", name="uq_hms_message_templates_property_code"),
    )

    property_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    channel: Mapped[str] = mapped_column(String(20), default="email", nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), default="guest_message", nullable=False, index=True)
    subject_template: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body_template: Mapped[str] = mapped_column(String(5000), nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    events: Mapped[list["HotelMessageEvent"]] = relationship(
        "HotelMessageEvent",
        back_populates="template",
    )


class HotelMessageThread(Base):
    __tablename__ = "hms_message_threads"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reservation_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_reservations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    guest_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("guest_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel: Mapped[str] = mapped_column(String(20), default="email", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False, index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guest_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guest_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_direction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    reservation: Mapped["HotelReservation | None"] = relationship("HotelReservation", back_populates="message_threads")
    events: Mapped[list["HotelMessageEvent"]] = relationship(
        "HotelMessageEvent",
        back_populates="thread",
        cascade="all, delete-orphan",
    )


class HotelMessageEvent(Base):
    __tablename__ = "hms_message_events"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    thread_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_message_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    template_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_message_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    direction: Mapped[str] = mapped_column(String(20), default="outbound", nullable=False, index=True)
    channel: Mapped[str] = mapped_column(String(20), default="email", nullable=False, index=True)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body_text: Mapped[str] = mapped_column(String(5000), nullable=False)
    sender_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recipient_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="sent", nullable=False, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    thread: Mapped["HotelMessageThread"] = relationship("HotelMessageThread", back_populates="events")
    template: Mapped["HotelMessageTemplate | None"] = relationship("HotelMessageTemplate", back_populates="events")


class HotelFolioLine(Base):
    __tablename__ = "hms_folio_lines"

    folio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_folios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    charge_type: Mapped[str] = mapped_column(String(30), default="service", nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 2), default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    total_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="posted", nullable=False, index=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    folio: Mapped["HotelFolio"] = relationship("HotelFolio", back_populates="lines")


class HotelFolioPayment(Base):
    __tablename__ = "hms_folio_payments"

    folio_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_folios.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    method: Mapped[str] = mapped_column(String(30), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="completed", nullable=False, index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processing_fee: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    gateway_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    card_last_four: Mapped[str | None] = mapped_column(String(4), nullable=True)
    card_brand: Mapped[str | None] = mapped_column(String(30), nullable=True)
    wallet_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    refund_of_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_folio_payments.id", ondelete="SET NULL"),
        nullable=True,
    )

    folio: Mapped["HotelFolio"] = relationship("HotelFolio", back_populates="payments")


class HotelRole(Base):
    __tablename__ = "hms_roles"

    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    role_permissions: Mapped[list["HotelRolePermission"]] = relationship(
        "HotelRolePermission",
        back_populates="role",
        cascade="all, delete-orphan",
    )
    user_property_roles: Mapped[list["HotelUserPropertyRole"]] = relationship(
        "HotelUserPropertyRole",
        back_populates="role",
        cascade="all, delete-orphan",
    )


class HotelPermission(Base):
    __tablename__ = "hms_permissions"

    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)

    role_permissions: Mapped[list["HotelRolePermission"]] = relationship(
        "HotelRolePermission",
        back_populates="permission",
        cascade="all, delete-orphan",
    )


class HotelRolePermission(Base):
    __tablename__ = "hms_role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_hms_role_permission"),
    )

    role_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    permission_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_permissions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    role: Mapped["HotelRole"] = relationship("HotelRole", back_populates="role_permissions")
    permission: Mapped["HotelPermission"] = relationship("HotelPermission", back_populates="role_permissions")


class HotelUserPropertyRole(Base):
    __tablename__ = "hms_user_property_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", "role_id", name="uq_hms_user_property_role"),
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_by_user_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    user: Mapped["User"] = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="hotel_property_roles",
    )
    property: Mapped["HotelProperty"] = relationship("HotelProperty", back_populates="user_property_roles")
    role: Mapped["HotelRole"] = relationship("HotelRole", back_populates="user_property_roles")


class HotelExtra(Base):
    """Add-on products that can be linked to a reservation (e.g. City Tax, Breakfast, Parking)."""
    __tablename__ = "hms_extras"

    property_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    per_person: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    daily: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
