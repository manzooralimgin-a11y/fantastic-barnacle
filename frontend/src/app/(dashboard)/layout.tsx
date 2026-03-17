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
  const token = useAuthStore((s) => s.token);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    getMe()
      .then((user) => {
        setUser(user);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [token, setUser, router]);

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
