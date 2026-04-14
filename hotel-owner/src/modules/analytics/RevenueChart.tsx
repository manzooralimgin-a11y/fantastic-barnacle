"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { WeeklyRevenue } from "@/mock/dashboard";

interface RevenueChartProps {
  data: WeeklyRevenue[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-white/10 bg-surface-dark/95 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
      <p className="font-medium text-text-secondary-dark">{label}</p>
      <p className="mt-0.5 font-bold text-accent">
        €{payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  const maxAmount = Math.max(...data.map((d) => d.amount));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8B9A8F", fontSize: 11 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8B9A8F", fontSize: 10 }}
          tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar
          dataKey="amount"
          radius={[6, 6, 0, 0]}
          animationDuration={1200}
          animationEasing="ease-out"
        >
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={
                entry.amount === maxAmount
                  ? "#C8A951"
                  : "rgba(200,169,81,0.5)"
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
