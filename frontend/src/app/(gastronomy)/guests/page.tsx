"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Guest {
  id: number;
  name: string;
  email: string;
  total_visits: number;
  clv: number;
  churn_risk: number;
  loyalty_tier: string;
  last_visit: string;
}

function getChurnColor(risk: number) {
  if (risk >= 0.7) return "text-red-600 bg-red-50";
  if (risk >= 0.4) return "text-yellow-600 bg-yellow-50";
  return "text-green-600 bg-green-50";
}

export default function GuestsPage() {
  const { data: guests, isLoading } = useQuery<Guest[]>({
    queryKey: ["guests"],
    queryFn: async () => {
      const { data } = await api.get("/guests");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    {
      key: "total_visits",
      header: "Visits",
      render: (row: Guest) => <span className="font-medium">{row.total_visits}</span>,
    },
    {
      key: "clv",
      header: "CLV",
      render: (row: Guest) => formatCurrency(row.clv),
    },
    {
      key: "churn_risk",
      header: "Churn Risk",
      render: (row: Guest) => (
        <span
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium",
            getChurnColor(row.churn_risk)
          )}
        >
          {(row.churn_risk * 100).toFixed(0)}%
        </span>
      ),
    },
    {
      key: "loyalty_tier",
      header: "Tier",
      render: (row: Guest) => <Badge variant="outline">{row.loyalty_tier}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Guest Profiles</h1>
        <p className="text-sm text-muted-foreground">Customer insights and engagement tracking</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Guests</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(guests ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
