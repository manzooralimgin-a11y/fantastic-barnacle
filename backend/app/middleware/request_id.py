import contextvars
import re
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")
trace_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="")
request_path_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_path", default="")
request_method_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_method", default="")
idempotency_key_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "idempotency_key",
    default="",
)
reservation_id_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "reservation_id",
    default="",
)
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_TRACE_ID_RE = re.compile(r"^[A-Fa-f0-9-]{16,128}$")


def _extract_traceparent_trace_id(raw_value: str | None) -> str | None:
    candidate = (raw_value or "").strip()
    if not candidate:
        return None
    parts = candidate.split("-")
    if len(parts) != 4:
        return None
    trace_id = parts[1].strip()
    return trace_id if _TRACE_ID_RE.fullmatch(trace_id) else None


def _resolve_request_id(raw_value: str | None) -> str:
    candidate = (raw_value or "").strip()
    if candidate and _REQUEST_ID_RE.fullmatch(candidate):
        return candidate
    return str(uuid.uuid4())


def _resolve_trace_id(raw_value: str | None, traceparent: str | None) -> str:
    candidate = (raw_value or "").strip()
    if candidate and _TRACE_ID_RE.fullmatch(candidate):
        return candidate

    traceparent_id = _extract_traceparent_trace_id(traceparent)
    if traceparent_id:
        return traceparent_id

    return uuid.uuid4().hex


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = _resolve_request_id(request.headers.get("X-Request-ID"))
        tid = _resolve_trace_id(
            request.headers.get("X-Trace-ID"),
            request.headers.get("traceparent"),
        )
        idempotency_key = (request.headers.get("Idempotency-Key") or "").strip()
        token = request_id_var.set(rid)
        trace_token = trace_id_var.set(tid)
        path_token = request_path_var.set(str(request.url.path))
        method_token = request_method_var.set(request.method.upper())
        idempotency_token = idempotency_key_var.set(idempotency_key)
        reservation_token = reservation_id_var.set("")
        request.state.request_id = rid
        request.state.trace_id = tid
        request.state.idempotency_key = idempotency_key
        try:
            response: Response = await call_next(request)
        finally:
            request_id_var.reset(token)
            trace_id_var.reset(trace_token)
            request_path_var.reset(path_token)
            request_method_var.reset(method_token)
            idempotency_key_var.reset(idempotency_token)
            reservation_id_var.reset(reservation_token)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Trace-ID"] = tid
        return response


def get_request_id() -> str:
    return request_id_var.get()


def get_trace_id() -> str:
    return trace_id_var.get()


def get_request_path() -> str:
    return request_path_var.get()


def get_request_method() -> str:
    return request_method_var.get()


def set_idempotency_key(value: str | None):
    return idempotency_key_var.set((value or "").strip())


def get_idempotency_key() -> str:
    return idempotency_key_var.get()


def reset_idempotency_key(token) -> None:
    idempotency_key_var.reset(token)


def set_reservation_id(value: int | str | None):
    return reservation_id_var.set("" if value is None else str(value))


def get_reservation_id() -> str:
    return reservation_id_var.get()


def reset_reservation_id(token) -> None:
    reservation_id_var.reset(token)
