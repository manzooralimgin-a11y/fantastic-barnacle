"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2, DollarSign } from "lucide-react";

interface WasteLog {
  id: number;
  item_name: string;
  category: string;
  weight_kg: number;
  cost: number;
  reason: string;
  recorded_at: string;
}

interface WasteData {
  logs: WasteLog[];
  today_total_cost: number;
  week_total_cost: number;
  today_total_kg: number;
}

const CATEGORY_VARIANT: Record<string, "destructive" | "warning" | "secondary" | "default"> = {
  spoilage: "destructive",
  overproduction: "warning",
  preparation: "secondary",
  returned: "default",
};

export default function WastePage() {
  const { data, isLoading } = useQuery<WasteData>({
    queryKey: ["vision-waste"],
    queryFn: async () => {
      const { data } = await api.get("/vision/waste");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "item_name", header: "Item" },
    {
      key: "category",
      header: "Category",
      render: (row: WasteLog) => (
        <Badge variant={CATEGORY_VARIANT[row.category] ?? "secondary"}>
          {row.category}
        </Badge>
      ),
    },
    {
      key: "weight_kg",
      header: "Weight (kg)",
      render: (row: WasteLog) => `${row.weight_kg.toFixed(1)} kg`,
    },
    {
      key: "cost",
      header: "Cost",
      render: (row: WasteLog) => formatCurrency(row.cost),
    },
    { key: "reason", header: "Reason" },
    {
      key: "recorded_at",
      header: "Date",
      render: (row: WasteLog) => formatDate(row.recorded_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Waste Tracking</h1>
        <p className="text-sm text-muted-foreground">Monitor and reduce food waste</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Waste Cost Today"
          value={formatCurrency(data?.today_total_cost ?? 0)}
          icon={DollarSign}
        />
        <StatCard
          title="Waste Cost This Week"
          value={formatCurrency(data?.week_total_cost ?? 0)}
          icon={DollarSign}
        />
        <StatCard
          title="Waste Today"
          value={`${(data?.today_total_kg ?? 0).toFixed(1)} kg`}
          icon={Trash2}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Waste Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(data?.logs ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
