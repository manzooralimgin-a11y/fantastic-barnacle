"use client";

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, Loader2, Search, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  createPmsInvoiceDocument,
  fetchPmsInvoicePreview,
} from "@/features/hms/pms/api/billing";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { useCashMaster } from "@/features/hms/pms/hooks/useCashMaster";
import { printInvoicePreview, printTextDocument } from "@/features/hms/pms/utils/printable-documents";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

// Backend hard-caps at 200; keep in sync so we never silently truncate
const PAGE_SIZE = 200;

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "bg-emerald-500/12 text-emerald-700 border-emerald-500/20";
  if (normalized === "partially_paid") return "bg-amber-500/12 text-amber-700 border-amber-500/20";
  if (normalized === "overdue") return "bg-rose-500/12 text-rose-700 border-rose-500/20";
  if (normalized === "storno" || normalized === "cancelled") return "bg-slate-500/12 text-slate-700 border-slate-500/20";
  return "bg-sky-500/12 text-sky-700 border-sky-500/20";
}

export default function CashMasterPage() {
  const { openPanel } = useRightPanel();
  const [search, setSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [room, setRoom] = useState("");
  const [guestCompany, setGuestCompany] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = useMemo(
    () => ({
      search: search || undefined,
      invoice_status: invoiceStatus || undefined,
      payment_status: paymentStatus || undefined,
      payment_method: paymentMethod || undefined,
      room: room || undefined,
      guest_company: guestCompany || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      page: 1,
      page_size: PAGE_SIZE,
      sort_by: "invoice_date",
      sort_dir: "desc",
    }),
    [dateFrom, dateTo, guestCompany, invoiceStatus, paymentMethod, paymentStatus, room, search],
  );

  const query = useCashMaster(filters);

  const receiptMutation = useMutation({
    mutationFn: (invoiceId: number) => createPmsInvoiceDocument(invoiceId, "receipt"),
    onSuccess: (document) => {
      printTextDocument(document.title, document.body_text);
      toast.success("Receipt ready — print dialog opened.");
    },
    onError: (error: unknown) => {
      console.error("Failed to generate receipt", error);
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Could not generate receipt. Record a payment first.");
    },
  });

  async function handlePrintInvoice(invoiceId: number) {
    try {
      const preview = await fetchPmsInvoicePreview(invoiceId);
      printInvoicePreview(preview.preview_data);
      toast.success("Invoice ready — print dialog opened.");
    } catch (error: unknown) {
      console.error("Failed to load invoice preview", error);
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Failed to open the invoice preview.");
    }
  }

  const shownCount = query.data?.items.length ?? 0;
  // total_count lives at the top level of the paginated response
  const totalCount = (query.data as { total_count?: number } | undefined)?.total_count ?? shownCount;
  const isTruncated = totalCount > shownCount;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* ── Page heading ── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Cash Master</h1>
          <p className="mt-1 text-foreground-muted">
            Every hotel bill in one calm workspace. Search, collect payment, print, and finish checkout without leaving the list.
          </p>
        </div>
      </div>

      {/* ── Sticky filter + KPI strip ──────────────────────────────────────────
           Root-cause fix: the wrapper must carry an opaque background.
           Without it the glass-card children (45–62 % opacity) are see-through
           and invoice rows scroll visibly behind them.
           top-14 / md:top-16 aligns with the sticky header height (h-14 / h-16).
           z-20 keeps it below the header (z-30) but above the table (z-0).
      ────────────────────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          "sticky top-14 md:top-16 z-20",
          "bg-background/95 backdrop-blur-md",         // opaque backing — stops content bleed-through
          "-mx-6 px-6 md:-mx-8 md:px-8 lg:-mx-10 lg:px-10", // bleed to page edges so no gap at sides
          "pb-4 pt-1",                                 // breathing room above/below
        )}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.8fr_1fr]">
          {/* Filter card */}
          <Card className="border-none shadow-[var(--shadow-soft)]">
            <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="relative xl:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search guest, room, invoice, reservation, or company"
                  className="min-h-11 w-full rounded-2xl border border-foreground/10 bg-background pl-10 pr-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <select
                value={invoiceStatus}
                onChange={(event) => setInvoiceStatus(event.target.value)}
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All bill statuses</option>
                <option value="open">Open</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="storno">Storno</option>
              </select>

              <select
                value={paymentStatus}
                onChange={(event) => setPaymentStatus(event.target.value)}
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All payment states</option>
                <option value="outstanding">Outstanding</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid</option>
              </select>

              <input
                value={guestCompany}
                onChange={(event) => setGuestCompany(event.target.value)}
                placeholder="Guest / company"
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />

              <input
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                placeholder="Room"
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />

              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">All payment methods</option>
                <option value="cash">Cash</option>
                <option value="card">Credit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />

              <input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="min-h-11 rounded-2xl border border-foreground/10 bg-background px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </CardContent>
          </Card>

          {/* KPI cards — row on md+, stacked single col at lg, row again at xl */}
          <div className="grid gap-4 grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            <Card className="border-none shadow-[var(--shadow-soft)]">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Invoiced</p>
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <p className="text-2xl font-editorial text-foreground">{formatCurrency(query.data?.totals.total_invoiced || 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-[var(--shadow-soft)]">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Paid</p>
                  <Wallet className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-2xl font-editorial text-foreground">{formatCurrency(query.data?.totals.total_paid || 0)}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-[var(--shadow-soft)]">
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Outstanding</p>
                  <CreditCard className="h-5 w-5 text-rose-600" />
                </div>
                <p className="text-2xl font-editorial text-foreground">{formatCurrency(query.data?.totals.total_outstanding || 0)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {query.error ? (
        <ApiError
          message="Failed to load Cash Master."
          onRetry={() => void query.refetch()}
          dismissible={false}
        />
      ) : null}

      {/* ── Bill table ── */}
      <Card className="overflow-hidden border-none bg-card shadow-[var(--shadow-soft)]">
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="flex items-center gap-3 p-8 text-sm text-foreground-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading hotel bills…
            </div>
          ) : !query.data?.items.length ? (
            <div className="space-y-2 p-10">
              <h2 className="text-xl font-editorial text-foreground">No bills match these filters</h2>
              <p className="text-sm text-foreground-muted">
                Try a broader search or clear one of the status or date filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1260px] text-left">
                <thead className="bg-foreground/[0.02] text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">
                  <tr>
                    <th className="px-5 py-4">Invoice</th>
                    <th className="px-5 py-4">Guest / Company</th>
                    <th className="px-5 py-4">Reservation</th>
                    <th className="px-5 py-4">Room</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Total</th>
                    <th className="px-5 py-4">Paid</th>
                    <th className="px-5 py-4">Balance</th>
                    <th className="px-5 py-4">Method</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {query.data.items.map((row) => (
                    <tr key={row.invoice_id} className="align-top hover:bg-foreground/[0.015] transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-foreground">{row.invoice_number}</div>
                        <div className="mt-1 text-xs text-foreground-muted capitalize">{row.invoice_status.replaceAll("_", " ")}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">{row.guest_or_company}</div>
                        <div className="mt-1 text-xs text-foreground-muted">{row.recipient_email || row.guest_name || "No contact email"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-foreground">#{row.reservation_id}</div>
                        <div className="mt-1 text-xs text-foreground-muted">{row.booking_id || "No booking id"}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground">{row.room_number || "TBD"}</td>
                      <td className="px-5 py-4 text-sm text-foreground">{formatDate(row.invoice_date)}</td>
                      <td className="px-5 py-4">
                        <Badge className={cn("border capitalize", statusTone(row.status))}>
                          {row.status.replaceAll("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm text-foreground">{formatCurrency(row.total_amount)}</td>
                      <td className="px-5 py-4 font-mono text-sm text-emerald-700">{formatCurrency(row.paid_amount)}</td>
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-foreground">{formatCurrency(row.balance_due)}</td>
                      <td className="px-5 py-4 text-sm text-foreground capitalize">{(row.payment_method || "Not set").replaceAll("_", " ")}</td>
                      <td className="px-5 py-4">
                        <div className="flex flex-nowrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              openPanel({
                                type: "invoice.detail",
                                data: { invoiceId: String(row.invoice_id) },
                                title: row.invoice_number,
                              })
                            }
                            className="rounded-xl border border-foreground/10 px-3 py-2 text-xs font-semibold text-foreground hover:bg-foreground/5 transition-colors"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openPanel({
                                type: "invoice.detail",
                                data: { invoiceId: String(row.invoice_id), focus: "payment" },
                                title: `${row.invoice_number} · Payment`,
                              })
                            }
                            className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                          >
                            Add Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePrintInvoice(row.invoice_id)}
                            className="rounded-xl border border-foreground/10 px-3 py-2 text-xs font-semibold text-foreground hover:bg-foreground/5 transition-colors"
                          >
                            Invoice PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => receiptMutation.mutate(row.invoice_id)}
                            disabled={
                              receiptMutation.isPending ||
                              row.paid_amount <= 0 ||
                              row.payment_status === "outstanding"
                            }
                            title={
                              row.paid_amount <= 0 || row.payment_status === "outstanding"
                                ? "No payment recorded — add a payment first"
                                : "Print receipt"
                            }
                            className="rounded-xl border border-foreground/10 px-3 py-2 text-xs font-semibold text-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-foreground/5 transition-colors"
                          >
                            {receiptMutation.isPending ? "…" : "Receipt"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              openPanel({
                                type: "invoice.detail",
                                data: { invoiceId: String(row.invoice_id), focus: "documents" },
                                title: `${row.invoice_number} · More`,
                              })
                            }
                            className="rounded-xl border border-foreground/10 px-3 py-2 text-xs font-semibold text-foreground hover:bg-foreground/5 transition-colors"
                          >
                            More
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Footer: count + truncation warning ── */}
      {shownCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-foreground-muted">
          <p>
            Showing {shownCount}{totalCount > shownCount ? ` of ${totalCount}` : ""} bill{shownCount !== 1 ? "s" : ""} · last updated {formatDateTime(new Date())}
          </p>
          {isTruncated ? (
            <p className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-4 w-4" />
              {totalCount - shownCount} more bills exist — use filters to narrow results (backend max is {PAGE_SIZE} per page).
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
