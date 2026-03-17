"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable } from "@/components/shared/data-table";
import { Loading } from "@/components/shared/loading";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DollarSign, TrendingDown, TrendingUp } from "lucide-react";

interface PLSummary {
  total_revenue: number;
  total_expenses: number;
  net_income: number;
  period: string;
}

interface GLEntry {
  id: number;
  date: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
}

export default function AccountingPage() {
  const { data: pl, isLoading: plLoading } = useQuery<PLSummary>({
    queryKey: ["accounting-pl"],
    queryFn: async () => {
      const { data } = await api.get("/accounting/pl");
      return data;
    },
  });

  const { data: glEntries, isLoading: glLoading } = useQuery<GLEntry[]>({
    queryKey: ["accounting-gl"],
    queryFn: async () => {
      const { data } = await api.get("/accounting/gl");
      return data;
    },
  });

  if (plLoading && glLoading) return <Loading className="py-20" size="lg" />;

  const glColumns = [
    {
      key: "date",
      header: "Date",
      render: (row: GLEntry) => formatDate(row.date),
    },
    { key: "account_name", header: "Account" },
    { key: "description", header: "Description" },
    {
      key: "debit",
      header: "Debit",
      render: (row: GLEntry) => (row.debit > 0 ? formatCurrency(row.debit) : "-"),
    },
    {
      key: "credit",
      header: "Credit",
      render: (row: GLEntry) => (row.credit > 0 ? formatCurrency(row.credit) : "-"),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Accounting</h1>
        <p className="text-sm text-muted-foreground">Financial overview and general ledger</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Total Revenue"
          value={pl ? formatCurrency(pl.total_revenue) : "€0"}
          icon={DollarSign}
        />
        <StatCard
          title="Total Expenses"
          value={pl ? formatCurrency(pl.total_expenses) : "€0"}
          icon={TrendingDown}
        />
        <StatCard
          title="Net Income"
          value={pl ? formatCurrency(pl.net_income) : "€0"}
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent GL Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={glColumns}
            data={((glEntries ?? []).slice(0, 20)) as unknown as Record<string, unknown>[]}
            loading={glLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
