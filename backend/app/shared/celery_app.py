from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery = Celery(
    "gestronomy",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

_beat_schedule: dict = {
    "reservation-reconciliation": {
        "task": "reservations.reconcile_recent_reservations",
        "schedule": crontab(minute=f"*/{max(settings.reservation_reconciliation_interval_minutes, 1)}"),
        "args": (settings.reservation_reconciliation_lookback_hours,),
    },
}

if settings.imap_host and settings.imap_username and settings.imap_password:
    _beat_schedule["email-imap-poll"] = {
        "task": "email_inbox.poll_imap_inbox",
        "schedule": max(settings.imap_poll_interval_seconds, 60),
    }

celery.conf.update(
    timezone="UTC",
    result_serializer="json",
    accept_content=["json"],
    task_serializer="json",
    beat_schedule=_beat_schedule,
)

celery.autodiscover_tasks([
    "app.accounting",
    "app.auth",
    "app.core",
    "app.dashboard",
    "app.digital_twin",
    "app.email_inbox",
    "app.food_safety",
    "app.forecasting",
    "app.franchise",
    "app.guests",
    "app.inventory",
    "app.integrations",
    "app.maintenance",
    "app.marketing",
    "app.reservations",
    "app.vision",
    "app.websockets",
    "app.workforce",
])
