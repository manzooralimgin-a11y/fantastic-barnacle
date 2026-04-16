from datetime import date

from app.hms.models import HotelReservation
from app.hms.pms.schemas.reservations import PmsCockpitItemRead, PmsCockpitRead


def _to_item(reservation: HotelReservation) -> PmsCockpitItemRead:
    return PmsCockpitItemRead(
        reservation_id=reservation.id,
        booking_id=reservation.booking_id,
        guest_name=reservation.guest_name,
        status=reservation.status,
        room=reservation.room,
        room_type_label=reservation.room_type_label,
        check_in=reservation.check_in,
        check_out=reservation.check_out,
        adults=reservation.adults,
        children=reservation.children,
        total_amount=float(reservation.total_amount or 0),
        payment_status=reservation.payment_status,
        folio_status=reservation.folio.status if reservation.folio else None,
        stay_status=reservation.stay.status if reservation.stay else None,
    )


def build_cockpit(
    *,
    property_id: int,
    focus_date: date,
    reservations: list[HotelReservation],
    live_log: list[HotelReservation],
) -> PmsCockpitRead:
    arrivals: list[PmsCockpitItemRead] = []
    in_house: list[PmsCockpitItemRead] = []
    departures: list[PmsCockpitItemRead] = []
    future_reservations: list[PmsCockpitItemRead] = []

    for reservation in reservations:
        if reservation.status == "cancelled":
            continue
        item = _to_item(reservation)
        is_checked_in = reservation.status == "checked_in"

        # Arrivals vs In-House are mutually exclusive:
        #  • A reservation is an arrival while status != checked_in.
        #  • Once checked in (and still within the stay window), it's in-house.
        if reservation.check_in == focus_date and not is_checked_in:
            arrivals.append(item)
        elif (
            is_checked_in
            and reservation.check_in <= focus_date < reservation.check_out
        ):
            in_house.append(item)

        if reservation.check_out == focus_date:
            departures.append(item)
        # Future reservations = strictly after today (today's arrivals already
        # live in `arrivals`, so avoid double-counting them here).
        if reservation.check_in > focus_date:
            future_reservations.append(item)

    return PmsCockpitRead(
        property_id=property_id,
        focus_date=focus_date,
        arrivals=arrivals,
        in_house=in_house,
        departures=departures,
        reservations=future_reservations,
        live_log=[_to_item(item) for item in live_log],
    )

