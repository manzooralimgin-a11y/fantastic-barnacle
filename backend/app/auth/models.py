import enum

from sqlalchemy import JSON, Boolean, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    staff = "staff"


class User(Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=False),
        default=UserRole.staff,
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    restaurant_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    active_property_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("hms_properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    restaurant: Mapped["Restaurant | None"] = relationship(back_populates="users")
    hotel_property_roles: Mapped[list["HotelUserPropertyRole"]] = relationship(
        "HotelUserPropertyRole",
        back_populates="user",
        foreign_keys="HotelUserPropertyRole.user_id",
        cascade="all, delete-orphan",
    )
    active_property: Mapped["HotelProperty | None"] = relationship(
        "HotelProperty",
        foreign_keys=[active_property_id],
    )


class Restaurant(Base):
    __tablename__ = "restaurants"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    zip_code: Mapped[str] = mapped_column(String(20), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="America/New_York", nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="USD", nullable=False)
    settings_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    users: Mapped[list["User"]] = relationship(back_populates="restaurant")


# Ensure hotel RBAC models are registered before SQLAlchemy configures User mappings.
from app.hms.models import HotelProperty, HotelUserPropertyRole  # noqa: E402,F401
