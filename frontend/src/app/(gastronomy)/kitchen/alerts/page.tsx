"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatDateTime } from "@/lib/utils";

interface VisionAlert {
  id: number;
  type: string;
  severity: string;
  message: string;
  zone: string;
  is_resolved: boolean;
  created_at: string;
}

const ALERT_TYPES = ["all", "hygiene", "safety", "temperature", "contamination"];
const SEVERITIES = ["all", "critical", "warning", "info"];

export default function KitchenAlertsPage() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const { data: alerts, isLoading } = useQuery<VisionAlert[]>({
    queryKey: ["vision-alerts"],
    queryFn: async () => {
      const { data } = await api.get("/vision/alerts");
      return data;
    },
  });

  const filtered = (alerts ?? []).filter((a) => {
    if (typeFilter !== "all" && a.type !== typeFilter) return false;
    if (severityFilter !== "all" && a.severity !== severityFilter) return false;
    return true;
  });

  const columns = [
    {
      key: "severity",
      header: "Severity",
      render: (row: VisionAlert) => (
        <Badge
          variant={
            row.severity === "critical"
              ? "destructive"
              : row.severity === "warning"
              ? "warning"
              : "secondary"
          }
        >
          {row.severity}
        </Badge>
      ),
    },
    { key: "type", header: "Type" },
    { key: "message", header: "Message" },
    { key: "zone", header: "Zone" },
    {
      key: "is_resolved",
      header: "Status",
      render: (row: VisionAlert) => (
        <Badge variant={row.is_resolved ? "success" : "warning"}>
          {row.is_resolved ? "Resolved" : "Active"}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Time",
      render: (row: VisionAlert) => formatDateTime(row.created_at),
    },
  ];

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Vision Alerts</h1>
        <p className="text-sm text-muted-foreground">All kitchen vision alerts</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Type:</span>
          {ALERT_TYPES.map((t) => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Severity:</span>
          {SEVERITIES.map((s) => (
            <Button
              key={s}
              variant={severityFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setSeverityFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
