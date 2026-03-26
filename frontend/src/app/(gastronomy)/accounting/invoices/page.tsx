"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Invoice {
  id: number;
  invoice_number: string;
  vendor_name: string;
  amount: number;
  status: string;
  due_date: string;
  created_at: string;
}

const STATUS_VARIANT: Record<string, "warning" | "success" | "default" | "destructive"> = {
  pending: "warning",
  approved: "success",
  paid: "default",
  rejected: "destructive",
};

export default function InvoicesPage() {
  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await api.get("/accounting/invoices");
      return data;
    },
  });

  if (isLoading) return <Loading className="py-20" size="lg" />;

  const columns = [
    { key: "invoice_number", header: "Invoice #" },
    { key: "vendor_name", header: "Vendor" },
    {
      key: "amount",
      header: "Amount",
      render: (row: Invoice) => formatCurrency(row.amount),
    },
    {
      key: "status",
      header: "Status",
      render: (row: Invoice) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? "secondary"}>
          {row.status}
        </Badge>
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      render: (row: Invoice) => formatDate(row.due_date),
    },
    {
      key: "created_at",
      header: "Created",
      render: (row: Invoice) => formatDate(row.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
        <p className="text-sm text-muted-foreground">Manage and track invoices</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={(invoices ?? []) as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
