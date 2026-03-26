from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, mark_session_commit_managed
from app.dependencies import get_current_tenant_user
from app.email_inbox.schemas import (
    EmailInboxListResponse,
    EmailIngestResponse,
    EmailThreadRead,
    EmailThreadUpdate,
    GenerateReplyResponse,
    NormalizedEmailPayload,
    SendReplyRequest,
)
from app.email_inbox.service import (
    email_inbox_stats,
    generate_reply_for_thread,
    get_email_thread,
    ingest_email,
    list_filtered_email_threads,
    process_email_thread,
    send_reply_for_thread,
    serialize_email_thread,
    update_email_thread,
)
from app.observability.logging import log_event
from app.shared.celery_app import celery
from app.shared.events import get_redis

logger = logging.getLogger("app.email_inbox.router")

ingest_router = APIRouter()
router = APIRouter()


def _verify_ingest_secret(secret_header: str | None) -> None:
    expected = (settings.email_inbox_ingest_secret or "").strip()
    if not expected:
        return
    if secret_header != expected:
        raise HTTPException(status_code=401, detail="Invalid email inbox secret")


async def _can_dispatch_email_tasks() -> bool:
    try:
        redis = await get_redis()
        await redis.ping()
        worker_status = await asyncio.wait_for(
            asyncio.to_thread(lambda: celery.control.inspect(timeout=0.2).ping()),
            timeout=0.3,
        )
        return bool(worker_status)
    except Exception:
        return False


@ingest_router.post("/ingest", response_model=EmailIngestResponse, status_code=202)
async def ingest_email_thread(
    payload: NormalizedEmailPayload,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    x_email_inbox_secret: str | None = Header(None, alias="X-Email-Inbox-Secret"),
):
    _verify_ingest_secret(x_email_inbox_secret)
    result = await ingest_email(db, payload, source="email_ingest")
    mark_session_commit_managed(db)
    await db.commit()
    if not result.duplicate:
        from app.email_inbox.tasks import process_email_thread_task

        dispatched = False
        celery_error = None
        if await _can_dispatch_email_tasks():
            try:
                await asyncio.wait_for(
                    asyncio.to_thread(process_email_thread_task.delay, result.thread.id),
                    timeout=0.25,
                )
                dispatched = True
            except Exception as exc:
                celery_error = exc

        if not dispatched:
            log_event(
                logger,
                logging.WARNING,
                "email_processing_task_fallback",
                email_thread_id=result.thread.id,
                error=str(celery_error or "redis_unavailable"),
            )
            await process_email_thread(db, thread_id=result.thread.id, source="email_task_inline")
            await db.commit()

    return EmailIngestResponse(
        thread_id=result.thread.id,
        status=result.thread.status,
        duplicate=result.duplicate,
    )


@router.get("", response_model=EmailInboxListResponse)
async def list_email_threads(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_tenant_user),
):
    return await list_filtered_email_threads(db, limit=limit)


@router.get("/stats")
async def get_email_inbox_stats(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_tenant_user),
):
    return await email_inbox_stats(db)


@router.get("/{thread_id}", response_model=EmailThreadRead)
async def get_email_thread_detail(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_tenant_user),
):
    return serialize_email_thread(await get_email_thread(db, thread_id=thread_id))


@router.post("/{thread_id}/generate-reply", response_model=GenerateReplyResponse)
async def generate_reply(
    thread_id: int,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_tenant_user),
):
    thread = await generate_reply_for_thread(db, thread_id=thread_id, source="hms_email_inbox")
    return GenerateReplyResponse(thread=serialize_email_thread(thread))


@router.post("/{thread_id}/send-reply", response_model=GenerateReplyResponse)
async def send_reply(
    thread_id: int,
    payload: SendReplyRequest,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_tenant_user),
):
    thread = await send_reply_for_thread(
        db,
        thread_id=thread_id,
        source="hms_email_inbox",
        replied_by_user_id=getattr(user, "id", None),
        reply_content=payload.reply_content,
    )
    return GenerateReplyResponse(thread=serialize_email_thread(thread))


@router.patch("/{thread_id}", response_model=EmailThreadRead)
async def patch_email_thread(
    thread_id: int,
    payload: EmailThreadUpdate,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_tenant_user),
):
    thread = await update_email_thread(db, thread_id=thread_id, payload=payload)
    return serialize_email_thread(thread)
