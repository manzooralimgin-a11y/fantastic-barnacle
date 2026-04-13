"use client";

import { getJson, postJson, putJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type { PmsRateMatrix, PmsRatePlan, PmsRateSeason } from "@/features/hms/pms/schemas/revenue";

export async function fetchPmsRateSeasons(
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsRateSeason[]>("/hms/pms/revenue/seasons", {
    params: { property_id: propertyId },
  });
}

export async function createPmsRateSeason(
  payload: {
    name: string;
    start_date: string;
    end_date: string;
    color_hex?: string | null;
    is_active?: boolean;
  },
  propertyId: number = defaultHotelPropertyId,
) {
  return postJson<PmsRateSeason>("/hms/pms/revenue/seasons", payload, {
    params: { property_id: propertyId },
  });
}

export async function fetchPmsRatePlans(
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsRatePlan[]>("/hms/pms/revenue/plans", {
    params: { property_id: propertyId },
  });
}

export async function createPmsRatePlan(
  payload: {
    room_type_id: number;
    code: string;
    name: string;
    currency?: string;
    base_price?: number | null;
    is_active?: boolean;
  },
  propertyId: number = defaultHotelPropertyId,
) {
  return postJson<PmsRatePlan>("/hms/pms/revenue/plans", payload, {
    params: { property_id: propertyId },
  });
}

export async function fetchPmsRateMatrix(
  planId: number | string,
  params: { start_date?: string; days?: number } = {},
) {
  return getJson<PmsRateMatrix>(`/hms/pms/revenue/plans/${planId}/matrix`, {
    params,
  });
}

export async function updatePmsRateMatrix(
  planId: number | string,
  items: Array<{
    rate_date: string;
    price: number;
    closed: boolean;
    closed_to_arrival: boolean;
    closed_to_departure: boolean;
    min_stay: number | null;
    max_stay: number | null;
    notes?: string | null;
  }>,
) {
  return putJson<PmsRateMatrix>(`/hms/pms/revenue/plans/${planId}/matrix`, {
    items,
  });
}
