"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, FileDown, Loader2, Receipt, ScrollText, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  createPmsInvoiceDocument,
  createPmsInvoiceLineItem,
  createPmsInvoicePayment,
  fetchPmsInvoiceDetail,
  fetchPmsInvoicePreview,
  finalizePmsInvoice,
  voidPmsInvoiceLineItem,
} from "@/features/hms/pms/api/billing";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";
import { ReservationPaymentConsole } from "@/features/hms/pms/components/workspace/ReservationPaymentConsole";
import type { PmsReservationSummary } from "@/features/hms/pms/schemas/reservation";
import { printInvoicePreview, printTextDocument } from "@/features/hms/pms/utils/printable-documents";
import { cn, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type Props = {
  panel: RightPanelInstance<"invoice.detail">;
};

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "paid") return "bg-emerald-500/12 text-emerald-700 border-emerald-500/20";
  if (normalized === "partially_paid") return "bg-amber-500/12 text-amber-700 border-amber-500/20";
  if (normalized === "overdue") return "bg-rose-500/12 text-rose-700 border-rose-500/20";
  if (normalized === "storno" || normalized === "cancelled") return "bg-slate-500/12 text-slate-700 border-slate-500/20";
  return "bg-sky-500/12 text-sky-700 border-sky-500/20";
}

