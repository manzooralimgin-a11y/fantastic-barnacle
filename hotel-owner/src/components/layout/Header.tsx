"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { cn } from "@/utils/cn";

interface HeaderProps {
  name?: string;
  notificationCount?: number;
  initials?: string;
  className?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function Header({
  name = "Boss",
  notificationCount = 0,
  initials = "OW",
  className,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "sticky top-0 z-40 flex items-center justify-between px-4 py-3 transition-all duration-300",
        scrolled
          ? "bg-surface-dark/70 backdrop-blur-xl border-b border-white/5"
          : "bg-transparent",
        className
      )}
    >
      <div>
        <h1 className="text-lg font-semibold text-text-primary-dark dark:text-text-primary-dark text-text-primary-light">
          {getGreeting()},{" "}
          <span className="text-accent">{name}</span>
        </h1>
        <p className="text-xs text-text-secondary-dark dark:text-text-secondary-dark text-text-secondary-light">
          {getFormattedDate()}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Notification bell */}
        <button className="relative rounded-xl bg-white/5 p-2 transition-colors hover:bg-white/10">
          <Bell className="h-5 w-5 text-text-secondary-dark" />
          {notificationCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-status-error text-[9px] font-bold text-white"
            >
              {notificationCount > 9 ? "9+" : notificationCount}
            </motion.span>
          )}
        </button>

        {/* Profile avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
          {initials}
        </div>
      </div>
    </motion.header>
  );
}
