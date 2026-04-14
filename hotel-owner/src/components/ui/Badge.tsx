"use client";

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

type BadgeVariant = "success" | "warning" | "pending" | "error" | "default";

interface BadgeProps {
  variant?: BadgeVariant;
  label: string;
  icon?: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-status-success/15 text-status-success border-status-success/30",
  warning: "bg-status-warning/15 text-status-warning border-status-warning/30",
  pending: "bg-status-pending/15 text-status-pending border-status-pending/30",
  error: "bg-status-error/15 text-status-error border-status-error/30",
  default:
    "bg-text-secondary-dark/15 text-text-secondary-dark border-text-secondary-dark/30",
};

export function Badge({
  variant = "default",
  label,
  icon,
  className,
}: BadgeProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {icon && <span className="flex-shrink-0 [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {label}
    </motion.span>
  );
}
