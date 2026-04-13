"use client";

import api, { getJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type { PmsContact } from "@/features/hms/pms/schemas/contact";

export async function fetchPmsContact(guestId: number | string, propertyId: number = defaultHotelPropertyId) {
  return getJson<PmsContact>(`/hms/pms/contacts/${guestId}`, {
    params: { property_id: propertyId },
  });
}

export async function updatePmsContact(
  guestId: number | string,
  payload: Record<string, unknown>,
  propertyId: number = defaultHotelPropertyId,
) {
  const response = await api.patch(`/hms/pms/contacts/${guestId}`, payload, {
    params: { property_id: propertyId },
  });
  return response.data as PmsContact;
}

