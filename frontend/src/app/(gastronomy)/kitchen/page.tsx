"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import { AlertTriangle, Trash2, ShieldCheck } from "lucide-react";

interface VisionStats {
  active_alerts: number;
  waste_today: number;
  waste_cost_today: number;
  compliance_score: number;
}

interface VisionAlert {
  id: number;
  type: string;
  severity: string;
  message: string;
  zone: string;
  created_at: string;
}

export default function KitchenPage() {
  const { data: stats, isLoading: statsLoading } = useQuery<VisionStats>({
    queryKey: ["vision-stats"],
    queryFn: async () => {
      const { data } = await api.get("/vision/stats");
      return data;
    },
  });

  const { data: alerts, isLoading: alertsLoading } = useQuery<VisionAlert[]>({
    queryKey: ["vision-alerts"],
    queryFn: async () => {
      const { data } = await api.get("/vision/alerts");
      return data;
    },
  });

  if (statsLoading && alertsLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Kitchen Vision</h1>
        <p className="text-sm text-muted-foreground">AI-powered kitchen monitoring and compliance</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Active Alerts"
          value={stats?.active_alerts ?? 0}
          icon={AlertTriangle}
        />
        <StatCard
          title="Waste Today"
          value={stats ? formatCurrency(stats.waste_cost_today) : "€0"}
          icon={Trash2}
        />
        <StatCard
          title="Compliance Score"
          value={stats?.compliance_score != null ? `${stats.compliance_score}%` : "N/A"}
          icon={ShieldCheck}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Vision Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {alertsLoading ? (
            <Loading className="py-8" />
          ) : (alerts ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No recent alerts</p>
          ) : (
            <div className="space-y-3">
              {(alerts ?? []).slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3"
                >
                  <Badge
                    variant={
                      alert.severity === "critical"
                        ? "destructive"
                        : alert.severity === "warning"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {alert.severity}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.zone} &middot; {formatRelativeTime(alert.created_at)}
                    </p>
                  </div>
                  <Badge variant="outline">{alert.type}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
