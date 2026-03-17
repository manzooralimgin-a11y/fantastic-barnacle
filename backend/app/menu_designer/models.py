from sqlalchemy import Boolean, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MenuTemplate(Base):
    __tablename__ = "menu_templates"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    layout_type: Mapped[str] = mapped_column(String(50), nullable=False)  # single_page, bifold, trifold, digital
    template_config_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # fonts, colors, spacing
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class MenuDesign(Base):
    __tablename__ = "menu_designs"

    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    design_data_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # full layout state
    translations_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {lang: {item_id: translation}}
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)  # draft, published
    language: Mapped[str] = mapped_column(String(10), default="de", nullable=False)
