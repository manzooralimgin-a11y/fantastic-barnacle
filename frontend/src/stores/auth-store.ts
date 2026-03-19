import { create } from "zustand";
import type { User } from "@/lib/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  activeSection: "gestronomy" | "management";
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setActiveSection: (section: "gestronomy" | "management") => void;
  clear: () => void;
}

// Always initialize token/section as null/default — never read localStorage at
// module load time. Next.js server-renders "use client" components too, so
// reading localStorage during store creation causes a server/client mismatch
// that React 19 surfaces as a hard hydration runtime error. The dashboard
// layout initialises these values from localStorage inside a useEffect (after
// hydration) to keep both renders consistent.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  activeSection: "gestronomy",
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setActiveSection: (section) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("active_section", section);
    }
    set({ activeSection: section });
  },
  clear: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("active_section");
    }
    set({ user: null, token: null, activeSection: "gestronomy" });
  },
}));
