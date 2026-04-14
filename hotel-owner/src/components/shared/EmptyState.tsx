"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  className,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" as const }}
      className={cn(
        "flex flex-col items-center gap-3 py-16 text-center",
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
        {icon}
      </div>
      <p className="text-sm font-semibold text-text-primary-dark">{title}</p>
      <p className="max-w-[220px] text-xs leading-relaxed text-text-secondary-dark">
        {description}
      </p>
    </motion.div>
  );
}
