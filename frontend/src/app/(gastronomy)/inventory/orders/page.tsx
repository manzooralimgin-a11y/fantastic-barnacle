"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatDate } from "@/lib/utils";

interface PurchaseOrder {
  id: number;
  order_number: string;
  vendor_name: string;
  total_amount: number;
  status: string;
  order_date: string;
  expected_delivery: string;
}

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "secondary"> = {
  pending: "warning",
  ordered: "default",
  shipped: "default",
  delivered: "success",
  cancelled: "secondary",
};

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["inventory-orders"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/orders");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "order_number", header: "Order #" },
    { key: "vendor_name", header: "Vendor" },
    {
      key: "total_amount",
      header: "Amount",
      render: (row: PurchaseOrder) => formatCurrency(row.total_amount),
    },
    {
      key: "status",
      header: "Status",
      render: (row: PurchaseOrder) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>{row.status}</Badge>
      ),
    },
    {
      key: "order_date",
      header: "Order Date",
      render: (row: PurchaseOrder) => formatDate(row.order_date),
    },
    {
      key: "expected_delivery",
      header: "Expected Delivery",
      render: (row: PurchaseOrder) => formatDate(row.expected_delivery),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Purchase Orders</h1>
        <p className="text-sm text-muted-foreground">Track and manage purchase orders</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(orders ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
