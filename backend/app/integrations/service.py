import hmac
import hashlib
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.integrations.models import WebhookEvent

def verify_signature(raw_body: bytes, signature_header: str, timestamp_header: str, secret: str) -> bool:
    if not signature_header or not timestamp_header or not secret:
        return False
        
    signed_string = f"{timestamp_header}.{raw_body.decode('utf-8')}"
    expected = hmac.new(
        secret.encode('utf-8'),
        signed_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    # Timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(expected, signature_header)

async def store_webhook_event(
    db: AsyncSession, 
    event_id: str, 
    raw_payload: dict, 
    headers: dict, 
    source: str = "voicebooker"
) -> bool:
    """Stores the event idempotently. Returns True if inserted, False if already exists."""
    stmt = select(WebhookEvent).where(WebhookEvent.event_id == event_id)
    existing = await db.execute(stmt)
    if existing.scalar_one_or_none():
        return False
        
    event = WebhookEvent(
        event_id=event_id,
        source=source,
        raw_payload=raw_payload,
        headers=headers,
        received_at=datetime.now(timezone.utc),
        processing_status="received"
    )
    db.add(event)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return False
    return True
