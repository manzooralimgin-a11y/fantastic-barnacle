from app.hms.models import HotelReservation
from app.hms.pms.schemas.reservations import PmsReservationSummaryRead


def build_reservation_summary(reservation: HotelReservation) -> PmsReservationSummaryRead:
    folio = reservation.folio
    stay = reservation.stay
    invoice_state = None
    if folio is not None:
        if float(folio.balance_due or 0) <= 0:
            invoice_state = "paid"
        else:
            invoice_state = folio.status
    return PmsReservationSummaryRead(
        reservation_id=reservation.id,
        property_id=reservation.property_id,
        booking_id=reservation.booking_id,
        guest_name=reservation.guest_name,
        guest_email=reservation.guest_email,
        guest_phone=reservation.guest_phone or reservation.phone,
        guest_id=reservation.guest_id,
        anrede=reservation.anrede,
        status=reservation.status,
        room=reservation.room,
        room_type_label=reservation.room_type_label,
        check_in=reservation.check_in,
        check_out=reservation.check_out,
        adults=reservation.adults,
        children=reservation.children,
        total_amount=float(reservation.total_amount or 0),
        currency=reservation.currency,
        payment_status=reservation.payment_status,
        invoice_state=invoice_state,
        folio_id=folio.id if folio else None,
        folio_number=folio.folio_number if folio else None,
        folio_balance_due=float(folio.balance_due or 0) if folio else None,
        stay_id=stay.id if stay else None,
        stay_status=stay.status if stay else None,
        booking_source=getattr(reservation, "booking_source", None),
        color_tag=getattr(reservation, "color_tag", None),
        special_requests=getattr(reservation, "special_requests", None),
        zahlungs_methode=getattr(reservation, "zahlungs_methode", None),
        zahlungs_status=getattr(reservation, "zahlungs_status", None),
        quick_actions=["edit", "guest.details", "payments", "tasks", "documents"],
    )
