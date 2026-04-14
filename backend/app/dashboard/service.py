import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.models import AgentAction
from app.dashboard.models import Alert, AuditEvent, DashboardQuery, KPISnapshot
from app.dashboard.schemas import (
    AlertUpdate,
    AuditTimelineEvent,
    ExceptionWorkflowUpdate,
    ExceptionInboxItem,
    ExplainableRecommendation,
    NLQueryRequest,
    NLQueryResponse,
    SLOBreach,
    SLODashboardResponse,
)
from app.hms.models import HotelReservation, HotelStay, HotelFolio, Room
from app.observability.metrics import api_metrics, get_queue_lag
from app.shared.audit import log_human_action

logger = logging.getLogger("app.observability")

SEVERITY_IMPACT_SCORE = {"critical": 95, "warning": 70, "info": 30}
SEVERITY_SLA_MINUTES = {"critical": 30, "warning": 120, "info": 480}
MODULE_OWNER = {
    "billing": "Finance",
    "inventory": "Supply",
    "reservations": "Service",
    "kitchen": "Kitchen",
    "workforce": "Operations",
    "marketing": "Growth",
}
MODULE_ACTIONS = {
    "billing": ["Verify check totals", "Review payment method fallback", "Confirm refund policy"],
    "inventory": ["Reorder critical items", "Contact primary vendor", "Enable emergency substitutes"],
    "reservations": ["Adjust table assignments", "Notify front-of-house lead", "Send proactive guest updates"],
    "kitchen": ["Rebalance station load", "Prioritize delayed tickets", "Trigger expo quality check"],
    "workforce": ["Reassign shift coverage", "Reduce idle time", "Confirm break compliance"],
    "marketing": ["Pause underperforming campaign", "Review target segment", "Deploy recovery offer"],
}


async def get_live_kpis(db: AsyncSession) -> list[KPISnapshot]:
    # Simplified query to avoid problematic distinct() with scalars in some SQLAlchemy versions
    result = await db.execute(
        select(KPISnapshot)
        .order_by(KPISnapshot.metric_name, KPISnapshot.timestamp.desc())
        .limit(100)
    )
    all_kpis = list(result.scalars().all())
    # Manual distinct by metric_name to ensure stability
    seen = set()
    distinct_kpis = []
    for kpi in all_kpis:
        if kpi.metric_name not in seen:
            seen.add(kpi.metric_name)
            distinct_kpis.append(kpi)
    return distinct_kpis


async def get_alerts(
    db: AsyncSession, is_read: bool | None = None, limit: int = 100
) -> list[Alert]:
    query = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if is_read is not None:
        query = query.where(Alert.is_read == is_read)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_alert(db: AsyncSession, alert_id: int, payload: AlertUpdate) -> Alert:
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found"
        )
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(alert, key, value)
    await db.flush()
    await db.refresh(alert)
    return alert


