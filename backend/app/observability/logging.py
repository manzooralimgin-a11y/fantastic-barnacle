from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

from app.middleware.request_id import (
    get_idempotency_key,
    get_request_id,
    get_reservation_id,
    get_trace_id,
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "logger": record.name,
            "level": record.levelname,
        }

        message = record.getMessage()
        if message:
            try:
                parsed = json.loads(message)
            except (TypeError, json.JSONDecodeError):
                payload["message"] = message
            else:
                if isinstance(parsed, dict):
                    payload.update(parsed)
                else:
                    payload["message"] = parsed

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        root_logger.addHandler(handler)

    formatter = JsonFormatter()
    for handler in root_logger.handlers:
        handler.setLevel(level)
        handler.setFormatter(formatter)


def _normalize_field(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): _normalize_field(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_normalize_field(item) for item in value]
    return str(value)


def build_log_payload(event: str, **fields: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": event,
    }

    request_id = get_request_id()
    trace_id = get_trace_id()
    if request_id:
        payload["request_id"] = request_id
    if trace_id:
        payload["trace_id"] = trace_id
    idempotency_key = get_idempotency_key()
    reservation_id = get_reservation_id()
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    if reservation_id:
        payload["reservation_id"] = reservation_id

    for key, value in fields.items():
        payload[key] = _normalize_field(value)
    return payload


def log_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    logger.log(level, json.dumps(build_log_payload(event, **fields), default=str))
