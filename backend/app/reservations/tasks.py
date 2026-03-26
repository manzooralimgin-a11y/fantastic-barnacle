from __future__ import annotations

import asyncio
import logging

from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.consistency import check_system_consistency
from app.shared.celery_app import celery

logger = logging.getLogger("app.reservations.tasks")


async def run_reservation_reconciliation_async(window_hours: int) -> dict:
    from app.database import async_session

    async with async_session() as session:
        report = await check_system_consistency(session, window_hours=window_hours)

    await api_metrics.record_business_event("reservation.reconciliation.run")
    if report["status"] != "ok":
        await api_metrics.record_business_event("reservation.consistency.violation")
        log_event(
            logger,
            logging.ERROR,
            "reservation_consistency_violation",
            source="celery_reconciliation",
            counts=report["counts"],
            report=report,
        )
    else:
        log_event(
            logger,
            logging.INFO,
            "reservation_reconciliation_completed",
            source="celery_reconciliation",
            counts=report["counts"],
        )
    return report


@celery.task(name="reservations.reconcile_recent_reservations")
def run_reservation_reconciliation(window_hours: int = 6):
    return asyncio.run(run_reservation_reconciliation_async(window_hours))
