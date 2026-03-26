"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";

interface Vendor {
  id: number;
  name: string;
  contact_email: string;
  phone: string;
  category: string;
  reliability_score: number;
  is_active: boolean;
}

function getReliabilityBadge(score: number) {
  if (score >= 90) return { variant: "success" as const, label: "Excellent" };
  if (score >= 70) return { variant: "warning" as const, label: "Good" };
  return { variant: "destructive" as const, label: "Poor" };
}

export default function VendorsPage() {
  const { data: vendors, isLoading } = useQuery<Vendor[]>({
    queryKey: ["inventory-vendors"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/vendors");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "name", header: "Vendor" },
    { key: "category", header: "Category" },
    { key: "contact_email", header: "Email" },
    { key: "phone", header: "Phone" },
    {
      key: "reliability_score",
      header: "Reliability",
      render: (row: Vendor) => {
        const badge = getReliabilityBadge(row.reliability_score);
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{row.reliability_score}%</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
        );
      },
    },
    {
      key: "is_active",
      header: "Status",
      render: (row: Vendor) => (
        <Badge variant={row.is_active ? "success" : "secondary"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Vendors</h1>
        <p className="text-sm text-muted-foreground">Manage vendor relationships and performance</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Vendors</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(vendors ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
