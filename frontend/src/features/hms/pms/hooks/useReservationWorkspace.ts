"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPmsReservationWorkspace } from "@/features/hms/pms/api/reservations";

export function useReservationWorkspace(reservationId: number | string | null) {
  return useQuery({
    queryKey: ["pms", "reservation-workspace", reservationId],
    queryFn: () => fetchPmsReservationWorkspace(reservationId as number | string),
    enabled: Boolean(reservationId),
  });
}
