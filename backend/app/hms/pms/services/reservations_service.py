from datetime import date

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.hms.pms.services.billing_service import list_reservation_folios
from app.hms.pms.services.contacts_service import get_pms_contact
from app.hms.pms.services.documents_service import list_pms_documents
from app.hms.pms.services.tasks_service import list_pms_tasks
from app.hms.pms.repositories.reservations_repo import (
    get_reservation_with_relations,
    list_live_log_reservations,
    list_property_reservations,
)
from app.hms.pms.schemas.reservations import (
    PmsCockpitRead,
    PmsReservationSummaryRead,
    PmsReservationWorkspaceRead,
)
from app.hms.pms.selectors.cockpit_selectors import build_cockpit
from app.hms.pms.selectors.reservation_summary_selectors import build_reservation_summary
from app.hms.pms.schemas.tasks import PmsTaskRead
from app.hms.schemas import HotelDocumentRead, HotelFolioRead, HotelStayRead


def _serialize_read_model(value):
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return value
    return value


async def get_cockpit_read_model(
    db: AsyncSession,
    *,
    property_id: int,
    focus_date: date,
) -> PmsCockpitRead:
    reservations = await list_property_reservations(db, property_id=property_id)
    live_log = await list_live_log_reservations(db, property_id=property_id)
    return build_cockpit(
        property_id=property_id,
        focus_date=focus_date,
        reservations=reservations,
        live_log=live_log,
    )


async def get_reservation_summary(
    db: AsyncSession,
    *,
    property_id: int,
    reservation_id: int,
) -> PmsReservationSummaryRead:
    reservation = await get_reservation_with_relations(
        db,
        property_id=property_id,
        reservation_id=reservation_id,
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return build_reservation_summary(reservation)


async def get_reservation_workspace(
    db: AsyncSession,
    *,
    property_id: int,
    reservation_id: int,
    hotel_access,
) -> PmsReservationWorkspaceRead:
    reservation = await get_reservation_with_relations(
        db,
        property_id=property_id,
        reservation_id=reservation_id,
    )
    if reservation is None:
        raise HTTPException(status_code=404, detail="Reservation not found")

    reservation_summary = build_reservation_summary(reservation)
    stay_payload = (
        HotelStayRead.model_validate(reservation.stay).model_dump(mode="json")
        if reservation.stay is not None
        else {}
    )

    guests_payload: list[dict] = []
    if reservation.guest_id is not None:
        try:
            guest = await get_pms_contact(
                db,
                property_id=property_id,
                guest_id=reservation.guest_id,
            )
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
        else:
            guests_payload.append(_serialize_read_model(guest))

    reservation_folios = await list_reservation_folios(
        db,
        hotel_access=hotel_access,
        property_id=property_id,
        reservation_id=reservation.id,
    )
    folio_summary_payload = (
        HotelFolioRead.model_validate(reservation_folios[0]).model_dump(mode="json")
        if reservation_folios
        else {}
    )

    related_tasks = []
    if reservation.stay is not None and reservation.stay.room_id is not None:
        raw_tasks = await list_pms_tasks(
            db,
            property_id=property_id,
            status=None,
            room_id=reservation.stay.room_id,
        )
        related_tasks = [PmsTaskRead.model_validate(t).model_dump(mode="json") for t in raw_tasks]

    related_documents = [
        HotelDocumentRead.model_validate(document).model_dump(mode="json")
        for document in await list_pms_documents(
            db,
            hotel_access=hotel_access,
            property_id=property_id,
            document_kind=None,
            reservation_id=reservation.id,
            stay_id=reservation.stay.id if reservation.stay is not None else None,
            limit=200,
        )
    ]

    return PmsReservationWorkspaceRead(
        reservation=reservation_summary.model_dump(mode="json"),
        stay=stay_payload,
        guests=guests_payload,
        folio_summary=folio_summary_payload,
        tasks=related_tasks,
        documents=related_documents,
    )
