"use client";

import api, { getApiErrorMessage, getJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type {
  PmsCockpit,
  PmsReservationSummary,
  PmsReservationWorkspace,
  ReservationFormValues,
} from "@/features/hms/pms/schemas/reservation";

export const PMS_RESERVATIONS_REFRESH_EVENT = "pms:reservations:refresh";

export function emitPmsReservationsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PMS_RESERVATIONS_REFRESH_EVENT));
  }
}

export async function fetchPmsReservationSummary(
  reservationId: number | string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsReservationSummary>(`/hms/pms/reservations/${reservationId}/summary`, {
    params: { property_id: propertyId },
  });
}

export async function fetchPmsReservationWorkspace(
  reservationId: number | string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsReservationWorkspace>(`/hms/pms/reservations/${reservationId}/workspace`, {
    params: { property_id: propertyId },
  });
}

export async function fetchPmsCockpit(
  propertyId: number = defaultHotelPropertyId,
  focusDate?: string,
) {
  return getJson<PmsCockpit>("/hms/pms/cockpit", {
    params: { property_id: propertyId, focus_date: focusDate },
  });
}

export async function createHotelReservationFromForm(
  values: ReservationFormValues,
  propertyId: number = defaultHotelPropertyId,
  extras?: { color_tag?: string | null; booking_source?: string | null },
) {
  const payload = {
    kind: "hotel",
    property_id: propertyId,
    guest_name: values.guest_name,
    guest_email: values.email || null,
    phone: values.phone || null,
    anrede: values.anrede || null,
    room: values.room || null,
    room_type_label: values.room_type,
    check_in: values.check_in,
    check_out: values.check_out,
    adults: Number(values.adults),
    children: Number(values.children),
    special_requests: values.special_requests || null,
    zahlungs_methode: values.zahlungs_methode || null,
    zahlungs_status: values.zahlungs_status || "offen",
    status: "confirmed",
    booking_id_prefix: "BK",
    color_tag: extras?.color_tag ?? null,
    booking_source: extras?.booking_source ?? null,
  };
  try {
    const response = await api.post("/hms/reservations", payload);
    return response.data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(
        error,
        "Reservation could not be created. Please review room availability and the selected dates.",
      ),
    );
  }
}

export async function updateHotelReservationFromForm(
  reservationId: number | string,
  values: ReservationFormValues,
) {
  const payload = {
    guest_name: values.guest_name,
    email: values.email || null,
    phone: values.phone || null,
    anrede: values.anrede || null,
    room_type: values.room_type || null,
    room: values.room || null,
    check_in: values.check_in,
    check_out: values.check_out,
    adults: Number(values.adults),
    children: Number(values.children),
    special_requests: values.special_requests || null,
    zahlungs_methode: values.zahlungs_methode || null,
    zahlungs_status: values.zahlungs_status || "offen",
  };
  const response = await api.put(`/hms/reservations/${reservationId}`, payload);
  return response.data;
}

export async function patchHotelReservation(
  reservationId: number | string,
  payload: Record<string, unknown>,
) {
  const response = await api.put(`/hms/reservations/${reservationId}`, payload);
  return response.data as PmsReservationSummary;
}

export async function checkInHotelReservation(reservationId: number | string) {
  return patchHotelReservation(reservationId, { status: "checked_in" });
}

export async function syncPmsReservationGuest(
  reservationId: number | string,
  propertyId: number = defaultHotelPropertyId,
): Promise<{ guest_id: number; name: string | null; email: string | null; phone: string | null; salutation: string | null }> {
  const response = await api.post(
    `/hms/pms/reservations/${reservationId}/sync-guest`,
    null,
    { params: { property_id: propertyId } },
  );
  return response.data as { guest_id: number; name: string | null; email: string | null; phone: string | null; salutation: string | null };
}
