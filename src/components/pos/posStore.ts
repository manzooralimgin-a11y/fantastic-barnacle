'use client';

import { create } from 'zustand';

type ActiveDomain = 'gastronomy' | 'management';

interface POSUIState {
  sidebarCollapsed: boolean;
  activeDomain: ActiveDomain;
  toggleSidebar: () => void;
  setActiveDomain: (domain: ActiveDomain) => void;
}

export const usePOSStore = create<POSUIState>((set) => ({
  sidebarCollapsed: true,
  activeDomain: 'gastronomy',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setActiveDomain: (domain) => set({ activeDomain: domain }),
}));
