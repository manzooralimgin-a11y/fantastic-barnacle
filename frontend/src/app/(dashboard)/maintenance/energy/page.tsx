"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { formatCurrency } from "@/lib/utils";
import { Zap, TrendingDown, Leaf } from "lucide-react";

interface EnergyUsage {
  total_kwh_today: number;
  total_cost_today: number;
  total_kwh_month: number;
  total_cost_month: number;
  savings_this_month: number;
  recommendations: Array<{
    id: number;
    title: string;
    description: string;
    potential_savings: number;
    priority: string;
  }>;
}

export default function EnergyPage() {
  const { data, isLoading } = useQuery<EnergyUsage>({
    queryKey: ["maintenance-energy"],
    queryFn: async () => {
      const { data } = await api.get("/maintenance/energy/usage");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Energy Management</h1>
        <p className="text-sm text-muted-foreground">Usage monitoring and savings optimization</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Energy Today"
          value={`${data?.total_kwh_today ?? 0} kWh`}
          icon={Zap}
        />
        <StatCard
          title="Cost Today"
          value={formatCurrency(data?.total_cost_today ?? 0)}
          icon={Zap}
        />
        <StatCard
          title="Savings This Month"
          value={formatCurrency(data?.savings_this_month ?? 0)}
          icon={TrendingDown}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <span className="text-sm text-muted-foreground">Total kWh</span>
                <span className="text-lg font-bold text-foreground">
                  {(data?.total_kwh_month ?? 0).toLocaleString()} kWh
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <span className="text-sm text-muted-foreground">Total Cost</span>
                <span className="text-lg font-bold text-foreground">
                  {formatCurrency(data?.total_cost_month ?? 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Leaf className="h-5 w-5 text-green-500" />
              Savings Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(data?.recommendations ?? []).length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No recommendations at this time
              </p>
            ) : (
              <div className="space-y-3">
                {(data?.recommendations ?? []).map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{rec.title}</p>
                      <span className="text-xs font-medium text-green-600">
                        Save {formatCurrency(rec.potential_savings)}/mo
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{rec.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