async def update_exception_workflow(
    db: AsyncSession,
    exception_id: int,
    payload: ExceptionWorkflowUpdate,
    actor_user_id: int | None = None,
) -> ExceptionInboxItem:
    result = await db.execute(select(Alert).where(Alert.id == exception_id))
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exception not found",
        )

    if payload.owner is not None:
        alert.owner = payload.owner
    if payload.sla_status is not None:
        alert.sla_status = payload.sla_status
    if payload.sla_minutes is not None:
        alert.sla_minutes = payload.sla_minutes
        alert.due_at = alert.created_at + timedelta(minutes=payload.sla_minutes)
    if payload.action_taken is not None:
        alert.action_taken = payload.action_taken

    if payload.status is not None:
        alert.status = payload.status
        if payload.status == "resolved":
            alert.is_read = True
            alert.resolved_at = datetime.now(timezone.utc)
            if actor_user_id:
                alert.resolved_by = actor_user_id
            if alert.sla_status != "breached":
                alert.sla_status = "resolved"
        else:
            alert.is_read = False
            alert.resolved_at = None
            alert.resolved_by = None
            if alert.sla_status == "resolved":
                alert.sla_status = "on_track"

    await log_human_action(
        db,
        action="exception_workflow_updated",
        detail=f"Exception #{alert.id} updated (status={alert.status}, owner={alert.owner}, sla_status={alert.sla_status})",
        entity_type=alert.module,
        entity_id=alert.id,
        source_module="dashboard",
        restaurant_id=None,
        actor_user_id=actor_user_id,
        metadata_json={
            "exception_id": alert.id,
            "status": alert.status,
            "owner": alert.owner,
            "sla_status": alert.sla_status,
        },
    )

    await db.flush()
    await db.refresh(alert)

    sev = (alert.severity or "info").lower()
    owner_name = alert.owner or MODULE_OWNER.get(alert.module, "Operations")
    return ExceptionInboxItem(
        id=alert.id,
        source_type="alert",
        module=alert.module,
        severity=sev,
        title=alert.title,
        message=alert.message,
        owner=owner_name,
        status=alert.status if alert.status else ("resolved" if alert.is_read else "open"),
        impact_score=SEVERITY_IMPACT_SCORE.get(sev, 30),
        sla_minutes=alert.sla_minutes or SEVERITY_SLA_MINUTES.get(sev, 480),
        sla_status=alert.sla_status or ("resolved" if alert.is_read else "on_track"),
        due_at=alert.due_at,
        recommended_actions=MODULE_ACTIONS.get(
            alert.module, ["Triage incident", "Assign owner", "Track resolution ETA"]
        ),
        created_at=alert.created_at,
    )


async def _fetch_hotel_snapshot(db: AsyncSession) -> dict:
    """Gather live hotel KPIs from the HMS tables for use in NL query answers."""
    today = date.today()

    # Occupancy: rooms in 'occupied' status
    room_counts = (
        await db.execute(
            select(Room.status, func.count(Room.id)).group_by(Room.status)
        )
    ).all()
    counts_by_status = {s: c for s, c in room_counts}
    total_rooms = sum(counts_by_status.values()) or 1
    occupied = counts_by_status.get("occupied", 0)
    cleaning = counts_by_status.get("cleaning", 0)
    available = counts_by_status.get("available", total_rooms - occupied - cleaning)
    occupancy_pct = round(occupied / total_rooms * 100, 1)

    # Today's arrivals / departures / in-house
    arrivals_today = (
        await db.execute(
            select(func.count(HotelReservation.id)).where(
                HotelReservation.check_in == today,
                HotelReservation.status.in_(["confirmed", "checked_in"]),
            )
        )
    ).scalar() or 0

    departures_today = (
        await db.execute(
            select(func.count(HotelReservation.id)).where(
                HotelReservation.check_out == today,
                HotelReservation.status.in_(["confirmed", "checked_in", "checked_out"]),
            )
        )
    ).scalar() or 0

    in_house = (
        await db.execute(
            select(func.count(HotelStay.id)).where(
                HotelStay.status == "checked_in",
            )
        )
    ).scalar() or 0

    # Pending bookings (awaiting confirmation)
    pending_bookings = (
        await db.execute(
            select(func.count(HotelReservation.id)).where(
                HotelReservation.status == "pending",
            )
        )
    ).scalar() or 0

    # Revenue: sum of all outstanding folio balances
    revenue_outstanding = (
        await db.execute(
            select(func.coalesce(func.sum(HotelFolio.balance_due), 0.0))
        )
    ).scalar() or 0.0

    return {
        "total_rooms": total_rooms,
        "occupied": occupied,
        "available": available,
        "cleaning": cleaning,
        "occupancy_pct": occupancy_pct,
        "arrivals_today": arrivals_today,
        "departures_today": departures_today,
        "in_house": in_house,
        "pending_bookings": pending_bookings,
        "revenue_outstanding": float(revenue_outstanding),
        "date": today.isoformat(),
    }


