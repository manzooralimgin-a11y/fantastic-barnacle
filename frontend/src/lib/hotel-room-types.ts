"use client";

import { getJson } from "@/lib/api";

export type HotelRoomTypeOption = {
  id: number;
  name: string;
  base_price: number;
  max_occupancy: number;
  room_type: string;
  room_count?: number;
};

export type HotelRoomItem = {
  id: string;
  number: string;
  room_type_name: string;
  status: "available" | "occupied" | "cleaning" | "maintenance";
};

const parsedDefaultHotelPropertyId = Number.parseInt(
  process.env.NEXT_PUBLIC_HOTEL_PROPERTY_ID || "1",
  10,
);
export const defaultHotelPropertyId = Number.isFinite(parsedDefaultHotelPropertyId) && parsedDefaultHotelPropertyId > 0
  ? parsedDefaultHotelPropertyId
  : 1;

export async function fetchHotelRoomTypes(propertyId: number = defaultHotelPropertyId): Promise<HotelRoomTypeOption[]> {
  return getJson<HotelRoomTypeOption[]>("/public/hotel/rooms", {
    params: { property_id: propertyId },
  });
}

export async function fetchHotelRooms(
  propertyId: number = defaultHotelPropertyId,
): Promise<HotelRoomItem[]> {
  const payload = await getJson<{ items?: HotelRoomItem[] } | HotelRoomItem[]>("/hms/rooms", {
    params: { property_id: propertyId },
  });
  return Array.isArray(payload) ? payload : payload.items || [];
}

export function buildRoomRateMap(roomTypes: HotelRoomTypeOption[]): Record<string, number> {
  return Object.fromEntries(roomTypes.map((roomType) => [roomType.name, roomType.base_price]));
}

export function defaultRoomTypeName(roomTypes: HotelRoomTypeOption[]): string {
  return roomTypes[0]?.name || "";
}
