"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Receipt,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { createPmsFolioPayment } from "@/features/hms/pms/api/billing";
import { emitPmsReservationsRefresh } from "@/features/hms/pms/api/reservations";
import type { PmsFolio, PmsFolioLine } from "@/features/hms/pms/schemas/payment";
import type { PmsReservationSummary } from "@/features/hms/pms/schemas/reservation";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";

type Props = {
  folio: Partial<PmsFolio>;
  reservation: Partial<PmsReservationSummary>;
  onRefresh: () => Promise<unknown>;
  postPayment?: (payload: { amount: number; method: string; reference?: string | null }) => Promise<unknown>;
};

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Credit Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "other", label: "Other" },
];

function normalizeStatus(status: string | null | undefined) {
  const value = (status || "").toLowerCase();
  if (value.includes("paid") || value.includes("bezahlt")) return "paid";
  if (value.includes("partial") || value.includes("teilweise")) return "partial";
  return "outstanding";
}

// ── Reusable dark-green card ────────────────────────────────────────────────
function DarkCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#c8a951]/15 bg-[#0a1610]/85 backdrop-blur-[2px] shadow-[0_6px_28px_-18px_rgba(0,0,0,0.7)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

// ── Download Bill: build printable HTML and trigger a one-click download ────
function buildBillHtml(
  folio: Partial<PmsFolio>,
  reservation: Partial<PmsReservationSummary>,
  lines: PmsFolioLine[],
): string {
  const currency = folio.currency || reservation.currency || "EUR";
  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(n);
  const total = Number(folio.total ?? reservation.total_amount ?? 0);
  const balance = Number(folio.balance_due ?? reservation.folio_balance_due ?? total);
  const paid = Math.max(total - balance, 0);
  const payments = folio.payments || [];
  const issuedAt = new Date().toLocaleDateString("de-DE");

  const lineRows = lines.length
    ? lines
        .map(
          (l) => `
        <tr>
          <td>${l.service_date ?? ""}</td>
          <td>${(l.description || l.charge_type || "").replace(/</g, "&lt;")}</td>
          <td style="text-align:right;">${l.quantity}</td>
          <td style="text-align:right;">${fmt(Number(l.unit_price ?? l.total_price / Math.max(l.quantity || 1, 1)))}</td>
          <td style="text-align:right;">${fmt(Number(l.total_price || 0))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" style="text-align:center; padding:18px; color:#888;">No line items recorded.</td></tr>`;

  const paymentRows = payments.length
    ? payments
        .map(
          (p) => `
        <tr>
          <td>${p.paid_at ? new Date(p.paid_at).toLocaleString("de-DE") : ""}</td>
          <td>${(p.method || "").toUpperCase()}</td>
          <td>${(p.reference || "-").replace(/</g, "&lt;")}</td>
          <td style="text-align:right;">${fmt(Number(p.amount || 0))}</td>
        </tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="text-align:center; padding:14px; color:#888;">No payments recorded.</td></tr>`;

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${folio.folio_number || reservation.booking_id || ""}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 40px; background: #fff; }
    h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: -0.02em; }
    h2 { font-size: 14px; margin: 28px 0 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #555; }
    .muted { color: #666; }
    .row { display: flex; justify-content: space-between; gap: 24px; margin-top: 18px; }
    .col { flex: 1; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eee; }
    th { background: #f7f4ec; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #5a5a5a; }
    tfoot td { font-weight: 700; border-top: 2px solid #222; border-bottom: none; }
    .totals { margin-left: auto; width: 320px; margin-top: 18px; font-size: 14px; }
    .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals .grand { border-top: 2px solid #222; margin-top: 6px; padding-top: 10px; font-size: 18px; font-weight: 700; }
    .balance-open { color: #b91c1c; }
    .balance-paid { color: #047857; }
    .brand { font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #8a6d1f; }
    .footer { margin-top: 60px; font-size: 11px; color: #888; text-align: center; }
    @media print { body { margin: 20px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="brand">das elb · Magdeburg</div>
  <h1>Invoice</h1>
  <p class="muted">Folio ${folio.folio_number || "-"} · Booking ${reservation.booking_id || "-"} · Issued ${issuedAt}</p>

  <div class="row">
    <div class="col">
      <h2>Guest</h2>
      <div><strong>${(reservation.guest_name || "").replace(/</g, "&lt;")}</strong></div>
      ${reservation.guest_email ? `<div class="muted">${reservation.guest_email}</div>` : ""}
      ${reservation.guest_phone ? `<div class="muted">${reservation.guest_phone}</div>` : ""}
    </div>
    <div class="col">
      <h2>Stay</h2>
      <div>Room <strong>${reservation.room || "-"}</strong>${reservation.room_type_label ? ` · ${reservation.room_type_label}` : ""}</div>
      <div class="muted">${reservation.check_in || ""} – ${reservation.check_out || ""}</div>
      <div class="muted">${reservation.adults ?? 0} adult(s)${reservation.children ? ` · ${reservation.children} child(ren)` : ""}</div>
    </div>
  </div>

  <h2>Charges</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th style="text-align:right;">Qty</th>
        <th style="text-align:right;">Unit</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals">
    <div><span>Total charges</span><span>${fmt(total)}</span></div>
    <div><span>Paid to date</span><span class="balance-paid">${fmt(paid)}</span></div>
    <div class="grand"><span>Balance due</span><span class="${balance > 0 ? "balance-open" : "balance-paid"}">${fmt(balance)}</span></div>
  </div>

  <h2>Payments</h2>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Method</th>
        <th>Reference</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${paymentRows}</tbody>
  </table>

  <div class="footer">Thank you for your stay. das elb — Magdeburg</div>
</body>
</html>`;
}

function downloadBill(
  folio: Partial<PmsFolio>,
  reservation: Partial<PmsReservationSummary>,
  lines: PmsFolioLine[],
) {
  if (typeof window === "undefined") return;
  const html = buildBillHtml(folio, reservation, lines);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `invoice-${folio.folio_number || reservation.booking_id || "bill"}-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

// ── Main component ──────────────────────────────────────────────────────────
export function ReservationPaymentConsole({ folio, reservation, onRefresh, postPayment }: Props) {
  const [method, setMethod] = useState("card");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payments = folio.payments || [];
  const lines = folio.lines || [];
  const outstanding = Number(folio.balance_due ?? reservation.folio_balance_due ?? reservation.total_amount ?? 0);
  const total = Number(folio.total ?? reservation.total_amount ?? 0);
  const paidToDate = Math.max(total - outstanding, 0);
  const statusTone = normalizeStatus(reservation.payment_status || reservation.zahlungs_status || folio.status);

  const historySummary = useMemo(() => {
    if (!payments.length) return "No previous payments";
    return `${payments.length} payment${payments.length === 1 ? "" : "s"} recorded`;
  }, [payments.length]);

  const paymentMutation = useMutation({
    mutationFn: (payload: { amount: number; method: string; reference?: string | null }) =>
      postPayment ? postPayment(payload) : createPmsFolioPayment(folio.id as number, payload),
    onSuccess: async (_updatedFolio, variables) => {
      await onRefresh();
      emitPmsReservationsRefresh();
      setAmount("");
      setReference("");
      setError(null);
      toast.success(`Payment of ${formatCurrency(variables.amount)} recorded.`);
    },
    onError: (mutationError) => {
      console.error("Failed to post folio payment", mutationError);
      setError("Failed to record payment.");
    },
  });

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folio.id) {
      setError("No folio is linked to this reservation yet.");
      return;
    }
    const nextAmount = mode === "full" ? outstanding : Number(amount || 0);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    if (nextAmount > outstanding) {
      setError("Payment amount cannot exceed the outstanding balance.");
      return;
    }
    setError(null);
    await paymentMutation.mutateAsync({
      amount: Number(nextAmount.toFixed(2)),
      method,
      reference: reference || null,
    });
  }

  return (
    <div className="space-y-4">
      {/* ── Payment status + form ─────────────────────────────────────── */}
      <DarkCard>
        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#e8d9b0]/55">
                Payment Status
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
                    statusTone === "paid"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : statusTone === "partial"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-rose-500/15 text-rose-300",
                  )}
                >
                  {statusTone === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                </span>
                <div>
                  <h3 className="text-xl font-editorial text-[#e8d9b0]">
                    {statusTone === "paid" ? "Paid" : statusTone === "partial" ? "Partial Payment" : "Outstanding"}
                  </h3>
                  <p className="mt-1 text-sm text-[#e8d9b0]/60">
                    Total {formatCurrency(total)} · Outstanding {formatCurrency(outstanding)}
                  </p>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#c8a951]/40 bg-[#c8a951]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#c8a951]">
              {folio.folio_number || reservation.folio_number || "No folio"}
            </span>
          </div>

          <form className="space-y-4" onSubmit={(event) => void submitPayment(event)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("full");
                    setAmount("");
                    setError(null);
                  }}
                  className={cn(
                    "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    mode === "full"
                      ? "bg-[#c8a951] text-[#0f1f14] shadow-sm"
                      : "border border-[#c8a951]/30 bg-white/[0.03] text-[#e8d9b0]/80 hover:bg-white/[0.07]",
                  )}
                >
                  Full payment
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("partial");
                    setAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
                    setError(null);
                  }}
                  className={cn(
                    "rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                    mode === "partial"
                      ? "bg-[#c8a951] text-[#0f1f14] shadow-sm"
                      : "border border-[#c8a951]/30 bg-white/[0.03] text-[#e8d9b0]/80 hover:bg-white/[0.07]",
                  )}
                >
                  Partial payment
                </button>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[#e8d9b0]/55">
                  Payment Method
                </label>
                <div className="relative">
                  <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#e8d9b0]/40" />
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="w-full rounded-xl border border-[#c8a951]/25 bg-[#0d1b11] pl-10 pr-3 py-2.5 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/40"
                  >
                    {PAYMENT_METHODS.map((option) => (
                      <option key={option.value} value={option.value} className="bg-[#0d1b11] text-[#e8d9b0]">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[#e8d9b0]/55">
                  {mode === "full" ? "Amount to Collect" : "Partial Amount"}
                </label>
                <div className="relative">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#e8d9b0]/40" />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={mode === "full" ? outstanding.toFixed(2) : amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={mode === "full"}
                    className="w-full rounded-xl border border-[#c8a951]/25 bg-[#0d1b11] pl-10 pr-3 py-2.5 text-sm text-[#e8d9b0] outline-none focus:ring-2 focus:ring-[#c8a951]/40 disabled:opacity-70"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-[#e8d9b0]/55">
                  Reference
                </label>
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Terminal receipt, bank ref, or note"
                  className="w-full rounded-xl border border-[#c8a951]/25 bg-[#0d1b11] px-3 py-2.5 text-sm text-[#e8d9b0] placeholder:text-[#e8d9b0]/25 outline-none focus:ring-2 focus:ring-[#c8a951]/40"
                />
              </div>
            </div>

            {error ? <ApiError message={error} dismissible={false} /> : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={paymentMutation.isPending || outstanding <= 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#c8a951] to-[#a8893a] px-4 py-2.5 text-sm font-bold text-[#0f1f14] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {mode === "full" ? "Record full payment" : "Mark as partial payment"}
              </button>
            </div>
          </form>
        </div>
      </DarkCard>

      {/* ── Full bill / folio line items ─────────────────────────────── */}
      <DarkCard>
        <div className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[#c8a951]" />
              <h3 className="text-lg font-editorial text-[#e8d9b0]">Full Bill</h3>
              <span className="rounded-full bg-[#c8a951]/12 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#c8a951]">
                {lines.length} line{lines.length === 1 ? "" : "s"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => downloadBill(folio, reservation, lines)}
              className="inline-flex items-center gap-2 rounded-xl border border-[#c8a951]/50 bg-[#c8a951]/[0.15] px-4 py-2 text-sm font-bold text-[#e8d9b0] hover:bg-[#c8a951]/25 transition-colors"
              title="Download printable invoice"
            >
              <Download className="h-4 w-4" />
              Download Bill
            </button>
          </div>

          {lines.length ? (
            <div className="overflow-x-auto rounded-xl border border-[#c8a951]/10">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#c8a951]/15 bg-white/[0.02] text-[10px] font-bold uppercase tracking-[0.18em] text-[#c8a951]/70">
                    <th className="px-3 py-2.5 text-left">Date</th>
                    <th className="px-3 py-2.5 text-left">Description</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Unit</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c8a951]/[0.08]">
                  {lines.map((line) => {
                    const unit = Number(
                      line.unit_price ??
                        (line.total_price && line.quantity
                          ? line.total_price / Math.max(line.quantity, 1)
                          : 0),
                    );
                    return (
                      <tr key={line.id} className="text-[#e8d9b0]/90">
                        <td className="px-3 py-2.5 text-[11px] text-[#e8d9b0]/55 font-mono">
                          {line.service_date || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold">{line.description || line.charge_type}</p>
                          {line.charge_type && line.description !== line.charge_type && (
                            <p className="mt-0.5 text-[10px] uppercase tracking-widest text-[#e8d9b0]/40">
                              {line.charge_type}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{line.quantity}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#e8d9b0]/70">
                          {formatCurrency(unit)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                          {formatCurrency(Number(line.total_price || 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#c8a951]/20 bg-white/[0.02] px-4 py-6 text-center text-sm text-[#e8d9b0]/55">
              No charges have been posted to this folio yet.
            </div>
          )}

          {/* Totals summary */}
          <div className="ml-auto w-full max-w-xs space-y-1.5 pt-2 text-sm">
            <div className="flex items-center justify-between text-[#e8d9b0]/70">
              <span>Total charges</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
            <div className="flex items-center justify-between text-emerald-300/90">
              <span>Paid to date</span>
              <span className="tabular-nums">{formatCurrency(paidToDate)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-[#c8a951]/25 pt-2 text-base font-bold">
              <span className="text-[#e8d9b0]">Balance due</span>
              <span
                className={cn(
                  "tabular-nums",
                  outstanding > 0 ? "text-rose-300" : "text-emerald-300",
                )}
              >
                {formatCurrency(outstanding)}
              </span>
            </div>
          </div>
        </div>
      </DarkCard>

      {/* ── Payment history ───────────────────────────────────────────── */}
      <DarkCard>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#c8a951]" />
              <div>
                <h3 className="text-lg font-editorial text-[#e8d9b0]">Payment History</h3>
                <p className="mt-0.5 text-sm text-[#e8d9b0]/55">{historySummary}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="rounded-xl border border-[#c8a951]/25 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-[#e8d9b0]/80 hover:bg-white/[0.07] transition-colors"
            >
              {showHistory ? "Hide" : "Show"}
            </button>
          </div>

          {showHistory ? (
            payments.length ? (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-[#c8a951]/15 bg-white/[0.025] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#e8d9b0] uppercase tracking-wide">
                        {payment.method}
                      </p>
                      <p className="mt-1 text-xs text-[#e8d9b0]/55">
                        {payment.reference || "No reference"}
                        {payment.paid_at ? ` · ${formatDateTime(payment.paid_at)}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums text-emerald-300">
                      {formatCurrency(payment.amount)}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-[#e8d9b0]/45">
                  Reversals are still handled through the finance workspace.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#e8d9b0]/55">No payments have been recorded yet.</p>
            )
          ) : null}
        </div>
      </DarkCard>
    </div>
  );
}
