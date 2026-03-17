"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { DollarSign, TrendingUp, Zap } from "lucide-react";

interface PricingData {
  is_active: boolean;
  current_multiplier: number;
  rules_count: number;
  avg_price_change: number;
  rules: Array<{
    id: number;
    name: string;
    condition: string;
    multiplier: number;
    is_active: boolean;
  }>;
}

export default function PricingPage() {
  const { data, isLoading } = useQuery<PricingData>({
    queryKey: ["guests-pricing"],
    queryFn: async () => {
      const { data } = await api.get("/guests/pricing");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dynamic Pricing</h1>
        <p className="text-sm text-muted-foreground">AI-powered pricing optimization</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Current Multiplier"
          value={`${data?.current_multiplier?.toFixed(2) ?? "1.00"}x`}
          icon={DollarSign}
        />
        <StatCard
          title="Active Rules"
          value={data?.rules_count ?? 0}
          icon={Zap}
        />
        <StatCard
          title="Avg Price Change"
          value={`${data?.avg_price_change?.toFixed(1) ?? 0}%`}
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pricing Rules</CardTitle>
            <Badge variant={data?.is_active ? "success" : "secondary"}>
              {data?.is_active ? "Active" : "Disabled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {(data?.rules ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No pricing rules configured</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.rules ?? []).map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{rule.name}</p>
                    <p className="text-xs text-muted-foreground">{rule.condition}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-medium">
                      {rule.multiplier.toFixed(2)}x
                    </span>
                    <Badge variant={rule.is_active ? "success" : "secondary"}>
                      {rule.is_active ? "On" : "Off"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
