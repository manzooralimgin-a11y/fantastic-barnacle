from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from email.utils import parseaddr
from typing import Any

from dateutil import parser as date_parser

from app.config import settings
from app.email_inbox.prompts import (
    CLASSIFICATION_SYSTEM_PROMPT,
    EXTRACTION_SYSTEM_PROMPT,
    REPLY_SYSTEM_PROMPT,
)
from app.email_inbox.schemas import (
    EmailClassification,
    EmailReplyDraft,
    ExtractedBookingData,
    NormalizedEmailPayload,
)
from app.hms.room_inventory import ROOM_CATEGORY_CONFIG, room_category_display_label
from app.observability.logging import log_event

logger = logging.getLogger("app.email_inbox.ai")

try:
    from anthropic import AsyncAnthropic
except Exception:  # pragma: no cover - dependency is expected but keep startup safe
    AsyncAnthropic = None


_HOTEL_KEYWORDS = {
    "hotel",
    "room",
    "suite",
    "check-in",
    "check in",
    "check-out",
    "check out",
    "stay",
    "nights",
    "availability",
    "angebot",
    "room type",
}
_RESTAURANT_KEYWORDS = {
    "restaurant",
    "table",
    "dinner",
    "lunch",
    "breakfast",
    "party",
    "reservation",
    "book a table",
    "tagung",
    "conference",
    "meeting",
}
_SPAM_KEYWORDS = {
    "unsubscribe",
    "newsletter",
    "seo",
    "marketing",
    "backlink",
    "promotion",
    "discount",
    "casino",
    "crypto",
    "cold outreach",
    "lead generation",
}
_DATE_PATTERN = re.compile(
    r"\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b"
)
_TIME_PATTERN = re.compile(r"\b(\d{1,2})[:.](\d{2})\b")
_PHONE_PATTERN = re.compile(r"(\+?\d[\d\s()/-]{6,}\d)")
_GUEST_COUNT_PATTERN = re.compile(
    r"\b(\d{1,2})\s*(?:guests?|people|persons?|adults?|pax)\b",
    re.IGNORECASE,
)
_NAME_PATTERN = re.compile(
    r"(?:my name is|this is|regards,|kind regards,|best regards,)\s+([A-ZÄÖÜ][\wÄÖÜäöüß' -]{2,})",
    re.IGNORECASE,
)


