"use client";

import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Mail,
  Mic,
  CalendarDays,
  BarChart3,
} from "lucide-react";
import { cn } from "@/utils/cn";

interface NavTab {
  label: string;
  href: string;
  icon: React.ReactNode;
  isHero?: boolean;
}

const tabs: NavTab[] = [
  { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Emails", href: "/emails", icon: <Mail className="h-5 w-5" /> },
  { label: "Voice", href: "/voice", icon: <Mic className="h-5 w-5" />, isHero: true },
  { label: "Meetings", href: "/meetings", icon: <CalendarDays className="h-5 w-5" /> },
  { label: "Analytics", href: "/analytics", icon: <BarChart3 className="h-5 w-5" /> },
];

export function BottomNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-surface-dark/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]",
        className
      )}
    >
      <div className="flex items-end justify-around px-2 py-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;

          if (tab.isHero) {
            return (
              <motion.button
                key={tab.href}
                whileTap={{ scale: 0.9 }}
                onClick={() => router.push(tab.href)}
                className="relative -mt-5 flex flex-col items-center gap-0.5"
              >
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-colors",
                    isActive
                      ? "bg-accent shadow-accent/30"
                      : "bg-primary-light shadow-black/20 ring-1 ring-white/10"
                  )}
                >
                  <Mic
                    className={cn(
                      "h-6 w-6",
                      isActive ? "text-primary" : "text-accent"
                    )}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isActive ? "text-accent" : "text-text-secondary-dark"
                  )}
                >
                  {tab.label}
                </span>
              </motion.button>
            );
          }

          return (
            <motion.button
              key={tab.href}
              whileTap={{ scale: 0.9 }}
              onClick={() => router.push(tab.href)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-accent"
                  : "text-text-secondary-dark hover:text-text-primary-dark"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-1 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-accent"
                  transition={{ duration: 0.3, ease: "easeOut" as const }}
                />
              )}
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
