import { create } from "zustand";
import type { User } from "@/lib/auth";
import { getDefaultDomain, normalizeDomain, type AppDomain } from "@/lib/domain-config";

export type ActiveSection = "gestronomy" | "management";

function domainToSection(domain: AppDomain): ActiveSection {
  return domain === "hotel" ? "management" : "gestronomy";
}

function sectionToDomain(section: ActiveSection | AppDomain | null | undefined): AppDomain {
  return normalizeDomain(section);
}

interface AuthState {
  user: User | null;
  token: string | null;
  activeDomain: AppDomain;
  activeSection: ActiveSection;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setActiveDomain: (domain: AppDomain) => void;
  setActiveSection: (section: ActiveSection) => void;
  clear: () => void;
}

export const ACTIVE_DOMAIN_STORAGE_KEY = "active_domain";
export const ACTIVE_SECTION_STORAGE_KEY = "active_section";

// Always initialize token/section as null/default — never read localStorage at
// module load time. Next.js server-renders "use client" components too, so
// reading localStorage during store creation causes a server/client mismatch
// that React 19 surfaces as a hard hydration runtime error. The dashboard
// layout initialises these values from localStorage inside a useEffect (after
// hydration) to keep both renders consistent.
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  activeDomain: getDefaultDomain(),
  activeSection: domainToSection(getDefaultDomain()),
  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setActiveDomain: (domain) => {
    const normalizedDomain = normalizeDomain(domain);
    const normalizedSection = domainToSection(normalizedDomain);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_DOMAIN_STORAGE_KEY, normalizedDomain);
      localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, normalizedSection);
    }
    set({ activeDomain: normalizedDomain, activeSection: normalizedSection });
  },
  setActiveSection: (section) => {
    const normalizedDomain = sectionToDomain(section);
    const normalizedSection = domainToSection(normalizedDomain);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_DOMAIN_STORAGE_KEY, normalizedDomain);
      localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, normalizedSection);
    }
    set({ activeDomain: normalizedDomain, activeSection: normalizedSection });
  },
  clear: () => {
    const activeDomain = get().activeDomain;
    const activeSection = get().activeSection;
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem(ACTIVE_SECTION_STORAGE_KEY);
    }
    set({ user: null, token: null, activeDomain, activeSection });
  },
}));
