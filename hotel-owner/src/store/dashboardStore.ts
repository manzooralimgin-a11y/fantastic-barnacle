import { create } from "zustand";
import type { DashboardData } from "@/mock";
import { MOCK_DASHBOARD } from "@/mock";

interface DashboardState {
  data: DashboardData | null;
  isLoading: boolean;
  lastUpdated: Date | null;
  fetchDashboard: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  data: null,
  isLoading: false,
  lastUpdated: null,

  fetchDashboard: async () => {
    set({ isLoading: true });
    await new Promise((resolve) => setTimeout(resolve, 800));
    set({
      data: MOCK_DASHBOARD,
      isLoading: false,
      lastUpdated: new Date(),
    });
  },

  refreshDashboard: async () => {
    set({ isLoading: true });
    await new Promise((resolve) => setTimeout(resolve, 400));
    set({
      data: MOCK_DASHBOARD,
      isLoading: false,
      lastUpdated: new Date(),
    });
  },
}));
