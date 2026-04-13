"use client";

import { getJson, postJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AvailableRoom = {
  room_id: number;
  room_number: string;
  room_type_id: number;
  room_type_name: string;
  max_occupancy: number;
  floor: number | null;
  status: string;
};

export type AvailabilityResult = {
  check_in: string;
  check_out: string;
  nights: number;
  pax: number;
  rooms: AvailableRoom[];
};

export type RatePlanQuote = {
  plan_id: number;
  plan_code: string;
  plan_name: string;
  avg_nightly_rate: number;
  total_price: number;
  nights: number;
  currency: string;
};

export type PricingQuoteResult = {
  check_in: string;
  check_out: string;
  nights: number;
  room_type_id: number;
  rate_plans: RatePlanQuote[];
};

export type HotelExtra = {
  id: number;
  property_id: number;
  name: string;
  unit_price: number;
  per_person: boolean;
  daily: boolean;
  is_active: boolean;
  sort_order: number;
};

export type GuestSearchResult = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
};

// ── Availability ──────────────────────────────────────────────────────────────

export async function fetchAvailability(
  checkIn: string,
  checkOut: string,
  pax: number,
  propertyId: number = defaultHotelPropertyId,
): Promise<AvailabilityResult> {
  return postJson<AvailabilityResult>("/hms/pms/inventory/availability", {
    check_in: checkIn,
    check_out: checkOut,
    pax,
    property_id: propertyId,
  });
}

// ── Pricing quote ─────────────────────────────────────────────────────────────

export async function fetchPricingQuote(
  checkIn: string,
  checkOut: string,
  roomTypeId: number,
  propertyId: number = defaultHotelPropertyId,
): Promise<PricingQuoteResult> {
  return postJson<PricingQuoteResult>("/hms/pms/pricing/quote", {
    check_in: checkIn,
    check_out: checkOut,
    room_type_id: roomTypeId,
    property_id: propertyId,
  });
}

// ── Extras ────────────────────────────────────────────────────────────────────

export async function fetchExtras(
  propertyId: number = defaultHotelPropertyId,
): Promise<HotelExtra[]> {
  return getJson<HotelExtra[]>("/hms/pms/inventory/extras", {
    params: { property_id: propertyId },
  });
}

// ── Guest search ──────────────────────────────────────────────────────────────

export async function searchGuests(
  query: string,
  propertyId: number = defaultHotelPropertyId,
): Promise<GuestSearchResult[]> {
  if (!query.trim()) return [];
  const contacts = await getJson<
    Array<{ id: number; name: string; email: string | null; phone: string | null }>
  >("/hms/pms/contacts", {
    params: { search: query, property_id: propertyId, limit: 10 },
  });
  return contacts.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
  }));
}

export async function moveHotelStay(
  stayId: number | string,
  payload: {
    room_id: number;
    notes?: string | null;
  },
  propertyId: number = defaultHotelPropertyId,
) {
  return postJson<{
    reservation_id: number;
    room_id: number | null;
    room_number: string | null;
    room_type_name: string | null;
    stay: {
      id: number;
      property_id: number;
      reservation_id: number;
      room_id: number | null;
      status: string;
      planned_check_in: string;
      planned_check_out: string;
      actual_check_in_at: string | null;
      actual_check_out_at: string | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    };
  }>(`/hms/stays/${stayId}/move`, payload, {
    params: { property_id: propertyId },
  });
}
