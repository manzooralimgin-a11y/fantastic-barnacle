"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { Building2, DollarSign, Users, Star } from "lucide-react";

interface LocationDetail {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  revenue: number;
  profit_margin: number;
  labor_pct: number;
  food_cost_pct: number;
  customer_score: number;
  covers_today: number;
  employees: number;
}

export function LocationDetailClient() {
  const searchParams = useSearchParams();
  const locationId = searchParams.get("locationId") || "";

  const { data: location, isLoading } = useQuery<LocationDetail>({
    queryKey: ["franchise-location", locationId],
    queryFn: async () => {
      const { data } = await api.get(`/franchise/locations/${locationId}`);
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {location?.name ?? "Location Details"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {location?.address}, {location?.city}, {location?.state}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Revenue"
          value={formatCurrency(location?.revenue ?? 0)}
          icon={DollarSign}
        />
        <StatCard
          title="Profit Margin"
          value={formatPercent(location?.profit_margin ?? 0)}
          icon={Building2}
        />
        <StatCard
          title="Customer Score"
          value={location?.customer_score?.toFixed(1) ?? "N/A"}
          icon={Star}
        />
        <StatCard
          title="Employees"
          value={location?.employees ?? 0}
          icon={Users}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-muted p-4">
              <span className="text-sm text-muted-foreground">Labor %</span>
              <span className="text-lg font-bold text-foreground">
                {formatPercent(location?.labor_pct ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted p-4">
              <span className="text-sm text-muted-foreground">Food Cost %</span>
              <span className="text-lg font-bold text-foreground">
                {formatPercent(location?.food_cost_pct ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted p-4">
              <span className="text-sm text-muted-foreground">Covers Today</span>
              <span className="text-lg font-bold text-foreground">
                {location?.covers_today ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Performance Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
              <p className="text-sm text-muted-foreground">Performance chart placeholder</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
