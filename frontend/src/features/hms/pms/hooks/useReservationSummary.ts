"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPmsReservationSummary } from "@/features/hms/pms/api/reservations";

export function useReservationSummary(reservationId: number | string | null) {
  return useQuery({
    queryKey: ["pms", "reservation-summary", reservationId],
    queryFn: () => fetchPmsReservationSummary(reservationId as number | string),
    enabled: Boolean(reservationId),
  });
}

