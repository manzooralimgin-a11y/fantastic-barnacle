import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setSidebarMobileOpen: (v: boolean) => void;
  initFromStorage: () => void;
}

// sidebarCollapsed always starts as false (SSR-safe).
// The protected layouts call initFromStorage() inside a useEffect after
// hydration so the server and client render the same initial state, preventing
// the React 19 hydration mismatch that surfaces as a hard runtime error.
export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarMobileOpen: false,

  initFromStorage: () => {
    const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      if (typeof window !== "undefined") {
        localStorage.setItem("sidebar-collapsed", String(next));
      }
      return { sidebarCollapsed: next };
    }),

  setSidebarCollapsed: (v: boolean) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sidebar-collapsed", String(v));
    }
    set({ sidebarCollapsed: v });
  },

  setSidebarMobileOpen: (v: boolean) => set({ sidebarMobileOpen: v }),
}));
