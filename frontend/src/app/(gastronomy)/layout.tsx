"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/auth";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const setToken = useAuthStore((s) => s.setToken);
  const clearAuth = useAuthStore((s) => s.clear);
  const token = useAuthStore((s) => s.token);
  const setActiveSection = useAuthStore((s) => s.setActiveSection);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Tracks whether the client-side localStorage read has completed.
  // Prevents children from rendering (and firing API calls) before we know
  // whether the user is authenticated — avoids the 401 storm on page load.
  const [hydrated, setHydrated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const initUIFromStorage = useUIStore((s) => s.initFromStorage);

  // Step 1 — read persisted state from localStorage after hydration.
  // This MUST run before the auth-check effect below so token is set first.
  // We never read localStorage at Zustand store creation time because Next.js
  // SSR-renders client components too; reading there causes React 19 to throw
  // a hydration mismatch as a runtime error.
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
      setAuthChecked(false);
      router.replace("/login");
      return;
    }
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        setUser(user);
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuth();
        setAuthChecked(false);
        router.replace("/login");
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, setUser, clearAuth, router]);

  // Don't render protected content before we know the auth state.
  if (!hydrated || !token || !authChecked) return null;

  return (
    <div className="atmospheric-bg min-h-screen">
      {/* Floating orbs — atmospheric color for glass bleed-through */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[10%] left-[15%] w-[400px] h-[400px] rounded-full bg-[rgba(45,106,79,0.08)] blur-[120px] animate-orb-drift" />
        <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] rounded-full bg-[rgba(212,175,55,0.05)] blur-[100px] animate-orb-drift" style={{ animationDelay: "-7s" }} />
        <div className="absolute top-[60%] left-[50%] w-[300px] h-[300px] rounded-full bg-[rgba(82,183,136,0.04)] blur-[100px] animate-orb-drift" style={{ animationDelay: "-14s" }} />
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
