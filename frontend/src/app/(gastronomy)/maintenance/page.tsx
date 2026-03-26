"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/shared/loading";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface Equipment {
  id: number;
  name: string;
  type: string;
  location: string;
  health_score: number;
  status: string;
  last_maintenance: string;
  next_maintenance: string;
}

function getHealthColor(score: number) {
  if (score >= 80) return { bg: "bg-green-500", text: "text-green-700", label: "Good" };
  if (score >= 50) return { bg: "bg-yellow-500", text: "text-yellow-700", label: "Fair" };
  return { bg: "bg-red-500", text: "text-red-700", label: "Poor" };
}

export default function MaintenancePage() {
  const { data: equipment, isLoading } = useQuery<Equipment[]>({
    queryKey: ["maintenance-equipment"],
    queryFn: async () => {
      const { data } = await api.get("/maintenance/equipment");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
        <p className="text-sm text-muted-foreground">Equipment health monitoring and predictive maintenance</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(equipment ?? []).map((item) => {
          const health = getHealthColor(item.health_score);
          return (
            <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    {item.name}
                  </CardTitle>
                  <Badge
                    variant={item.status === "operational" ? "success" : item.status === "maintenance" ? "warning" : "destructive"}
                  >
                    {item.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Type</span>
                    <span className="text-foreground">{item.type}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Location</span>
                    <span className="text-foreground">{item.location}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">Health Score</span>
                      <span className={cn("font-medium", health.text)}>
                        {item.health_score}% - {health.label}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className={cn("h-2 rounded-full", health.bg)}
                        style={{ width: `${item.health_score}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Last: {item.last_maintenance}</span>
                    <span>Next: {item.next_maintenance}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
