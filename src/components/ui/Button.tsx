"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-primary font-semibold hover:bg-accent-warm shadow-md shadow-accent/20",
  secondary:
    "border border-accent/40 text-accent hover:bg-accent/10 bg-transparent",
  ghost:
    "text-text-secondary-dark hover:text-text-primary-dark hover:bg-white/5 bg-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-4 py-2 text-sm rounded-xl",
  lg: "px-6 py-3 text-base rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  children,
  onClick,
  className,
  disabled,
  type = "button",
}: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onClick={onClick}
      disabled={disabled || loading}
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {loading && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      {children}
    </motion.button>
  );
}
