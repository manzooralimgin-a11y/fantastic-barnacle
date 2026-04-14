"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const OCCUPANCY_DATA = [
  { day: "Mon", rate: 78 },
  { day: "Tue", rate: 72 },
  { day: "Wed", rate: 80 },
  { day: "Thu", rate: 82 },
  { day: "Fri", rate: 91 },
  { day: "Sat", rate: 96 },
  { day: "Sun", rate: 84 },
];

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
      <p className="mt-0.5 font-bold text-status-success">
        {payload[0].value}%
      </p>
    </div>
  );
}

export function OccupancyChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart
        data={OCCUPANCY_DATA}
        margin={{ top: 5, right: 5, left: -15, bottom: 0 }}
      >
        <defs>
          <linearGradient id="occupancyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22C55E" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          domain={[0, 100]}
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#8B9A8F", fontSize: 10 }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ stroke: "rgba(255,255,255,0.1)" }}
        />
        <Area
          type="monotone"
          dataKey="rate"
          stroke="#22C55E"
          strokeWidth={2.5}
          fill="url(#occupancyGradient)"
          dot={{ r: 4, fill: "#22C55E", stroke: "#0A1A14", strokeWidth: 2 }}
          activeDot={{ r: 6, fill: "#22C55E", stroke: "#0A1A14", strokeWidth: 2 }}
          animationDuration={1200}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
