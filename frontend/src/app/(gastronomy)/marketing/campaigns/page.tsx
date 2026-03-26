"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Campaign {
  id: number;
  name: string;
  type: string;
  status: string;
  budget: number;
  spent: number;
  impressions: number;
  conversions: number;
  start_date: string;
  end_date: string;
}

const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "default" | "destructive"> = {
  active: "success",
  paused: "warning",
  draft: "secondary",
  scheduled: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["marketing-campaigns"],
    queryFn: async () => {
      const { data } = await api.get("/marketing/campaigns");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "name", header: "Campaign" },
    {
      key: "type",
      header: "Type",
      render: (row: Campaign) => <Badge variant="outline">{row.type}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      render: (row: Campaign) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "budget",
      header: "Budget",
      render: (row: Campaign) => formatCurrency(row.budget),
    },
    {
      key: "spent",
      header: "Spent",
      render: (row: Campaign) => formatCurrency(row.spent),
    },
    {
      key: "impressions",
      header: "Impressions",
      render: (row: Campaign) => row.impressions.toLocaleString(),
    },
    {
      key: "conversions",
      header: "Conversions",
      render: (row: Campaign) => row.conversions.toLocaleString(),
    },
    {
      key: "start_date",
      header: "Dates",
      render: (row: Campaign) =>
        `${formatDate(row.start_date)} - ${formatDate(row.end_date)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
        <p className="text-sm text-muted-foreground">Manage marketing campaigns and performance</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(campaigns ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