def _clean_summary(value: str, limit: int = 220) -> str:
    compact = " ".join(value.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _parse_sender(sender: str) -> tuple[str | None, str | None]:
    name, email = parseaddr(sender)
    normalized_name = name.strip() or None
    normalized_email = email.strip().lower() or None
    return normalized_name, normalized_email


def _parse_date_token(token: str) -> date | None:
    try:
        parsed = date_parser.parse(token, dayfirst="." in token or "/" in token, fuzzy=False)
    except (ValueError, TypeError, OverflowError):
        return None
    return parsed.date()


def _extract_dates(text: str) -> list[date]:
    seen: list[date] = []
    for token in _DATE_PATTERN.findall(text):
        parsed = _parse_date_token(token)
        if parsed and parsed not in seen:
            seen.append(parsed)
    return seen


def _extract_time(text: str) -> time | None:
    match = _TIME_PATTERN.search(text)
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return time(hour=hour, minute=minute)


def _extract_phone(text: str) -> str | None:
    match = _PHONE_PATTERN.search(text)
    if not match:
        return None
    return " ".join(match.group(1).split())


def _extract_guest_count(text: str) -> int | None:
    match = _GUEST_COUNT_PATTERN.search(text)
    if not match:
        return None
    value = int(match.group(1))
    return value if value > 0 else None


def _extract_guest_name(email: NormalizedEmailPayload) -> str | None:
    sender_name, _sender_email = _parse_sender(email.sender)
    if sender_name:
        return sender_name
    match = _NAME_PATTERN.search(email.body)
    return match.group(1).strip() if match else None


def _extract_email_address(email: NormalizedEmailPayload) -> str | None:
    _sender_name, sender_email = _parse_sender(email.sender)
    if sender_email:
        return sender_email
    emails = re.findall(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", email.body, flags=re.IGNORECASE)
    return emails[0].lower() if emails else None


def _detect_room_type(text: str) -> str | None:
    lowered = text.lower()
    for category_key in ROOM_CATEGORY_CONFIG:
        label = room_category_display_label(category_key)
        if label.lower() in lowered or category_key.replace("_", " ") in lowered:
            return label
    return None


def _intent_hits(text: str) -> tuple[int, int]:
    lowered = text.lower()
    hotel_hits = sum(keyword in lowered for keyword in _HOTEL_KEYWORDS)
    restaurant_hits = sum(keyword in lowered for keyword in _RESTAURANT_KEYWORDS)
    return hotel_hits, restaurant_hits


def deterministic_classification(email: NormalizedEmailPayload) -> EmailClassification:
    haystack = f"{email.subject}\n{email.body}".lower()
    hotel_hits, restaurant_hits = _intent_hits(haystack)
    reservation_hits = hotel_hits + restaurant_hits
    spam_hits = sum(keyword in haystack for keyword in _SPAM_KEYWORDS)

    if spam_hits >= 1 and reservation_hits == 0:
        return EmailClassification(category="spam", confidence=0.92, reason="matched spam keywords")
    if reservation_hits >= 1 or bool(_extract_dates(haystack)) or bool(_extract_guest_count(haystack)):
        confidence = min(0.55 + reservation_hits * 0.12 + spam_hits * 0.0, 0.99)
        return EmailClassification(
            category="reservation",
            confidence=round(confidence, 2),
            reason="matched reservation intent keywords or booking details",
        )
    return EmailClassification(category="other", confidence=0.72, reason="no reservation intent detected")


def deterministic_extraction(email: NormalizedEmailPayload) -> ExtractedBookingData:
    haystack = f"{email.subject}\n{email.body}"
    hotel_hits, restaurant_hits = _intent_hits(haystack)
    dates = _extract_dates(haystack)
    intent: str | None = None
    if hotel_hits > restaurant_hits:
        intent = "hotel"
    elif restaurant_hits > hotel_hits:
        intent = "restaurant"
    elif len(dates) >= 2:
        intent = "hotel"
    elif len(dates) == 1:
        intent = "restaurant"

    extracted = ExtractedBookingData(
        guest_name=_extract_guest_name(email),
        email=_extract_email_address(email),
        phone=_extract_phone(haystack),
        check_in=dates[0] if intent == "hotel" and len(dates) >= 1 else None,
        check_out=dates[1] if intent == "hotel" and len(dates) >= 2 else None,
        reservation_date=dates[0] if intent == "restaurant" and dates else None,
        start_time=_extract_time(haystack) if intent == "restaurant" else None,
        guests=_extract_guest_count(haystack),
        room_type=_detect_room_type(haystack) if intent == "hotel" else None,
        intent=intent,  # type: ignore[arg-type]
        summary=_clean_summary(email.subject or email.body),
    )
    return extracted


def deterministic_reply(
    *,
    email: NormalizedEmailPayload,
    extracted: ExtractedBookingData,
    context: dict[str, Any],
) -> EmailReplyDraft:
    guest_name = extracted.guest_name or "there"
    hotel_name = context.get("hotel_name") or "DAS ELB"
    restaurant_name = context.get("restaurant_name") or "DAS ELB Restaurant"
    if extracted.intent == "hotel":
        requested_room = extracted.room_type or "your requested room category"
        check_in = extracted.check_in.isoformat() if extracted.check_in else "your requested dates"
        check_out = extracted.check_out.isoformat() if extracted.check_out else ""
        price = context.get("price_from")
        availability = context.get("availability")
        if availability and context.get("requested_room_available"):
            offer_line = f"We are pleased to offer {requested_room} from EUR {price:.2f} per night" if isinstance(price, (int, float)) else f"We are pleased to offer {requested_room}"
            body = (
                f"Dear {guest_name},\n\n"
                f"Thank you for your inquiry at {hotel_name}. "
                f"{offer_line} for the stay {check_in}"
                f"{f' to {check_out}' if check_out else ''}. "
                "Please let us know if you would like us to hold the reservation for you.\n\n"
                "Kind regards,\nDAS ELB Reservations"
            )
            return EmailReplyDraft(content=body, safe_to_send=True, reasoning="grounded hotel availability offer")

        if availability:
            alternatives = context.get("available_alternatives") or []
            alternative_line = (
                f" Currently available categories include {', '.join(alternatives)}."
                if alternatives
                else ""
            )
            body = (
                f"Dear {guest_name},\n\n"
                f"Thank you for your inquiry at {hotel_name}. "
                f"We could not confirm availability for {requested_room} on {check_in}"
                f"{f' to {check_out}' if check_out else ''}.{alternative_line} "
                "If you would like, we can prepare an alternative offer for you.\n\n"
                "Kind regards,\nDAS ELB Reservations"
            )
            return EmailReplyDraft(content=body, safe_to_send=True, reasoning="grounded hotel availability response")

        body = (
            f"Dear {guest_name},\n\n"
            f"Thank you for your inquiry at {hotel_name}. We are reviewing your requested stay"
            f"{f' from {check_in}' if extracted.check_in else ''}"
            f"{f' to {check_out}' if extracted.check_out else ''} and will get back to you shortly.\n\n"
            "Kind regards,\nDAS ELB Reservations"
        )
        return EmailReplyDraft(content=body, safe_to_send=True, reasoning="safe fallback without availability")

    requested_date = extracted.reservation_date.isoformat() if extracted.reservation_date else "your requested date"
    requested_time = extracted.start_time.strftime("%H:%M") if extracted.start_time else "your preferred time"
    if context.get("slot_available"):
        body = (
            f"Dear {guest_name},\n\n"
            f"Thank you for your reservation inquiry for {restaurant_name}. "
            f"We currently have availability on {requested_date} at {requested_time}"
            f"{f' for {extracted.guests} guests' if extracted.guests else ''}. "
            "Please confirm if you would like us to proceed.\n\n"
            "Kind regards,\nDAS ELB Restaurant"
        )
        return EmailReplyDraft(content=body, safe_to_send=True, reasoning="grounded restaurant availability response")

    alternatives = context.get("alternative_slots") or []
    alternative_text = f" We can currently offer {', '.join(alternatives)}." if alternatives else ""
    body = (
        f"Dear {guest_name},\n\n"
        f"Thank you for your inquiry for {restaurant_name}. "
        f"We could not confirm availability for {requested_date} at {requested_time}.{alternative_text} "
        "Please let us know which option suits you best.\n\n"
        "Kind regards,\nDAS ELB Restaurant"
    )
    return EmailReplyDraft(content=body, safe_to_send=True, reasoning="grounded restaurant alternatives")


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if "\n" in stripped:
            stripped = stripped.split("\n", 1)[1]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in model output")
    return json.loads(stripped[start : end + 1])


@dataclass(slots=True)
class EmailAIService:
    model_name: str = settings.email_inbox_ai_model
    _client: Any = field(init=False, default=None, repr=False)

    def __post_init__(self) -> None:
        if settings.anthropic_api_key and AsyncAnthropic is not None:
            self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    async def classify_email(self, email: NormalizedEmailPayload) -> EmailClassification:
        fallback = deterministic_classification(email)
        if self._client is None:
            return fallback
        payload = await self._generate_json(
            system_prompt=CLASSIFICATION_SYSTEM_PROMPT,
            user_payload=email.model_dump(mode="json", by_alias=True),
        )
        if not payload:
            return fallback
        try:
            candidate = EmailClassification.model_validate(payload)
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "email_ai_classification_fallback",
                error=str(exc),
            )
            return fallback
        if candidate.category == "reservation" and candidate.confidence < settings.email_inbox_min_confidence:
            return fallback
        return candidate

    async def extract_booking_data(self, email: NormalizedEmailPayload) -> ExtractedBookingData:
        fallback = deterministic_extraction(email)
        if self._client is None:
            return fallback
        payload = await self._generate_json(
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_payload=email.model_dump(mode="json", by_alias=True),
        )
        if not payload:
            return fallback
        try:
            return ExtractedBookingData.model_validate(payload)
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "email_ai_extraction_fallback",
                error=str(exc),
            )
            return fallback

    async def generate_reply(
        self,
        *,
        email: NormalizedEmailPayload,
        extracted: ExtractedBookingData,
        context: dict[str, Any],
    ) -> EmailReplyDraft:
        fallback = deterministic_reply(email=email, extracted=extracted, context=context)
        if self._client is None:
            return fallback
        payload = await self._generate_json(
            system_prompt=REPLY_SYSTEM_PROMPT,
            user_payload={
                "email": email.model_dump(mode="json", by_alias=True),
                "extracted": extracted.model_dump(mode="json", exclude_none=True),
                "context": context,
            },
        )
        if not payload:
            return fallback
        try:
            return EmailReplyDraft.model_validate(payload)
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "email_ai_reply_fallback",
                error=str(exc),
            )
            return fallback

    async def _generate_json(
        self,
        *,
        system_prompt: str,
        user_payload: dict[str, Any],
    ) -> dict[str, Any] | None:
        if self._client is None:
            return None
        try:
            response = await self._client.messages.create(
                model=self.model_name,
                max_tokens=900,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": json.dumps(user_payload, default=str),
                    }
                ],
            )
            text_parts = [
                block.text
                for block in getattr(response, "content", [])
                if getattr(block, "type", "") == "text"
            ]
            if not text_parts:
                return None
            return _extract_json_object("".join(text_parts))
        except Exception as exc:
            log_event(
                logger,
                logging.WARNING,
                "email_ai_provider_failed",
                error=str(exc),
            )
            return None


email_ai_service = EmailAIService()
