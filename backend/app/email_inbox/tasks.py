from __future__ import annotations

import asyncio
import logging

from app.database import async_session, engine
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


async def _run_process_email_thread(thread_id: int) -> None:
    # Dispose the engine inside the new event loop so pooled connections
    # bound to a previous Celery task's loop are not reused (which raises
    # "Future attached to a different loop").
    await engine.dispose()
    await process_email_thread_async(thread_id)


@celery.task(name="email_inbox.process_email_thread")
def process_email_thread_task(thread_id: int) -> None:
    asyncio.run(_run_process_email_thread(thread_id))


async def _poll_and_ingest_imap_async() -> None:
    from app.email_inbox.imap_poller import fetch_unseen_emails, mark_uid_seen

    # Dispose the engine inside the new event loop so pooled connections
    # bound to a previous Celery task's loop are not reused.
    await engine.dispose()

    fetched = await asyncio.to_thread(fetch_unseen_emails)
    fetched_count = len(fetched)
    inserted_count = 0
    duplicate_count = 0
    failed_count = 0

    if fetched_count == 0:
        log_event(
            logger,
            logging.INFO,
            "imap_poll_result",
            fetched_count=0,
            inserted_count=0,
        )
        return

    async with async_session() as db:
        for item in fetched:
            payload = item.payload
            try:
                result = await ingest_email(db, payload, source="imap_poll")
                await db.commit()
                if result.duplicate:
                    duplicate_count += 1
                else:
                    inserted_count += 1
                    try:
                        await process_email_thread(
                            db, thread_id=result.thread.id, source="imap_poll"
                        )
                        await db.commit()
                    except Exception as proc_exc:
                        await db.rollback()
                        log_event(
                            logger,
                            logging.ERROR,
                            "imap_process_failed",
                            external_id=payload.id,
                            error=str(proc_exc),
                        )
                # Mark SEEN only after a successful DB write (UNSEEN-origin only).
                if item.mark_seen:
                    await asyncio.to_thread(mark_uid_seen, item.uid)
            except Exception as exc:
                await db.rollback()
                failed_count += 1
                log_event(
                    logger,
                    logging.ERROR,
                    "imap_ingest_failed",
                    external_id=payload.id,
                    error=str(exc),
                )

    log_event(
        logger,
        logging.INFO,
        "imap_poll_result",
        fetched_count=fetched_count,
        inserted_count=inserted_count,
        duplicate_count=duplicate_count,
        failed_count=failed_count,
    )


@celery.task(name="email_inbox.poll_imap_inbox")
def poll_imap_inbox_task() -> None:
    asyncio.run(_poll_and_ingest_imap_async())
