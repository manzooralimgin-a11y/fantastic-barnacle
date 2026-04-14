"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
} from "recharts";
import {
  Mail,
  Mic,
  CalendarPlus,
  BarChart3,
  CalendarCheck,
  Users,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useDashboardStore } from "@/store";
import { MOCK_ACTIVITIES } from "@/mock";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { Card } from "@/components/ui";
import { AnimatedCounter } from "@/components/ui";
import { Badge } from "@/components/ui";
import { ActivityItem } from "@/components/ui";

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-white/5",
        className
      )}
    />
  );
}

function OccupancyRing({ rate, size = 64 }: { rate: number; size?: number }) {
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (rate / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#C8A951"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - filled }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
      />
    </svg>
  );
}

const quickActions = [
  { label: "Check Emails", href: "/emails", icon: Mail, color: "text-status-pending bg-status-pending/15" },
  { label: "Voice Assistant", href: "/voice", icon: Mic, color: "text-accent bg-accent/15" },
  { label: "New Meeting", href: "/meetings", icon: CalendarPlus, color: "text-status-success bg-status-success/15" },
  { label: "Analytics", href: "/analytics", icon: BarChart3, color: "text-status-warning bg-status-warning/15" },
];

function formatActivityTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DashboardView() {
  const router = useRouter();
  const { data, isLoading, fetchDashboard } = useDashboardStore();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const activities = MOCK_ACTIVITIES.slice(0, 6);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background-dark">
        <Header notificationCount={3} />
        <div className="space-y-4 px-4 pb-24 pt-2">
          <Skeleton className="h-44" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-8 w-32" />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-dark">
      <Header notificationCount={3} />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="space-y-4 px-4 pb-24 pt-2"
      >
        {/* Revenue Overview */}
        <motion.div variants={fadeUp}>
          <Card variant="glass" className="space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-text-secondary-dark">
                  Today&apos;s Revenue
                </p>
                <div className="mt-1 text-3xl font-bold text-text-primary-dark">
                  <AnimatedCounter target={data.revenueToday} prefix="€" />
                </div>
              </div>
              <Badge
                variant="success"
                label={`+${data.revenueGrowth}% vs yesterday`}
              />
            </div>

            <div className="h-16">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.weeklyRevenue}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C8A951" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#C8A951" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin - 500", "dataMax + 500"]} />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke="#C8A951"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* Quick Stats Row */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
          {/* Bookings Today */}
          <Card variant="glass" className="space-y-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-success/15">
              <CalendarCheck className="h-4 w-4 text-status-success" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-secondary-dark">
              Bookings Today
            </p>
            <div className="text-2xl font-bold text-text-primary-dark">
              <AnimatedCounter target={data.bookingsToday} />
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-medium text-status-success">
              <Users className="h-3 w-3" />
              <span>{data.occupiedRooms}/{data.totalRooms} rooms</span>
            </div>
          </Card>

          {/* Occupancy */}
          <Card variant="glass" className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-text-secondary-dark">
                  Occupancy
                </p>
                <div className="text-2xl font-bold text-text-primary-dark">
                  <AnimatedCounter
                    target={data.occupancyRate}
                    suffix="%"
                    decimals={1}
                  />
                </div>
                <Badge
                  variant="success"
                  label={`+${data.occupancyChange}%`}
                />
              </div>
              <div className="relative flex items-center justify-center">
                <OccupancyRing rate={data.occupancyRate} />
                <span className="absolute text-[10px] font-bold text-accent">
                  {data.occupiedRooms}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Live Activity Feed */}
        <motion.div variants={fadeUp}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-text-primary-dark">
                Live Activity
              </h2>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-status-success" />
              </span>
            </div>
            <button className="flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:text-accent-warm">
              View All
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <Card variant="default" className="divide-y divide-white/5 p-0">
            {activities.map((activity, i) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.3,
                  delay: 0.4 + i * 0.08,
                  ease: "easeOut",
                }}
              >
                <ActivityItem
                  title={activity.title}
                  description={activity.description}
                  timestamp={formatActivityTime(activity.timestamp)}
                  type={activity.type}
                />
              </motion.div>
            ))}
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={fadeUp}>
          <h2 className="mb-3 text-sm font-semibold text-text-primary-dark">
            Quick Actions
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.href}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push(action.href)}
                  className="flex min-w-[100px] flex-shrink-0 flex-col items-center gap-2 rounded-2xl border border-white/5 bg-surface-dark/60 p-4 transition-colors hover:bg-surface-dark"
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      action.color
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-[11px] font-medium text-text-secondary-dark">
                    {action.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
