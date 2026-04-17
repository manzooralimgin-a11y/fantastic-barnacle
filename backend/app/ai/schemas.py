from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AIConversationTurn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class HotelPropertySnapshot(BaseModel):
    property_id: int
    name: str
    timezone: str
    currency: str
    today: str
    tomorrow: str
    total_rooms: int
    occupied_rooms: int
    occupancy_pct: float
    arrivals_today: int
    checkouts_tomorrow: int
    revenue_today: float


class HotelSnapshotResponse(BaseModel):
    generated_at: datetime
    scope: dict[str, Any]
    summary: dict[str, Any]
    reservations: dict[str, Any]
    stays: dict[str, Any]
    rooms: dict[str, Any]
    folios: dict[str, Any]
    orders: dict[str, Any]
    housekeeping: dict[str, Any]
    properties: list[HotelPropertySnapshot]


class AIQueryRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    question: str = Field(min_length=1, max_length=4000)
    history: list[AIConversationTurn] = Field(default_factory=list, max_length=5)
    property_id: int | None = Field(default=None, gt=0)


class AIUsageSummary(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cached_input_tokens: int = 0
    reasoning_tokens: int = 0


class AIQueryResponse(BaseModel):
    question: str
    answer: str
    model: str
    route: str = "llm"
    route_confidence: float | None = None
    used_fallback: bool = False
    highlights: dict[str, Any] | None = None
    snapshot: HotelSnapshotResponse
    usage: AIUsageSummary | None = None
    latency_ms: int | None = None
    snapshot_latency_ms: int | None = None
    llm_latency_ms: int | None = None
    snapshot_cache_status: str | None = None
    retry_count: int = 0
    token_budget_remaining: int | None = None
    error: str | None = None
