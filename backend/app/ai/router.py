from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse

from app.ai.schemas import AIQueryRequest, AIQueryResponse, HotelSnapshotResponse
from app.ai.service import (
    answer_hotel_question,
    build_ai_user_context,
    get_ai_latency_metrics,
    get_hotel_snapshot,
    record_ai_query,
)
from app.database import get_db
from app.dependencies import get_current_tenant_user, get_optional_current_tenant_user

router = APIRouter()


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


@router.get("/hotel-snapshot", response_model=HotelSnapshotResponse)
async def hotel_snapshot(
    property_id: int | None = Query(default=None, gt=0),
    db: AsyncSession = Depends(get_db),
):
    snapshot, _cache_status, _latency_ms = await get_hotel_snapshot(db, property_id=property_id)
    return snapshot


@router.post("/query", response_model=AIQueryResponse)
async def ai_query(
    payload: AIQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_optional_current_tenant_user),
):
    user_context = await build_ai_user_context(db, current_user)
    result = await answer_hotel_question(
        db,
        question=payload.question,
        history=payload.history,
        property_id=payload.property_id,
        user_context=user_context,
    )
    await record_ai_query(
        db,
        result=result,
        user_id=getattr(current_user, "id", None),
    )
    return AIQueryResponse(
        question=result.question,
        answer=result.answer,
        model=result.model,
        route=result.route,
        route_confidence=result.route_confidence,
        used_fallback=result.used_fallback,
        highlights=result.highlights,
        snapshot=result.snapshot,
        usage=result.usage,
        latency_ms=result.latency_ms,
        snapshot_latency_ms=result.snapshot_latency_ms,
        llm_latency_ms=result.llm_latency_ms,
        snapshot_cache_status=result.snapshot_cache_status,
        retry_count=result.retry_count,
        token_budget_remaining=result.token_budget_remaining,
        error=result.error,
    )


@router.post("/query/stream")
async def ai_query_stream(
    payload: AIQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_optional_current_tenant_user),
):
    user_context = await build_ai_user_context(db, current_user)

    async def event_stream():
        yield _sse(
            "status",
            {
                "state": "started",
                "message": "Pulling the live hotel snapshot...",
            },
        )
        try:
            result = await answer_hotel_question(
                db,
                question=payload.question,
                history=payload.history,
                property_id=payload.property_id,
                user_context=user_context,
            )
            await record_ai_query(
                db,
                result=result,
                user_id=getattr(current_user, "id", None),
            )
            yield _sse(
                "result",
                AIQueryResponse(
                    question=result.question,
                    answer=result.answer,
                    model=result.model,
                    route=result.route,
                    route_confidence=result.route_confidence,
                    used_fallback=result.used_fallback,
                    highlights=result.highlights,
                    snapshot=result.snapshot,
                    usage=result.usage,
                    latency_ms=result.latency_ms,
                    snapshot_latency_ms=result.snapshot_latency_ms,
                    llm_latency_ms=result.llm_latency_ms,
                    snapshot_cache_status=result.snapshot_cache_status,
                    retry_count=result.retry_count,
                    token_budget_remaining=result.token_budget_remaining,
                    error=result.error,
                ).model_dump(mode="json"),
            )
        except Exception:
            yield _sse(
                "error",
                {
                    "error": "The live hotel assistant could not finish this request.",
                },
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/metrics")
async def ai_metrics(
    window_minutes: int = Query(default=60, ge=1, le=1440),
    _current_user=Depends(get_current_tenant_user),
):
    return await get_ai_latency_metrics(window_minutes=window_minutes)
