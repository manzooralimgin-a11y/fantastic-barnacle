from __future__ import annotations

import asyncio
import logging

from app.database import async_session
from app.email_inbox.service import ingest_email, process_email_thread
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.shared.celery_app import celery

logger = logging.getLogger("app.email_inbox.tasks")


async def process_email_thread_async(thread_id: int) -> None:
    async with async_session() as db:
        try:
            await process_email_thread(db, thread_id=thread_id, source="email_task")
            await db.commit()
        except Exception as exc:
            await db.rollback()
            await api_metrics.record_business_event("email.processing.failure")
            log_event(
                logger,
                logging.ERROR,
                "email_processing_task_failed",
                email_thread_id=thread_id,
                error=str(exc),
            )


@celery.task(name="email_inbox.process_email_thread")
def process_email_thread_task(thread_id: int) -> None:
    asyncio.run(process_email_thread_async(thread_id))


async def _poll_and_ingest_imap_async() -> None:
    from app.email_inbox.imap_poller import fetch_unseen_emails

    payloads = await asyncio.to_thread(fetch_unseen_emails)
    if not payloads:
        return

    async with async_session() as db:
        for payload in payloads:
            try:
                result = await ingest_email(db, payload, source="imap_poll")
                await db.commit()
                if not result.duplicate:
                    await process_email_thread(db, thread_id=result.thread.id, source="imap_poll")
                    await db.commit()
            except Exception as exc:
                await db.rollback()
                log_event(
                    logger,
                    logging.ERROR,
                    "imap_ingest_failed",
                    external_id=payload.id,
                    error=str(exc),
                )


@celery.task(name="email_inbox.poll_imap_inbox")
def poll_imap_inbox_task() -> None:
    asyncio.run(_poll_and_ingest_imap_async())
