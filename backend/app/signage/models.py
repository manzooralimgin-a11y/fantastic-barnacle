from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SignageScreen(Base):
    __tablename__ = "signage_screens"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    screen_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    resolution: Mapped[str] = mapped_column(String(20), default="1920x1080", nullable=False)
    orientation: Mapped[str] = mapped_column(String(20), default="landscape", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    current_playlist_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_ping_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SignageContent(Base):
    __tablename__ = "signage_content"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)  # menu_items, promotion, image, custom_text, daily_special
    content_data_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class SignagePlaylist(Base):
    __tablename__ = "signage_playlists"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    items_json: Mapped[list | None] = mapped_column(JSON, nullable=True)  # ordered content refs [{content_id, duration_override}]
    schedule_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {days: [1-7], start_time, end_time}
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