def _build_nl_answer(query: str, snapshot: dict) -> tuple[str, dict]:
    """
    Rule-based NL answer built from live backend data.
    Returns (answer_text, structured_data).
    """
    q = query.lower()

    occ = snapshot["occupancy_pct"]
    occupied = snapshot["occupied"]
    total = snapshot["total_rooms"]
    arrivals = snapshot["arrivals_today"]
    departures = snapshot["departures_today"]
    in_house = snapshot["in_house"]
    pending = snapshot["pending_bookings"]
    revenue = snapshot["revenue_outstanding"]

    if any(kw in q for kw in ("buchung", "booking", "ankunft", "arrival", "check-in", "checkin")):
        answer = (
            f"Heute: {arrivals} Ankünfte, {departures} Abreisen, {in_house} Gäste im Haus. "
            f"{pending} Buchungen warten auf Bestätigung."
        )
        data = {
            "type": "stat",
            "arrivals": arrivals,
            "departures": departures,
            "in_house": in_house,
            "pending": pending,
        }

    elif any(kw in q for kw in ("revenue", "umsatz", "einnahmen", "geld")):
        answer = (
            f"Offene Foliobeträge gesamt: €{revenue:,.2f}. "
            f"Belegung heute: {occupied}/{total} Zimmer ({occ}%)."
        )
        data = {
            "type": "stat",
            "revenue_outstanding": revenue,
            "occupancy_pct": occ,
        }

    elif any(kw in q for kw in ("occupancy", "belegung", "zimmer", "room", "verfügbar", "available")):
        available = snapshot["available"]
        cleaning = snapshot["cleaning"]
        answer = (
            f"Belegung: {occupied}/{total} Zimmer ({occ}%). "
            f"Verfügbar: {available}, Reinigung: {cleaning}."
        )
        data = {
            "type": "stat",
            "occupied": occupied,
            "available": available,
            "cleaning": cleaning,
            "total": total,
            "occupancy_pct": occ,
        }

    elif any(kw in q for kw in ("pending", "ausstehend", "warten", "bestätigung")):
        answer = f"{pending} Buchungen warten auf Bestätigung. {arrivals} Ankünfte heute."
        data = {"type": "stat", "pending": pending, "arrivals_today": arrivals}

    else:
        answer = (
            f"Stand {snapshot['date']}: {occupied}/{total} Zimmer belegt ({occ}%), "
            f"{arrivals} Ankünfte heute, {departures} Abreisen, "
            f"{pending} offene Buchungsanfragen."
        )
        data = snapshot

    return answer, data


async def process_nl_query(db: AsyncSession, payload: NLQueryRequest) -> NLQueryResponse:
    try:
        snapshot = await _fetch_hotel_snapshot(db)
        answer, data = _build_nl_answer(payload.query, snapshot)
    except Exception as exc:
        logger.warning("NL query data fetch failed: %s", exc)
        answer = "Konnte keine aktuellen Hoteldaten abrufen. Bitte Backend-Verbindung prüfen."
        data = None

    query_record = DashboardQuery(
        query_text=payload.query,
        ai_response=answer,
    )
    db.add(query_record)
    await db.flush()

    return NLQueryResponse(
        query=payload.query,
        answer=answer,
        data=data,
    )


