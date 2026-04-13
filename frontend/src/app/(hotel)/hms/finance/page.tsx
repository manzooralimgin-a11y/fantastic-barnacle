"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/components/shared/api-error";
import { BarChart3, Euro, Loader2, ReceiptText, Wallet } from "lucide-react";
import {
  fetchHmsFolios,
  fetchHmsReportingSummary,
  type HotelFolio,
  type HotelReportSummary,
} from "@/lib/hms";
import { cn } from "@/lib/utils";

type Activity = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: "charge" | "payment";
};

function formatCurrency(value: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function FinancePage() {
  const [folios, setFolios] = useState<HotelFolio[]>([]);
  const [summary, setSummary] = useState<HotelReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFinance() {
      try {
        setLoading(true);
        const [nextFolios, nextSummary] = await Promise.all([
          fetchHmsFolios(),
          fetchHmsReportingSummary(undefined, 30),
        ]);
        setFolios(nextFolios);
        setSummary(nextSummary);
        setFetchError(null);
      } catch (error) {
        console.error("Failed to load finance data", error);
        setFetchError("Failed to load finance data.");
      } finally {
        setLoading(false);
      }
    }

    void loadFinance();
  }, []);

  const totals = useMemo(() => {
    const collected = folios.reduce(
      (sum, folio) =>
        sum +
        folio.payments.reduce((paymentTotal, payment) => paymentTotal + Number(payment.amount || 0), 0),
      0,
    );
    const outstanding = folios.reduce((sum, folio) => sum + Number(folio.balance_due || 0), 0);
    const openFolios = folios.filter((folio) => Number(folio.balance_due || 0) > 0).length;
    const turnover = summary?.turnover_total ?? folios.reduce((sum, folio) => sum + Number(folio.total || 0), 0);
    return { collected, outstanding, openFolios, turnover };
  }, [folios, summary]);

  const activities = useMemo<Activity[]>(() => {
    return folios
      .flatMap((folio) => {
        const charges = folio.lines.map((line) => ({
          id: `line-${line.id}`,
          date: line.service_date || line.created_at,
          description: line.description,
          category: line.charge_type,
          amount: Number(line.total_price || 0),
          type: "charge" as const,
        }));
        const payments = folio.payments.map((payment) => ({
          id: `payment-${payment.id}`,
          date: payment.paid_at || payment.created_at,
          description: `Payment ${payment.reference ? `· ${payment.reference}` : ""}`.trim(),
          category: payment.method,
          amount: Number(payment.amount || 0),
          type: "payment" as const,
        }));
        return [...charges, ...payments];
      })
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 12);
  }, [folios]);

  const stats = [
    {
      label: "Turnover 30D",
      value: formatCurrency(totals.turnover, summary?.currency ?? "EUR"),
      icon: Euro,
      trend: "Reporting summary",
    },
    {
      label: "Collected",
      value: formatCurrency(totals.collected, summary?.currency ?? "EUR"),
      icon: Wallet,
      trend: `${folios.length} folios`,
    },
    {
      label: "Outstanding",
      value: formatCurrency(totals.outstanding, summary?.currency ?? "EUR"),
      icon: ReceiptText,
      trend: `${totals.openFolios} open folios`,
    },
    {
      label: "Open Folios",
      value: totals.openFolios.toString(),
      icon: BarChart3,
      trend: "Balance due > 0",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">
          Finance
        </h1>
        <p className="text-foreground-muted mt-1">
          Live folios, payments, and hotel turnover from the PMS backend.
        </p>
      </div>

      {fetchError && <ApiError message={fetchError} dismissible={false} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading && folios.length === 0 ? (
          <Card className="col-span-full bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-8 flex items-center gap-3 text-foreground-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading folio finance...
            </CardContent>
          </Card>
        ) : (
          stats.map(({ label, value, icon: Icon, trend }) => (
            <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    {label}
                  </p>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
                  <span className="text-[10px] font-medium text-foreground/60">{trend}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">
              Folios
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {folios.length === 0 ? (
              <div className="p-8 text-sm text-foreground-muted">No hotel folios found yet.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                  <tr>
                    <th className="px-6 py-4">Folio</th>
                    <th className="px-6 py-4">Stay</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Total</th>
                    <th className="px-6 py-4 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {folios.map((folio) => (
                    <tr key={folio.id} className="hover:bg-foreground/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{folio.folio_number}</div>
                        <div className="text-xs text-foreground-muted">
                          Reservation #{folio.reservation_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-foreground-muted">
                        {new Date(folio.stay.planned_check_in).toLocaleDateString("de-DE")} -{" "}
                        {new Date(folio.stay.planned_check_out).toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-6 py-4">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                          {folio.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-foreground">
                        {formatCurrency(folio.total, folio.currency)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-foreground">
                        {formatCurrency(folio.balance_due, folio.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">
              Recent Folio Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <div className="p-8 text-sm text-foreground-muted">
                No folio activity recorded yet.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {activities.map((activity) => (
                    <tr key={activity.id} className="hover:bg-foreground/[0.01] transition-colors">
                      <td className="px-6 py-4 text-foreground-muted">
                        {new Date(activity.date).toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {activity.description}
                      </td>
                      <td className="px-6 py-4 text-foreground-muted">{activity.category}</td>
                      <td
                        className={cn(
                          "px-6 py-4 text-right font-mono font-medium",
                          activity.type === "payment" ? "text-emerald-600" : "text-amber-600",
                        )}
                      >
                        {activity.type === "payment" ? "+" : ""}{" "}
                        {formatCurrency(activity.amount, summary?.currency ?? "EUR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
