import asyncio
from datetime import datetime, timezone
from sqlalchemy import select, update
import logging

from app.shared.celery_app import celery
from app.database import async_session
from app.integrations.models import WebhookEvent, WebhookAudit
from app.observability.logging import log_event
from app.observability.metrics import api_metrics
from app.reservations.models import Reservation

logger = logging.getLogger(__name__)

async def process_voicebooker_event_async(event_id: str):
    async with async_session() as db:
        # 1. Fetch event
        stmt = select(WebhookEvent).where(WebhookEvent.event_id == event_id)
        result = await db.execute(stmt)
        event = result.scalar_one_or_none()
        if not event:
            logger.error(f"Event {event_id} not found")
            return

        if event.processing_status == "processed":
            logger.info(f"Event {event_id} already processed, skipping.")
            return

        payload = event.raw_payload
        # payload_dict here is {"event_id": "...", "event_type": "...", "timestamp": "...", "payload": {...}}
        event_type = payload.get("event_type")
        event_payload = payload.get("payload", {})

        try:
            if event_type == "booking.cancelled":
                booking_ref = event_payload.get("booking_id")
                if booking_ref:
                    # Cancel any booking containing the ref in notes
                    booking_search = f"%VoiceBooker Ref: {booking_ref}%"
                    stmt = select(Reservation).where(Reservation.notes.like(booking_search))
                    reservations = (await db.execute(stmt)).scalars().all()
                    
                    for r in reservations:
                        r.status = "cancelled"
                        
                    audit = WebhookAudit(
                        event_id=event_id,
                        action="cancel_reservation",
                        actor="system",
                        message=f"Cancelled {len(reservations)} reservation(s) matching ref {booking_ref}"
                    )
                    db.add(audit)
                
            event.processing_status = "processed"
            event.processed_at = datetime.now(timezone.utc)
            await db.commit()
            
        except Exception as e:
            await db.rollback()
            await api_metrics.record_business_event("integration.webhook.processing_failure")
            log_event(
                logger,
                logging.ERROR,
                "voicebooker_webhook_processing_failure",
                event_id=event_id,
                error=str(e),
            )
            async with async_session() as error_db:
                await error_db.execute(
                    update(WebhookEvent).where(WebhookEvent.event_id == event_id).values(
                        processing_status="error",
                        error=str(e)
                    )
                )
                await error_db.commit()

@celery.task(name="integrations.process_voicebooker_event")
def process_voicebooker_event(event_id: str):
    """Celery task to process a voicebooker event idempotently."""
    asyncio.run(process_voicebooker_event_async(event_id))
