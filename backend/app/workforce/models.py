from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Employee(Base):
    __tablename__ = "employees"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    hourly_rate: Mapped[float] = mapped_column(Numeric(8, 2), default=0, nullable=False)
    skills_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    certifications_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    hire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)


class Schedule(Base):
    __tablename__ = "schedules"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    total_hours: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approved_by: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Shift(Base):
    __tablename__ = "shifts"

    schedule_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("schedules.id"), nullable=False
    )
    employee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    station: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actual_clock_in: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_clock_out: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class Applicant(Base):
    __tablename__ = "applicants"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    position: Mapped[str] = mapped_column(String(100), nullable=False)
    resume_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ai_match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="new", nullable=False)


class TrainingModule(Base):
    __tablename__ = "training_modules"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    content_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    required_for_roles: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class TrainingProgress(Base):
    __tablename__ = "training_progress"

    employee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id"), nullable=False
    )
    module_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("training_modules.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="assigned", nullable=False)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
