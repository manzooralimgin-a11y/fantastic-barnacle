from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.service import answer_hotel_question, build_ai_user_context, record_ai_query
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_tenant_user

router = APIRouter()

OPENAI_REALTIME_CLIENT_SECRET_URL = "https://api.openai.com/v1/realtime/client_secrets"
REALTIME_MODEL = "gpt-4o-realtime-preview"
REALTIME_PCM_RATE = 24000
REALTIME_INSTRUCTIONS = (
    "You are a helpful voice assistant connected to backend data."
)


class RealtimeTokenResponse(BaseModel):
    value: str
    expires_at: int | None = None
    session: dict[str, Any]


class RealtimeToolRequest(BaseModel):
    name: Literal["query_backend"]
    arguments: dict[str, Any] = Field(default_factory=dict)


class QueryBackendArguments(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    query: str = Field(min_length=1, max_length=4000)


class RealtimeToolResponse(BaseModel):
    tool_name: str
    result: dict[str, Any]


@router.get("/token", response_model=RealtimeTokenResponse)
async def create_realtime_client_secret(
    _current_user=Depends(get_current_tenant_user),
):
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OPENAI_API_KEY is not configured",
        )

    payload = {
        "session": {
            "type": "realtime",
            "model": REALTIME_MODEL,
            "instructions": REALTIME_INSTRUCTIONS,
            "output_modalities": ["audio"],
            "audio": {
                "input": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": REALTIME_PCM_RATE,
                    },
                    "turn_detection": None,
                },
                "output": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": REALTIME_PCM_RATE,
                    },
                    "voice": "alloy",
                },
            },
        }
    }
    headers = {
        "Authorization": f"Bearer {settings.openai_api_key}",
        "Content-Type": "application/json",
    }
    timeout = httpx.Timeout(15.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                OPENAI_REALTIME_CLIENT_SECRET_URL,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text or "OpenAI rejected the realtime token request."
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=detail,
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create a realtime client secret.",
        ) from exc

    data = response.json()
    # OpenAI /v1/realtime/client_secrets returns { value, expires_at, session }
    # at the top level. Older SDK shapes nested it under client_secret — accept
    # both so we don't break on either response shape.
    client_secret = data.get("client_secret") if isinstance(data.get("client_secret"), dict) else {}
    value = data.get("value") or client_secret.get("value")

    if not isinstance(value, str) or not value:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenAI did not return a realtime client secret.",
        )

    expires_at = data.get("expires_at") or client_secret.get("expires_at")
    session = data.get("session")

    if not isinstance(session, dict):
        session = payload["session"]

    return RealtimeTokenResponse(
        value=value,
        expires_at=int(expires_at) if expires_at is not None else None,
        session=session,
    )


@router.post("/tool", response_model=RealtimeToolResponse)
async def run_realtime_tool(
    payload: RealtimeToolRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_tenant_user),
):
    # Restrict execution to the known backend-query tool and validate the
    # payload so the realtime client cannot trigger arbitrary code paths.
    if payload.name != "query_backend":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported realtime tool.",
        )

    tool_args = QueryBackendArguments.model_validate(payload.arguments)
    user_context = await build_ai_user_context(db, current_user)
    result = await answer_hotel_question(
        db,
        question=tool_args.query,
        history=[],
        user_context=user_context,
    )
    await record_ai_query(
        db,
        result=result,
        user_id=getattr(current_user, "id", None),
    )

    return RealtimeToolResponse(
        tool_name=payload.name,
        result={
            "question": result.question,
            "answer": result.answer,
            "route": result.route,
            "route_confidence": result.route_confidence,
            "used_fallback": result.used_fallback,
            "highlights": result.highlights,
            "snapshot_summary": result.snapshot.summary,
            "latency_ms": result.latency_ms,
            "error": result.error,
        },
    )