async def get_recent_agent_activity(db: AsyncSession, limit: int = 20) -> list[AgentAction]:
    result = await db.execute(
        select(AgentAction)
        .order_by(AgentAction.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_kpi_history(
    db: AsyncSession, metric_name: str | None = None, limit: int = 100
) -> list[KPISnapshot]:
    query = select(KPISnapshot).order_by(KPISnapshot.timestamp.desc()).limit(limit)
    if metric_name:
        query = query.where(KPISnapshot.metric_name == metric_name)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_exception_inbox(
    db: AsyncSession,
    severity: str | None = None,
    status_filter: str = "open",
    owner: str | None = None,
    limit: int = 100,
) -> list[ExceptionInboxItem]:
    query = select(Alert).order_by(Alert.created_at.desc()).limit(limit)
    if severity:
        query = query.where(Alert.severity == severity)

    result = await db.execute(query)
    alerts = list(result.scalars().all())

    items: list[ExceptionInboxItem] = []
    for alert in alerts:
        owner_name = alert.owner or MODULE_OWNER.get(alert.module, "Operations")
        if owner and owner_name.lower() != owner.lower():
            continue

        status_value = alert.status if alert.status else ("resolved" if alert.is_read else "open")
        if status_filter != "all":
            if status_filter == "open" and status_value == "resolved":
                continue
            if status_filter == "resolved" and status_value != "resolved":
                continue

        sev = (alert.severity or "info").lower()
        sla_minutes = alert.sla_minutes or SEVERITY_SLA_MINUTES.get(sev, 480)
        items.append(
            ExceptionInboxItem(
                id=alert.id,
                source_type="alert",
                module=alert.module,
                severity=sev,
                title=alert.title,
                message=alert.message,
                owner=owner_name,
                status=status_value,
                impact_score=SEVERITY_IMPACT_SCORE.get(sev, 30),
                sla_minutes=sla_minutes,
                sla_status=alert.sla_status or ("resolved" if status_value == "resolved" else "on_track"),
                due_at=alert.due_at,
                recommended_actions=MODULE_ACTIONS.get(
                    alert.module, ["Triage incident", "Assign owner", "Track resolution ETA"]
                ),
                created_at=alert.created_at,
            )
        )
    return items


def _extract_rationale(action: AgentAction) -> str:
    if isinstance(action.output_data, dict):
        val = action.output_data.get("reasoning") or action.output_data.get("rationale")
        if isinstance(val, str) and val.strip():
            return val.strip()
    if isinstance(action.input_data, dict):
        trigger = action.input_data.get("trigger")
        if isinstance(trigger, str) and trigger.strip():
            return f"Triggered by: {trigger.strip()}"
    return "Derived from live operational signals and policy guardrails."


def _extract_estimated_impact(action: AgentAction) -> str | None:
    if isinstance(action.output_data, dict):
        impact = action.output_data.get("impact") or action.output_data.get("estimated_impact")
        if isinstance(impact, str) and impact.strip():
            return impact.strip()
        if isinstance(impact, (int, float)):
            return f"{impact}"
    action_type = (action.action_type or "").lower()
    if "inventory" in action_type:
        return "Reduce stockout risk and emergency ordering cost."
    if "billing" in action_type or "finance" in action_type:
        return "Protect margin and reduce payment leakage."
    if "guest" in action_type or "reservation" in action_type:
        return "Improve guest satisfaction and service throughput."
    return None


def _extract_entity_ref(action: AgentAction) -> tuple[str | None, int | None]:
    for payload in (action.input_data, action.output_data):
        if not isinstance(payload, dict):
            continue
        entity_type = payload.get("entity_type")
        entity_id = payload.get("entity_id")
        if isinstance(entity_type, str) and isinstance(entity_id, int):
            return entity_type, entity_id
    return None, None


async def get_explainable_recommendations(
    db: AsyncSession,
    status_filter: str | None = None,
    limit: int = 20,
) -> list[ExplainableRecommendation]:
    query = select(AgentAction).order_by(AgentAction.created_at.desc()).limit(limit)
    if status_filter:
        query = query.where(AgentAction.status == status_filter)

    result = await db.execute(query)
    actions = list(result.scalars().all())
    recommendations: list[ExplainableRecommendation] = []
    for action in actions:
        rollback_strategy = (
            "Use approve/revert controls to restore previous state."
            if action.status in {"executed", "approved"}
            else "No rollback needed until action is executed."
        )
        recommendations.append(
            ExplainableRecommendation(
                id=action.id,
                agent_name=action.agent_name,
                title=action.action_type.replace("_", " ").title(),
                recommendation=action.description,
                rationale=_extract_rationale(action),
                confidence=action.confidence,
                estimated_impact=_extract_estimated_impact(action),
                requires_approval=action.requires_approval,
                rollback_strategy=rollback_strategy,
                status=action.status,
                created_at=action.created_at,
            )
        )
    return recommendations


async def get_audit_timeline(
    db: AsyncSession,
    entity_type: str | None = None,
    entity_id: int | None = None,
    limit: int = 50,
) -> list[AuditTimelineEvent]:
    events: list[AuditTimelineEvent] = []

    event_result = await db.execute(
        select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit * 3)
    )
    audit_events = list(event_result.scalars().all())
    for event in audit_events:
        if entity_type and event.entity_type and event.entity_type != entity_type:
            continue
        if entity_id and event.entity_id and event.entity_id != entity_id:
            continue
        events.append(
            AuditTimelineEvent(
                id=f"audit-{event.id}",
                event_type="human_action",
                actor_type=event.actor_type,
                actor_name=event.actor_name,
                entity_type=event.entity_type,
                entity_id=event.entity_id,
                action=event.action,
                detail=event.detail,
                created_at=event.created_at,
            )
        )

    action_result = await db.execute(
        select(AgentAction).order_by(AgentAction.created_at.desc()).limit(limit * 2)
    )
    actions = list(action_result.scalars().all())
    for action in actions:
        ref_type, ref_id = _extract_entity_ref(action)
        if entity_type and ref_type and ref_type != entity_type:
            continue
        if entity_id and ref_id and ref_id != entity_id:
            continue
        events.append(
            AuditTimelineEvent(
                id=f"agent-{action.id}",
                event_type="agent_action",
                actor_type="agent",
                actor_name=action.agent_name,
                entity_type=ref_type,
                entity_id=ref_id,
                action=action.action_type,
                detail=action.description,
                created_at=action.created_at,
            )
        )

    alert_result = await db.execute(select(Alert).order_by(Alert.created_at.desc()).limit(limit * 2))
    alerts = list(alert_result.scalars().all())
    for alert in alerts:
        if entity_type and alert.module != entity_type:
            continue
        events.append(
            AuditTimelineEvent(
                id=f"alert-{alert.id}",
                event_type="alert",
                actor_type="system",
                actor_name="System Alert Engine",
                entity_type=alert.module,
                entity_id=None,
                action=alert.status or ("alert_raised" if not alert.is_read else "alert_resolved"),
                detail=alert.title,
                created_at=alert.created_at,
            )
        )

    events.sort(key=lambda event: event.created_at, reverse=True)
    return events[:limit]


async def get_slo_dashboard(window_minutes: int = 15) -> SLODashboardResponse:
    snapshot = await api_metrics.snapshot(window_minutes=window_minutes)
    queue_lag = await get_queue_lag()
    thresholds = {
        "api_p95_latency_ms": float(settings.slo_api_p95_ms_threshold),
        "api_error_rate_pct": float(settings.slo_error_rate_pct_threshold),
        "queue_lag": float(settings.slo_queue_lag_threshold),
    }

    breaches: list[SLOBreach] = []
    if snapshot["p95_latency_ms"] > thresholds["api_p95_latency_ms"]:
        breaches.append(
            SLOBreach(
                metric="api_p95_latency_ms",
                threshold=thresholds["api_p95_latency_ms"],
                actual=float(snapshot["p95_latency_ms"]),
                severity="critical",
                message="API p95 latency exceeded threshold",
            )
        )
    if snapshot["error_rate_pct"] > thresholds["api_error_rate_pct"]:
        breaches.append(
            SLOBreach(
                metric="api_error_rate_pct",
                threshold=thresholds["api_error_rate_pct"],
                actual=float(snapshot["error_rate_pct"]),
                severity="critical",
                message="API error rate exceeded threshold",
            )
        )
    if queue_lag is not None and queue_lag > thresholds["queue_lag"]:
        breaches.append(
            SLOBreach(
                metric="queue_lag",
                threshold=thresholds["queue_lag"],
                actual=float(queue_lag),
                severity="warning",
                message="Background queue lag exceeded threshold",
            )
        )

    if breaches:
        logger.warning(
            "slo_threshold_breach",
            extra={
                "event": "slo_threshold_breach",
                "breaches": [b.model_dump() for b in breaches],
                "window_minutes": window_minutes,
            },
        )

    return SLODashboardResponse(
        window_minutes=window_minutes,
        api_p95_latency_ms=float(snapshot["p95_latency_ms"]),
        api_error_rate_pct=float(snapshot["error_rate_pct"]),
        queue_lag=queue_lag,
        thresholds=thresholds,
        breaches=breaches,
    )
