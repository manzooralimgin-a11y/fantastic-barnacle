import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Header, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import settings
from app.integrations.schemas import VoiceBookerEvent, WebhookResponse
from app.integrations.service import verify_signature, store_webhook_event
from app.observability.logging import log_event
from app.observability.metrics import api_metrics

logger = logging.getLogger("integrations")

router = APIRouter(prefix="/webhooks", tags=["integrations"])


@router.post("/voicebooker", response_model=WebhookResponse)
async def receive_voicebooker_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_vb_signature: str | None = Header(None, alias="X-VB-Signature"),
    x_vb_timestamp: str | None = Header(None, alias="X-VB-Timestamp"),
    db: AsyncSession = Depends(get_db),
):
    raw_body = await request.body()

    # 1. Verify Timestamp Skew (5 mins)
    if not x_vb_timestamp:
        raise HTTPException(status_code=401, detail="Missing X-VB-Timestamp header")
    try:
        ts = datetime.fromisoformat(x_vb_timestamp.replace("Z", "+00:00"))
        skew = abs((datetime.now(timezone.utc) - ts).total_seconds())
        if skew > 300:
            raise HTTPException(status_code=401, detail="Timestamp skew too large")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp format")

    # 2. Verify Signature
    if not x_vb_signature:
        raise HTTPException(status_code=401, detail="Missing X-VB-Signature header")
    if not verify_signature(raw_body, x_vb_signature, x_vb_timestamp, settings.voicebooker_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # 3. Parse JSON
    try:
        payload_dict = json.loads(raw_body)
        evt = VoiceBookerEvent(**payload_dict)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON or schema")

    # 4. Idempotent Storage
    try:
        headers_dict = dict(request.headers.items())
        inserted = await store_webhook_event(db, evt.event_id, payload_dict, headers_dict)

        if inserted:
            from app.integrations.tasks import process_voicebooker_event, process_voicebooker_event_async

            try:
                process_voicebooker_event.delay(evt.event_id)
            except Exception as celery_err:
                logger.warning(
                    "Celery/Redis unavailable (%s), falling back to BackgroundTasks.",
                    celery_err,
                )
                background_tasks.add_task(process_voicebooker_event_async, evt.event_id)

        return WebhookResponse(status="accepted", event_id=evt.event_id)
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        await api_metrics.record_business_event("integration.webhook.failure")
        log_event(
            logger,
            logging.ERROR,
            "voicebooker_webhook_failure",
            error=str(e),
            event_id=evt.event_id if "evt" in locals() else None,
            path="/webhooks/voicebooker",
        )
        raise HTTPException(status_code=500, detail="Internal processing error")
