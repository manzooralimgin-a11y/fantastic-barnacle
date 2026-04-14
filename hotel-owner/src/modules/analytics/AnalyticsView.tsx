"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { BarChart3, ChevronDown } from "lucide-react";
import { useDashboardStore } from "@/store";
import { Header } from "@/components/layout";
import { BottomNav } from "@/components/layout";
import { Card, StatCard } from "@/components/ui";
import { cn } from "@/utils/cn";
import { RevenueChart } from "./RevenueChart";
import { OccupancyChart } from "./OccupancyChart";
import { PeakHoursChart } from "./PeakHoursChart";

const stagger = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-2xl bg-white/5", className)} />
  );
}

export function AnalyticsView() {
  const { data, isLoading, fetchDashboard } = useDashboardStore();

  useEffect(() => {
    if (!data) {
      fetchDashboard();
    }
  }, [data, fetchDashboard]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background-dark">
        <Header notificationCount={0} />
        <div className="space-y-4 px-4 pb-24 pt-2">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <BottomNav />
      </div>
    );
  }

  const weeklyTotal = data.weeklyRevenue.reduce((s, d) => s + d.amount, 0);
  const avgOccupancy = 83.3; // mock weekly average
  const totalBookings = 156; // mock weekly total
  const revenuePerRoom = Math.round(weeklyTotal / data.totalRooms);

  return (
    <div className="min-h-screen bg-background-dark">
      <Header notificationCount={0} />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="space-y-4 px-4 pb-24 pt-2"
      >
        {/* Page heading + date range */}
        <motion.div
          variants={fadeUp}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-warning/15">
              <BarChart3 className="h-5 w-5 text-status-warning" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary-dark">
                Analytics
              </h1>
              <p className="text-xs text-text-secondary-dark">
                Performance overview
              </p>
            </div>
          </div>

          <button className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-secondary-dark transition-colors hover:bg-white/10">
            This Week
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </motion.div>

        {/* Summary stat cards */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3">
          <StatCard
            label="Weekly Revenue"
            value={weeklyTotal}
            change={8.4}
            prefix="€"
          />
          <StatCard
            label="Avg Occupancy"
            value={avgOccupancy}
            change={3.2}
            suffix="%"
            decimals={1}
          />
          <StatCard
            label="Total Bookings"
            value={totalBookings}
            change={12.1}
          />
          <StatCard
            label="Rev / Room"
            value={revenuePerRoom}
            change={5.7}
            prefix="€"
          />
        </motion.div>

        {/* Revenue Chart */}
        <motion.div variants={fadeUp}>
          <Card variant="glass" className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary-dark">
              Revenue Overview
            </h3>
            <RevenueChart data={data.weeklyRevenue} />
          </Card>
        </motion.div>

        {/* Occupancy Chart */}
        <motion.div variants={fadeUp}>
          <Card variant="glass" className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary-dark">
              Occupancy Trends
            </h3>
            <OccupancyChart />
          </Card>
        </motion.div>

        {/* Peak Hours Chart */}
        <motion.div variants={fadeUp}>
          <Card variant="glass" className="space-y-3">
            <h3 className="text-sm font-semibold text-text-primary-dark">
              Peak Booking Hours
            </h3>
            <PeakHoursChart data={data.peakHours} />
          </Card>
        </motion.div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
