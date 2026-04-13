import { addDays, format } from "date-fns";
import { create } from "zustand";

type PmsBoardState = {
  startDate: string;
  days: number;
  setStartDate: (startDate: string) => void;
  setDays: (days: number) => void;
  shiftWindow: (direction: "previous" | "next") => void;
};

export const usePmsBoardStore = create<PmsBoardState>((set, get) => ({
  startDate: format(new Date(), "yyyy-MM-dd"),
  days: 14,
  setStartDate: (startDate) => set({ startDate }),
  setDays: (days) => set({ days }),
  shiftWindow: (direction) => {
    const current = new Date(get().startDate);
    const offset = direction === "next" ? get().days : -get().days;
    set({ startDate: format(addDays(current, offset), "yyyy-MM-dd") });
  },
}));

