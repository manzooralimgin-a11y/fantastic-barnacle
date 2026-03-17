"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { TrendingUp, Target, Clock } from "lucide-react";

interface ForecastAccuracy {
  overall_accuracy: number;
  demand_accuracy: number;
  revenue_accuracy: number;
  forecast_horizon_days: number;
  last_updated: string;
}

export default function ForecastingPage() {
  const { data: accuracy, isLoading } = useQuery<ForecastAccuracy>({
    queryKey: ["forecast-accuracy"],
    queryFn: async () => {
      const { data } = await api.get("/forecast/accuracy");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Forecasting</h1>
        <p className="text-sm text-muted-foreground">AI-powered demand and revenue forecasting</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Overall Accuracy"
          value={`${accuracy?.overall_accuracy ?? 0}%`}
          icon={Target}
        />
        <StatCard
          title="Demand Accuracy"
          value={`${accuracy?.demand_accuracy ?? 0}%`}
          icon={TrendingUp}
        />
        <StatCard
          title="Forecast Horizon"
          value={`${accuracy?.forecast_horizon_days ?? 0} days`}
          icon={Clock}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demand Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
              <p className="text-sm text-muted-foreground">Demand forecast chart placeholder</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
              <p className="text-sm text-muted-foreground">Revenue forecast chart placeholder</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accuracy Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Revenue Accuracy</p>
              <p className="text-xl font-bold text-foreground">
                {accuracy?.revenue_accuracy ?? 0}%
              </p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="text-xl font-bold text-foreground">
                {accuracy?.last_updated ?? "N/A"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
