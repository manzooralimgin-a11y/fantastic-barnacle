"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getMe } from "@/lib/auth";
import { getDefaultDashboardRoute } from "@/lib/role-routing";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function HMSLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const setUser = useAuthStore((s) => s.setUser);
  const setToken = useAuthStore((s) => s.setToken);
  const token = useAuthStore((s) => s.token);
  const activeSection = useAuthStore((s) => s.activeSection);
  const setActiveSection = useAuthStore((s) => s.setActiveSection);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const initUIFromStorage = useUIStore((s) => s.initFromStorage);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Step 1 — read persisted state from localStorage after hydration.
  useEffect(() => {
    const storedToken = localStorage.getItem("access_token");
    const storedSection = localStorage.getItem("active_section") as "gestronomy" | "management" | null;
    if (storedToken) setToken(storedToken);
    if (storedSection) setActiveSection(storedSection);
    initUIFromStorage();
    setHydrated(true);
  }, [setToken, setActiveSection, initUIFromStorage]);

  // Step 2 — once hydrated, verify the token with the backend.
  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    getMe()
      .then((user) => {
        setUser(user);
        if (!pathname.startsWith("/hms") && activeSection === "management") {
          router.replace("/hms/dashboard");
        }
      })
      .catch((err) => {
        console.error("Auth check failed", err);
        router.replace("/login");
      });
  }, [hydrated, token, setUser, router, pathname, activeSection]);

  if (!hydrated || !token) return null;

  return (
    <div className="atmospheric-bg min-h-screen">
      {/* Floating orbs — boutique brand colors for glass bleed-through */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[10%] left-[15%] w-[400px] h-[400px] rounded-full bg-[rgba(197,160,89,0.08)] blur-[120px] animate-orb-drift" />
        <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] rounded-full bg-[rgba(26,47,36,0.12)] blur-[100px] animate-orb-drift" style={{ animationDelay: "-7s" }} />
        <div className="absolute top-[60%] left-[50%] w-[300px] h-[300px] rounded-full bg-[rgba(197,160,89,0.04)] blur-[100px] animate-orb-drift" style={{ animationDelay: "-14s" }} />
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Dynamic margin based on sidebar state */}
      <div
        className={`relative z-10 transition-[margin-left] duration-300 ease-editorial ${
          sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        }`}
      >
        <Header onMenuToggle={() => setSidebarOpen((prev) => !prev)} />
        <main id="main-content" className="p-6 md:p-8 lg:p-10 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
