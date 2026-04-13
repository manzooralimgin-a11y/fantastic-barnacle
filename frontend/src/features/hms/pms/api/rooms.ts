"use client";

import { getJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type { HotelRoomBoard } from "@/lib/hms";

export async function fetchPmsBoard(
  propertyId: number = defaultHotelPropertyId,
  days = 14,
  startDate?: string,
) {
  return getJson<HotelRoomBoard>("/hms/pms/board", {
    params: {
      property_id: propertyId,
      days,
      start_date: startDate,
    },
  });
}