export function InvoiceDetailPanel({ panel }: Props) {
  const [lineForm, setLineForm] = useState({
    description: "",
    quantity: "1",
    unit_price: "",
    service_date: "",
  });
  const [lineError, setLineError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["pms", "invoice-detail", panel.data.invoiceId],
    queryFn: () => fetchPmsInvoiceDetail(panel.data.invoiceId),
  });
  const previewQuery = useQuery({
    queryKey: ["pms", "invoice-preview", panel.data.invoiceId, "detail-panel"],
    queryFn: () => fetchPmsInvoicePreview(panel.data.invoiceId),
    enabled: query.isSuccess,
  });

  const finalizeMutation = useMutation({
    mutationFn: () => finalizePmsInvoice(panel.data.invoiceId),
    onSuccess: async () => {
      await Promise.all([query.refetch(), previewQuery.refetch()]);
      toast.success("Invoice finalized and locked.");
    },
    onError: (error) => {
      console.error("Failed to finalize invoice", error);
      toast.error("Failed to finalize the invoice.");
    },
  });

  const addLineMutation = useMutation({
    mutationFn: (payload: { description: string; quantity: number; unit_price: number; service_date?: string | null }) =>
      createPmsInvoiceLineItem(panel.data.invoiceId, payload),
    onSuccess: async () => {
      await Promise.all([query.refetch(), previewQuery.refetch()]);
      setLineForm({ description: "", quantity: "1", unit_price: "", service_date: "" });
      setLineError(null);
      toast.success("Invoice line item added.");
    },
    onError: (error) => {
      console.error("Failed to add invoice line", error);
      setLineError("Failed to add the line item.");
    },
  });

  const documentMutation = useMutation({
    mutationFn: async (kind: "receipt" | "debit_note" | "storno") =>
      createPmsInvoiceDocument(panel.data.invoiceId, kind),
    onSuccess: (document) => {
      printTextDocument(document.title, document.body_text);
      toast.success(`${document.title} opened for printing.`);
    },
    onError: (error) => {
      console.error("Failed to generate billing document", error);
      toast.error("Failed to generate the document.");
    },
  });

  const voidLineMutation = useMutation({
    mutationFn: (lineId: number) => voidPmsInvoiceLineItem(panel.data.invoiceId, lineId),
    onSuccess: async () => {
      await Promise.all([query.refetch(), previewQuery.refetch()]);
      toast.success("Invoice line item removed.");
    },
    onError: (error) => {
      console.error("Failed to void invoice line", error);
      toast.error("Failed to remove the line item.");
    },
  });

  const detail = query.data;
  const invoice = detail?.invoice;
  const previewData = previewQuery.data?.preview_data;
  const paymentFocus = panel.data.focus === "payment";

  const sortedTimeline = useMemo(
    () => [...(detail?.audit_timeline || [])].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [detail?.audit_timeline],
  );

  async function submitLineItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(lineForm.quantity || 0);
    const unitPrice = Number(lineForm.unit_price || 0);
    if (!lineForm.description.trim() || quantity <= 0 || unitPrice <= 0) {
      setLineError("Enter a description, quantity, and price.");
      return;
    }
    setLineError(null);
    await addLineMutation.mutateAsync({
      description: lineForm.description.trim(),
      quantity,
      unit_price: unitPrice,
      service_date: lineForm.service_date || undefined,
    });
  }

  function handlePrintInvoice() {
    if (!previewData) {
      toast.error("Invoice preview is not ready yet.");
      return;
    }
    printInvoicePreview(previewData);
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-foreground-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading invoice detail...
      </div>
    );
  }

  if (query.error || !detail || !invoice) {
    return (
      <ApiError
        message="Failed to load this bill."
        onRetry={() => void query.refetch()}
        dismissible={false}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Bill Overview</p>
              <h2 className="mt-2 text-2xl font-editorial text-foreground">{invoice.invoice_number}</h2>
              <p className="mt-1 text-sm text-foreground-muted">
                {detail.reservation.guest_name} · Room {detail.reservation.room || "TBD"} · Reservation {detail.reservation.booking_id}
              </p>
            </div>
            <Badge className={cn("capitalize border", statusTone(detail.status_label))}>
              {detail.status_label.replaceAll("_", " ")}
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-foreground/10 bg-background p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Total</p>
              <p className="mt-2 text-xl font-editorial text-foreground">{formatCurrency(detail.invoice.lines.reduce((sum, line) => sum + Number(line.gross_amount || 0), 0) || detail.folio.total)}</p>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Paid</p>
              <p className="mt-2 text-xl font-editorial text-emerald-700">{formatCurrency(detail.paid_amount)}</p>
            </div>
            <div className={cn("rounded-2xl border p-4", paymentFocus ? "border-primary/40 bg-primary/5" : "border-foreground/10 bg-background")}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Balance Due</p>
              <p className="mt-2 text-2xl font-editorial text-foreground">{formatCurrency(detail.balance_due)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrintInvoice}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <FileDown className="h-4 w-4" />
              Print / PDF
            </button>
            <button
              type="button"
              onClick={() => documentMutation.mutate("receipt")}
              disabled={!detail.allowed_actions.can_generate_receipt || documentMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              <Receipt className="h-4 w-4" />
              Receipt
            </button>
            <button
              type="button"
              onClick={() => documentMutation.mutate("debit_note")}
              disabled={!detail.allowed_actions.can_generate_debit_note || documentMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              <ScrollText className="h-4 w-4" />
              Debit Note
            </button>
            <button
              type="button"
              onClick={() => documentMutation.mutate("storno")}
              disabled={!detail.allowed_actions.can_generate_storno || documentMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              <AlertCircle className="h-4 w-4" />
              Storno
            </button>
            <button
              type="button"
              onClick={() => finalizeMutation.mutate()}
              disabled={!detail.allowed_actions.can_finalize || finalizeMutation.isPending}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
            >
              <ScrollText className="h-4 w-4" />
              Finalize
            </button>
          </div>
        </CardContent>
      </Card>

      <ReservationPaymentConsole
        folio={detail.folio}
        reservation={detail.reservation as unknown as Partial<PmsReservationSummary>}
        onRefresh={() => query.refetch()}
        postPayment={(payload) => createPmsInvoicePayment(invoice.id, payload)}
      />

      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-editorial text-foreground">Bill Contents</h3>
              <p className="mt-1 text-sm text-foreground-muted">
                Keep changes simple. Room charges stay protected, extras can be added or removed when the bill is still editable.
              </p>
            </div>
            <Badge variant="outline">{invoice.lines.length} line items</Badge>
          </div>

          {detail.allowed_actions.can_edit ? (
            <form className="grid gap-3 rounded-2xl border border-foreground/10 bg-background p-4 md:grid-cols-4" onSubmit={(event) => void submitLineItem(event)}>
              <input
                value={lineForm.description}
                onChange={(event) => setLineForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Breakfast, minibar, parking..."
                className="rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 md:col-span-2"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={lineForm.quantity}
                onChange={(event) => setLineForm((current) => ({ ...current, quantity: event.target.value }))}
                className="rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={lineForm.unit_price}
                onChange={(event) => setLineForm((current) => ({ ...current, unit_price: event.target.value }))}
                placeholder="Price"
                className="rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="date"
                value={lineForm.service_date}
                onChange={(event) => setLineForm((current) => ({ ...current, service_date: event.target.value }))}
                className="rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
              <div className="md:col-span-3">
                {lineError ? <ApiError message={lineError} dismissible={false} /> : null}
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={addLineMutation.isPending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {addLineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Add line item
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-foreground-muted">This bill is locked. Use debit note or storno actions for corrections.</p>
          )}

          <div className="space-y-3">
            {invoice.lines.map((line) => {
              const isRoomCharge = (line.charge_type || "").toLowerCase() === "room";
              return (
                <div key={line.id} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{line.description}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {line.charge_type} · qty {line.quantity} · {line.service_date ? formatDate(line.service_date) : "No service date"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">{formatCurrency(line.gross_amount)}</p>
                      {!isRoomCharge && detail.allowed_actions.can_edit ? (
                        <button
                          type="button"
                          onClick={() => void voidLineMutation.mutate(line.id)}
                          disabled={voidLineMutation.isPending}
                          className="mt-2 text-xs font-semibold text-rose-600"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-editorial text-foreground">Delivery & Audit</h3>
              <p className="mt-1 text-sm text-foreground-muted">
                Every send, payment, and document action stays visible here.
              </p>
            </div>
          </div>

          {invoice.deliveries.length ? (
            <div className="space-y-3">
              {invoice.deliveries.map((delivery) => (
                <div key={delivery.id} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold capitalize text-foreground">{delivery.channel}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {delivery.recipient_email || "No recipient"} · {delivery.sent_at ? formatDateTime(delivery.sent_at) : "Not sent"}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">{delivery.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">No delivery events recorded yet.</p>
          )}

          <div className="space-y-3">
            {sortedTimeline.length ? (
              sortedTimeline.map((event) => (
                <div key={event.id} className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{event.detail}</p>
                      <p className="mt-1 text-xs text-foreground-muted">
                        {event.actor_name} · {event.action}
                      </p>
                    </div>
                    <span className="text-xs text-foreground-muted">{formatDateTime(event.created_at)}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-foreground-muted">No audit events recorded yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
