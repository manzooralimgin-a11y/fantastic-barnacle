"use client";

import {
  DollarSign,
  Users,
  UtensilsCrossed,
  TrendingUp,
  UsersRound,
  Receipt,
} from "lucide-react";
import { useDashboardStore, type KPI } from "@/stores/dashboard-store";
import { StatCard } from "@/components/shared/stat-card";
import { SkeletonCard } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, formatNumber } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface MetricConfig {
  metricName: string;
  label: string;
  icon: LucideIcon;
  format: (val: number) => string;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    metricName: "total_sales",
    label: "Total Sales",
    icon: DollarSign,
    format: formatCurrency,
  },
  {
    metricName: "labor_pct",
    label: "Labor %",
    icon: Users,
    format: formatPercent,
  },
  {
    metricName: "food_cost_pct",
    label: "Food Cost %",
    icon: UtensilsCrossed,
    format: formatPercent,
  },
  {
    metricName: "net_margin",
    label: "Net Margin",
    icon: TrendingUp,
    format: formatPercent,
  },
  {
    metricName: "covers",
    label: "Covers",
    icon: UsersRound,
    format: formatNumber,
  },
  {
    metricName: "avg_ticket",
    label: "Avg Ticket",
    icon: Receipt,
    format: formatCurrency,
  },
];

function computeChange(kpi: KPI): number | undefined {
  if (kpi.previous_value == null || kpi.previous_value === 0) return undefined;
  return ((kpi.value - kpi.previous_value) / Math.abs(kpi.previous_value)) * 100;
}

export function LiveMetrics() {
  const kpis = useDashboardStore((s) => s.kpis);
  const isLoading = kpis.length === 0;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        {METRIC_CONFIGS.map((config, i) => (
          <div key={config.metricName} className={i === 0 ? "lg:col-span-4" : "lg:col-span-2"}>
            <SkeletonCard />
          </div>
        ))}
      </div>
    );
  }

  const kpiMap = new Map(kpis.map((k) => [k.metric_name, k]));

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-editorial font-normal text-foreground tracking-tight">
          Live Performance
        </h2>
        <span className="text-[10px] font-body font-semibold text-foreground-dim uppercase tracking-[0.15em]">
          Real-time KPIs
        </span>
      </div>

      {/* Asymmetric grid — first card wider */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
        {METRIC_CONFIGS.map((config, i) => {
          const kpi = kpiMap.get(config.metricName);
          if (!kpi) return null;

          return (
            <div key={config.metricName} className={i === 0 ? "lg:col-span-4" : "lg:col-span-2"}>
              <StatCard
                title={config.label}
                value={config.format(kpi.value)}
                change={computeChange(kpi)}
                target={
                  kpi.target_value != null
                    ? config.format(kpi.target_value)
                    : undefined
                }
                icon={config.icon}
                featured={i === 0}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
