"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import type { PeakHour } from "@/mock/dashboard";

interface PeakHoursChartProps {
  data: PeakHour[];
}

export function PeakHoursChart({ data }: PeakHoursChartProps) {
  const maxBookings = Math.max(...data.map((d) => d.bookings));

  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const pct = (item.bookings / maxBookings) * 100;
        const isPeak = item.bookings === maxBookings;

        return (
          <div key={item.hour} className="flex items-center gap-3">
            <span
              className={cn(
                "w-12 flex-shrink-0 text-right text-xs tabular-nums",
                isPeak
                  ? "font-bold text-accent"
                  : "text-text-secondary-dark"
              )}
            >
              {item.hour}
            </span>
            <div className="relative flex-1 h-6 rounded-md overflow-hidden bg-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{
                  duration: 0.8,
                  delay: i * 0.05,
                  ease: "easeOut" as const,
                }}
                className={cn(
                  "h-full rounded-md",
                  isPeak
                    ? "bg-accent shadow-sm shadow-accent/30"
                    : "bg-accent/40"
                )}
              />
            </div>
            <span
              className={cn(
                "w-6 flex-shrink-0 text-xs tabular-nums",
                isPeak
                  ? "font-bold text-accent"
                  : "text-text-secondary-dark"
              )}
            >
              {item.bookings}
            </span>
          </div>
        );
      })}
    </div>
  );
}
