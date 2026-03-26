"""Tests for webhook signature verification, schema validation, and API endpoint."""

import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.integrations import router as integrations_router
from app.integrations.schemas import VoiceBookerEvent, WebhookResponse
from app.integrations.service import verify_signature

SECRET = "test-webhook-secret"


def _sign(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    signed_string = f"{timestamp}.{body.decode('utf-8')}"
    return hmac.new(
        secret.encode("utf-8"),
        signed_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


class TestVerifySignature:
    def test_valid_signature(self) -> None:
        body = b'{"event_id":"e1"}'
        ts = "2026-03-15T12:00:00+00:00"
        sig = _sign(body, ts)
        assert verify_signature(body, sig, ts, SECRET) is True

    def test_invalid_signature(self) -> None:
        body = b'{"event_id":"e1"}'
        ts = "2026-03-15T12:00:00+00:00"
        assert verify_signature(body, "bad-signature", ts, SECRET) is False

    def test_wrong_secret(self) -> None:
        body = b'{"event_id":"e1"}'
        ts = "2026-03-15T12:00:00+00:00"
        sig = _sign(body, ts, secret="wrong-secret")
        assert verify_signature(body, sig, ts, SECRET) is False

    def test_tampered_body(self) -> None:
        original = b'{"event_id":"e1"}'
        ts = "2026-03-15T12:00:00+00:00"
        sig = _sign(original, ts)
        tampered = b'{"event_id":"e2"}'
        assert verify_signature(tampered, sig, ts, SECRET) is False

    def test_empty_signature_returns_false(self) -> None:
        assert verify_signature(b"body", "", "ts", SECRET) is False

    def test_empty_timestamp_returns_false(self) -> None:
        assert verify_signature(b"body", "sig", "", SECRET) is False

    def test_empty_secret_returns_false(self) -> None:
        assert verify_signature(b"body", "sig", "ts", "") is False


class TestVoiceBookerEventSchema:
    def test_valid_event(self) -> None:
        evt = VoiceBookerEvent(
            event_id="evt-123",
            event_type="booking.created",
            timestamp=datetime.now(timezone.utc),
            payload={"customer": {"name": "John"}},
        )
        assert evt.event_id == "evt-123"
        assert evt.event_type == "booking.created"

    def test_missing_required_field(self) -> None:
        with pytest.raises(Exception):
            VoiceBookerEvent(event_id="evt-1", event_type="booking.created")

    def test_webhook_response_schema(self) -> None:
        resp = WebhookResponse(status="accepted", event_id="evt-1")
        assert resp.status == "accepted"


@pytest.mark.asyncio
async def test_webhook_missing_timestamp(client: AsyncClient) -> None:
    resp = await client.post(
        "/webhooks/voicebooker",
        json={
            "event_id": "e1",
            "event_type": "booking.created",
            "timestamp": "2026-03-15T12:00:00Z",
            "payload": {},
        },
    )
    assert resp.status_code == 401
    assert "Timestamp" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_webhook_invalid_timestamp_format(client: AsyncClient) -> None:
    resp = await client.post(
        "/webhooks/voicebooker",
        json={
            "event_id": "e1",
            "event_type": "booking.created",
            "timestamp": "2026-03-15T12:00:00Z",
            "payload": {},
        },
        headers={
            "X-VB-Timestamp": "not-a-date",
            "X-VB-Signature": "fake",
        },
    )
    assert resp.status_code == 401
    assert "timestamp" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_webhook_timestamp_skew_rejected(client: AsyncClient) -> None:
    old_ts = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    body = json.dumps(
        {
            "event_id": "e1",
            "event_type": "booking.created",
            "timestamp": "2026-03-15T12:00:00Z",
            "payload": {},
        }
    )
    sig = _sign(body.encode(), old_ts, secret="dev_secret_key")

    resp = await client.post(
        "/webhooks/voicebooker",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-VB-Timestamp": old_ts,
            "X-VB-Signature": sig,
        },
    )
    assert resp.status_code == 401
    assert "skew" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_webhook_invalid_signature_rejected(client: AsyncClient) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    resp = await client.post(
        "/webhooks/voicebooker",
        json={
            "event_id": "e1",
            "event_type": "booking.created",
            "timestamp": "2026-03-15T12:00:00Z",
            "payload": {},
        },
        headers={
            "X-VB-Timestamp": ts,
            "X-VB-Signature": "definitely-wrong",
        },
    )
    assert resp.status_code == 401
    assert "signature" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_webhook_invalid_json_body(client: AsyncClient) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    body = json.dumps({"not_an_event": True})
    sig = _sign(body.encode(), ts, secret="dev_secret_key")

    resp = await client.post(
        "/webhooks/voicebooker",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-VB-Timestamp": ts,
            "X-VB-Signature": sig,
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_webhook_booking_created_is_accepted_without_deprecation_headers(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_store_webhook_event(*args, **kwargs) -> bool:
        return False

    monkeypatch.setattr(integrations_router, "store_webhook_event", fake_store_webhook_event)

    ts = datetime.now(timezone.utc).isoformat()
    body = json.dumps(
        {
            "event_id": "evt-accepted",
            "event_type": "booking.created",
            "timestamp": ts,
            "payload": {"booking_id": "bk-123"},
        }
    )
    sig = _sign(body.encode(), ts, secret="dev_secret_key")

    resp = await client.post(
        "/webhooks/voicebooker",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-VB-Timestamp": ts,
            "X-VB-Signature": sig,
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"status": "accepted", "event_id": "evt-accepted"}
    assert "X-Deprecated" not in resp.headers
    assert "X-Use-Instead" not in resp.headers
