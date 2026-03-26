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

interface HACCPEntry {
  id: number;
  checkpoint: string;
  status: string;
  temperature: number;
  recorded_by: string;
  recorded_at: string;
  notes: string;
}

const STATUSES = ["all", "pass", "warning", "fail"];

export default function HACCPPage() {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: entries, isLoading } = useQuery<HACCPEntry[]>({
    queryKey: ["safety-haccp"],
    queryFn: async () => {
      const { data } = await api.get("/safety/haccp");
      return data;
    },
  });

  const filtered = (entries ?? []).filter(
    (e) => statusFilter === "all" || e.status === statusFilter
  );

  const columns = [
    { key: "checkpoint", header: "Checkpoint" },
    {
      key: "status",
      header: "Status",
      render: (row: HACCPEntry) => (
        <Badge
          variant={
            row.status === "pass"
              ? "success"
              : row.status === "warning"
              ? "warning"
              : "destructive"
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: "temperature",
      header: "Temperature",
      render: (row: HACCPEntry) => `${row.temperature}\u00B0F`,
    },
    { key: "recorded_by", header: "Recorded By" },
    {
      key: "recorded_at",
      header: "Time",
      render: (row: HACCPEntry) => formatDateTime(row.recorded_at),
    },
    { key: "notes", header: "Notes" },
  ];

  if (isLoading) return <Loading className="py-20" size="lg" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">HACCP Log</h1>
        <p className="text-sm text-muted-foreground">Hazard Analysis Critical Control Points log viewer</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        {STATUSES.map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">HACCP Entries ({filtered.length})</CardTitle>
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
