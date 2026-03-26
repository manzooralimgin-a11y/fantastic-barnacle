"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/loading";
import { Bell, AlertTriangle, Info, CheckCircle } from "lucide-react";

interface Alert {
  id: number;
  title: string;
  message: string;
  severity: string;
  source: string;
  is_read: boolean;
  created_at: string;
}

const SEVERITY_CONFIG: Record<string, { icon: typeof Bell; color: string; variant: "destructive" | "warning" | "default" | "secondary" }> = {
  critical: { icon: AlertTriangle, color: "text-red-500", variant: "destructive" },
  warning: { icon: Bell, color: "text-yellow-500", variant: "warning" },
  info: { icon: Info, color: "text-blue-500", variant: "default" },
  success: { icon: CheckCircle, color: "text-green-500", variant: "secondary" },
};

export default function AlertsPage() {
  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard/alerts");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
        <p className="text-sm text-muted-foreground">System notifications and alerts</p>
      </div>

      {(!alerts || alerts.length === 0) ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No alerts at the moment</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const config = SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
            const Icon = config.icon;
            return (
              <Card key={alert.id} className={alert.is_read ? "opacity-60" : ""}>
                <CardContent className="flex items-start gap-4 py-4">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${config.color}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">{alert.title}</h3>
                      <Badge variant={config.variant}>{alert.severity}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{alert.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{alert.source} &middot; {new Date(alert.created_at).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
