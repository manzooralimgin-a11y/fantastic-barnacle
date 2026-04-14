"use client";

import { cn } from "@/utils/cn";

interface ShimmerProps {
  className?: string;
}

export function Shimmer({ className }: ShimmerProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-white/5",
        className
      )}
    >
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}
