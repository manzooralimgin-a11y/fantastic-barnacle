import hmac
import hashlib
import json
import time
import httpx
import uuid
from datetime import datetime, timezone

WEBHOOK_URL = "https://gestronomy-api.onrender.com/webhooks/voicebooker"
SECRET = "dev_secret_key"

def generate_signature(secret: str, timestamp: str, raw_body: str) -> str:
    signed_string = f"{timestamp}.{raw_body}"
    return hmac.new(
        secret.encode('utf-8'),
        signed_string.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

def send_mock_booking():
    event_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    payload = {
        "event_id": event_id,
        "event_type": "booking.created",
        "timestamp": timestamp,
        "payload": {
            "booking_id": f"BK-TEST-{int(time.time())}",
            "customer": {
                "customer_id": "CUST-MOCK-1",
                "name": "manzoor",
                "phone": "+49123456789"
            },
            "restaurant_id": "REST-1",
            "party_size": 4,
            "datetime": "2026-03-15T18:00:00+01:00",
            "source": "voicebooker",
            "notes": "Test booking from mock script"
        }
    }
    
    raw_body = json.dumps(payload)
    signature = generate_signature(SECRET, timestamp, raw_body)
    
    headers = {
        "Content-Type": "application/json",
        "X-VB-Signature": signature,
        "X-VB-Timestamp": timestamp,
        "X-VB-Event-Id": event_id
    }
    
    print(f"Sending mock webhook to {WEBHOOK_URL}")
    print(f"Event ID: {event_id}")
    try:
         # Use content=raw_body (rather than json=payload) to retain exact byte strings for HMAC verification
         response = httpx.post(WEBHOOK_URL, content=raw_body.encode('utf-8'), headers=headers, timeout=60.0)
         print(f"Status Code: {response.status_code}")
         print(f"Response: {response.text}")
    except Exception as e:
         print(f"Error: {e}")

if __name__ == "__main__":
    send_mock_booking()
