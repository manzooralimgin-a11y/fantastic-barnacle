from collections.abc import AsyncGenerator
from datetime import datetime

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import settings
from app.reservations.cache import (
    discard_pending_availability_invalidations,
    flush_pending_availability_invalidations,
)

engine = create_async_engine(
    settings.database_url,
    echo=settings.sql_echo,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
_SKIP_AUTO_COMMIT_KEY = "skip_auto_commit"


class Base(DeclarativeBase):
    """Base class for all database models."""

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    from app.reservations.consistency import (
        discard_pending_consistency_checks,
        flush_pending_consistency_checks,
    )

    async with async_session() as session:
        try:
            yield session
            if session.info.pop(_SKIP_AUTO_COMMIT_KEY, False):
                return
            await session.commit()
            await flush_pending_availability_invalidations(session)
            await flush_pending_consistency_checks(session)
        except Exception:
            await session.rollback()
            discard_pending_availability_invalidations(session)
            discard_pending_consistency_checks(session)
            raise


def mark_session_commit_managed(session: AsyncSession) -> None:
    session.info[_SKIP_AUTO_COMMIT_KEY] = True
