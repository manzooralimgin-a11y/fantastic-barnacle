"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPmsBoard } from "@/features/hms/pms/api/rooms";
import { usePmsBoardStore } from "@/features/hms/pms/stores/pmsBoardStore";

export function useBoardData() {
  const startDate = usePmsBoardStore((state) => state.startDate);
  const days = usePmsBoardStore((state) => state.days);

  return useQuery({
    queryKey: ["pms", "board", startDate, days],
    queryFn: () => fetchPmsBoard(undefined, days, startDate),
  });
}

