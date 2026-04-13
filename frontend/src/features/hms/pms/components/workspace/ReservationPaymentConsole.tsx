"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createPmsFolioPayment } from "@/features/hms/pms/api/billing";
import { emitPmsReservationsRefresh } from "@/features/hms/pms/api/reservations";
import type { PmsFolio } from "@/features/hms/pms/schemas/payment";
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

export function ReservationPaymentConsole({ folio, reservation, onRefresh, postPayment }: Props) {
  const [method, setMethod] = useState("card");
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payments = folio.payments || [];
  const outstanding = Number(folio.balance_due ?? reservation.folio_balance_due ?? reservation.total_amount ?? 0);
  const total = Number(folio.total ?? reservation.total_amount ?? 0);
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
      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">
                Payment Status
              </p>
              <div className="mt-2 flex items-center gap-3">
                <span
                  className={cn(
                    "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
                    statusTone === "paid"
                      ? "bg-emerald-500/12 text-emerald-700"
                      : statusTone === "partial"
                        ? "bg-amber-500/12 text-amber-700"
                        : "bg-rose-500/12 text-rose-700",
                  )}
                >
                  {statusTone === "paid" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                </span>
                <div>
                  <h3 className="text-xl font-editorial text-foreground">
                    {statusTone === "paid" ? "Paid" : statusTone === "partial" ? "Partial Payment" : "Outstanding"}
                  </h3>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Total {formatCurrency(total)} · Outstanding {formatCurrency(outstanding)}
                  </p>
                </div>
              </div>
            </div>
            <Badge variant="outline">{folio.folio_number || reservation.folio_number || "No folio"}</Badge>
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
                    "rounded-xl px-4 py-2.5 text-sm font-semibold",
                    mode === "full" ? "bg-primary text-primary-foreground" : "border border-foreground/10 text-foreground",
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
                    "rounded-xl px-4 py-2.5 text-sm font-semibold",
                    mode === "partial" ? "bg-primary text-primary-foreground" : "border border-foreground/10 text-foreground",
                  )}
                >
                  Partial payment
                </button>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                  Payment Method
                </label>
                <div className="relative">
                  <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                    className="w-full rounded-xl border border-foreground/10 bg-background pl-10 pr-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {PAYMENT_METHODS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                  {mode === "full" ? "Amount to Collect" : "Partial Amount"}
                </label>
                <div className="relative">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={mode === "full" ? outstanding.toFixed(2) : amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={mode === "full"}
                    className="w-full rounded-xl border border-foreground/10 bg-background pl-10 pr-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-70"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                  Reference
                </label>
                <input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Terminal receipt, bank ref, or note"
                  className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {error ? <ApiError message={error} dismissible={false} /> : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={paymentMutation.isPending || outstanding <= 0}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {paymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {mode === "full" ? "Record full payment" : "Mark as partial payment"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-editorial text-foreground">Payment History</h3>
              <p className="mt-1 text-sm text-foreground-muted">{historySummary}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHistory((current) => !current)}
              className="rounded-xl border border-foreground/10 px-4 py-2 text-sm font-semibold text-foreground"
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
                    className="flex items-start justify-between gap-4 rounded-2xl border border-foreground/10 bg-background px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{payment.method}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {payment.reference || "No reference"}
                        {payment.paid_at ? ` · ${formatDateTime(payment.paid_at)}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-700">
                      {formatCurrency(payment.amount)}
                    </span>
                  </div>
                ))}
                <p className="text-xs text-foreground-muted">
                  Reversals are still handled through the finance workspace.
                </p>
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">No payments have been recorded yet.</p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
