from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EmailThread(Base):
    __tablename__ = "email_threads"
    __table_args__ = (
        Index("ix_email_threads_category_status", "category", "status"),
        Index("ix_email_threads_received_at", "received_at"),
        Index("ix_email_threads_reply_sent", "reply_sent"),
    )

    external_email_id: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    sender: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    raw_email: Mapped[dict] = mapped_column(JSON, nullable=False)
    category: Mapped[str] = mapped_column(String(20), default="pending", nullable=False, index=True)
    classification_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary: Mapped[str | None] = mapped_column(String(500), nullable=True)
    reply_generated: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    reply_sent: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    reply_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reply_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replied_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        server_default=text("'pending'"),
        nullable=False,
        index=True,
    )
    reply_mode: Mapped[str] = mapped_column(
        String(20),
        default="generate_only",
        server_default=text("'generate_only'"),
        nullable=False,
    )
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_error: Mapped[str | None] = mapped_column(Text, nullable=True)
