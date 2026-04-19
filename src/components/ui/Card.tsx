"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/utils/cn";

type CardVariant = "default" | "glass" | "elevated";

interface CardProps extends Omit<HTMLMotionProps<"div">, "variant"> {
  variant?: CardVariant;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const variantStyles: Record<CardVariant, string> = {
  default:
    "bg-surface-dark dark:bg-surface-dark bg-surface-light border border-primary-light/10",
  glass:
    "backdrop-blur-xl bg-surface-dark/40 dark:bg-surface-dark/40 bg-surface-light/60 border border-white/10",
  elevated:
    "bg-surface-dark dark:bg-surface-dark bg-surface-light shadow-lg shadow-black/20 border border-primary-light/20",
};

export function Card({
  variant = "default",
  className,
  children,
  onClick,
  ...props
}: CardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onClick={onClick}
      className={cn(
        "rounded-2xl p-4 cursor-pointer",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
