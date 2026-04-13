"use client";

import { getJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type { HousekeepingOverview, HousekeepingTask } from "@/lib/hms";

export async function fetchPmsTasks(propertyId: number = defaultHotelPropertyId, status?: string) {
  return getJson<HousekeepingTask[]>("/hms/pms/tasks", {
    params: { property_id: propertyId, status },
  });
}

export async function fetchPmsTaskOverview(propertyId: number = defaultHotelPropertyId) {
  return getJson<HousekeepingOverview>("/hms/pms/tasks/overview", {
    params: { property_id: propertyId },
  });
}

