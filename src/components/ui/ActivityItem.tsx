"use client";

import {
  CalendarCheck,
  ShoppingBag,
  Mail,
  BedDouble,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { Badge } from "./Badge";

type ActivityType = "booking" | "order" | "email" | "reservation";

interface ActivityItemProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  timestamp: string;
  type: ActivityType;
  className?: string;
}

const typeConfig: Record<
  ActivityType,
  { icon: React.ReactNode; color: string; label: string }
> = {
  booking: {
    icon: <CalendarCheck className="h-4 w-4" />,
    color: "text-status-success bg-status-success/15",
    label: "Booking",
  },
  order: {
    icon: <ShoppingBag className="h-4 w-4" />,
    color: "text-status-warning bg-status-warning/15",
    label: "Order",
  },
  email: {
    icon: <Mail className="h-4 w-4" />,
    color: "text-status-pending bg-status-pending/15",
    label: "Email",
  },
  reservation: {
    icon: <BedDouble className="h-4 w-4" />,
    color: "text-accent bg-accent/15",
    label: "Reservation",
  },
};

const badgeVariantMap: Record<ActivityType, "success" | "warning" | "pending" | "default"> = {
  booking: "success",
  order: "warning",
  email: "pending",
  reservation: "default",
};

export function ActivityItem({
  icon,
  title,
  description,
  timestamp,
  type,
  className,
}: ActivityItemProps) {
  const config = typeConfig[type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-white/5",
        className
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
          config.color
        )}
      >
        {icon || config.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-text-primary-dark dark:text-text-primary-dark text-text-primary-light truncate">
            {title}
          </p>
          <Badge variant={badgeVariantMap[type]} label={config.label} />
        </div>
        <p className="mt-0.5 text-xs text-text-secondary-dark dark:text-text-secondary-dark text-text-secondary-light truncate">
          {description}
        </p>
        <p className="mt-1 text-[10px] text-text-secondary-dark/60">
          {timestamp}
        </p>
      </div>
    </motion.div>
  );
}
