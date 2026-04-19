"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Card } from "./Card";
import { AnimatedCounter } from "./AnimatedCounter";

interface StatCardProps {
  label: string;
  value: number;
  change?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  prefix = "",
  suffix = "",
  decimals,
  className,
}: StatCardProps) {
  const hasChange = typeof change === "number";
  const isPositive = hasChange && (change as number) >= 0;

  return (
    <Card variant="glass" className={cn("space-y-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-text-secondary-dark dark:text-text-secondary-dark text-text-secondary-light">
        {label}
      </p>
      <div className="text-2xl font-bold text-text-primary-dark dark:text-text-primary-dark text-text-primary-light">
        <AnimatedCounter
          target={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
        />
      </div>
      {hasChange ? (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.5, ease: "easeOut" }}
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            isPositive ? "text-status-success" : "text-status-error"
          )}
        >
          {isPositive ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          <span>
            {isPositive ? "+" : ""}
            {change}%
          </span>
        </motion.div>
      ) : null}
    </Card>
  );
}
