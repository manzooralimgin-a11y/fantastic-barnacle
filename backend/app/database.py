from collections.abc import AsyncGenerator
from datetime import datetime
from urllib.parse import urlparse

from sqlalchemy import DateTime, Integer, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import settings
from app.reservations.cache import (
    discard_pending_availability_invalidations,
    flush_pending_availability_invalidations,
)


def _build_engine():
    parsed = urlparse(settings.database_url)
    is_sqlite = parsed.scheme.startswith("sqlite")
    engine_kwargs = {
        "echo": settings.sql_echo,
    }
    if is_sqlite:
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    else:
        engine_kwargs.update(
            {
                "pool_pre_ping": True,
                "pool_size": 10,
                "max_overflow": 20,
                "pool_timeout": 30,
                "pool_recycle": 1800,
            }
        )
    return create_async_engine(settings.database_url, **engine_kwargs)


engine = _build_engine()

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
    from app.ai.service import (
        discard_pending_ai_snapshot_invalidations,
        flush_pending_ai_snapshot_invalidations,
    )
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
            await flush_pending_ai_snapshot_invalidations(session)
            await flush_pending_consistency_checks(session)
        except Exception:
            await session.rollback()
            discard_pending_availability_invalidations(session)
            discard_pending_ai_snapshot_invalidations(session)
            discard_pending_consistency_checks(session)
            raise


def mark_session_commit_managed(session: AsyncSession) -> None:
    session.info[_SKIP_AUTO_COMMIT_KEY] = True
