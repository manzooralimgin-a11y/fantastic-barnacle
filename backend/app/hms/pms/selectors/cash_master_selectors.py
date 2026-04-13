from app.hms.models import HotelFolio


def build_cash_master_totals(folios: list[HotelFolio]) -> dict[str, float]:
    turnover_total = sum(float(folio.total or 0) for folio in folios)
    balance_due_total = sum(float(folio.balance_due or 0) for folio in folios)
    collected_total = sum(
        float(payment.amount or 0)
        for folio in folios
        for payment in folio.payments
    )
    return {
        "turnover_total": turnover_total,
        "balance_due_total": balance_due_total,
        "collected_total": collected_total,
    }

