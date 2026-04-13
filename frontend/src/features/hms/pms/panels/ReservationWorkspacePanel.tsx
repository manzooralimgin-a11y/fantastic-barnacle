"use client";

import { useEffect, useMemo, useState, type ComponentType, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, Loader2, Mail, MessageSquare, PencilLine, ScrollText, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import Rechnung from "@/components/hms/rechnung";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  createPmsReservationCharge,
  ensurePmsReservationInvoice,
  fetchPmsInvoicePreview,
  fetchPmsReservationInvoices,
  sendPmsInvoice,
} from "@/features/hms/pms/api/billing";
import {
  createPmsReservationMessage,
  fetchPmsMessageTemplates,
  fetchPmsReservationThreads,
} from "@/features/hms/pms/api/comms";
import { PMS_RESERVATIONS_REFRESH_EVENT } from "@/features/hms/pms/api/reservations";
import { ReservationFrontDeskOverview } from "@/features/hms/pms/components/workspace/ReservationFrontDeskOverview";
import { ReservationPaymentConsole } from "@/features/hms/pms/components/workspace/ReservationPaymentConsole";
import { useReservationWorkspace } from "@/features/hms/pms/hooks/useReservationWorkspace";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type Props = {
  panel: RightPanelInstance<"reservation.workspace">;
};

type WorkspaceTab = "summary" | "guest" | "charges" | "payments" | "invoices" | "messages";

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "guest", label: "Guest" },
  { id: "charges", label: "Charges" },
  { id: "payments", label: "Payments" },
  { id: "invoices", label: "Invoices" },
  { id: "messages", label: "Messages" },
];

function WorkspaceStub({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border border-foreground/10 bg-foreground/[0.02] shadow-none">
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-editorial text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-foreground-muted">{description}</p>
          </div>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
          >
            {actionLabel}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
      <p className="mt-2 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

export function ReservationWorkspacePanel({ panel }: Props) {
  const { closePanel, openPanel } = useRightPanel();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("summary");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [selectedMessageTemplateId, setSelectedMessageTemplateId] = useState<number | null>(null);
  const [sendForm, setSendForm] = useState({
    recipient_email: "",
    subject: "",
    message: "",
  });
  const [messageForm, setMessageForm] = useState({
    recipient_email: "",
    subject: "",
    body_text: "",
  });
  const [chargeForm, setChargeForm] = useState({
    description: "",
    quantity: "1",
    unit_price: "",
    service_date: "",
  });
  const [chargeSaving, setChargeSaving] = useState(false);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const query = useReservationWorkspace(panel.data.reservationId);
  const invoicesQuery = useQuery({
    queryKey: ["pms", "reservation-invoices", panel.data.reservationId],
    queryFn: () => fetchPmsReservationInvoices(panel.data.reservationId),
    enabled: Boolean(panel.data.reservationId),
  });
  const invoicePreviewQuery = useQuery({
    queryKey: ["pms", "invoice-preview", selectedInvoiceId],
    queryFn: () => fetchPmsInvoicePreview(selectedInvoiceId as number),
    enabled: activeTab === "invoices" && Boolean(selectedInvoiceId),
  });
  const messageTemplatesQuery = useQuery({
    queryKey: ["pms", "message-templates"],
    queryFn: () => fetchPmsMessageTemplates(),
    enabled: activeTab === "messages",
  });
  const messageThreadsQuery = useQuery({
    queryKey: ["pms", "reservation-message-threads", panel.data.reservationId],
    queryFn: () => fetchPmsReservationThreads(panel.data.reservationId),
    enabled: activeTab === "messages" && Boolean(panel.data.reservationId),
  });
  const ensureInvoiceMutation = useMutation({
    mutationFn: () => ensurePmsReservationInvoice(panel.data.reservationId),
    onSuccess: async (invoice) => {
      setSelectedInvoiceId(invoice.id);
      await Promise.all([invoicesQuery.refetch(), query.refetch()]);
      toast.success("Invoice prepared from the current folio.");
    },
    onError: (error) => {
      console.error("Failed to ensure invoice", error);
      toast.error("Failed to prepare the invoice.");
    },
  });
  const sendInvoiceMutation = useMutation({
    mutationFn: (payload: { channel: "email" | "pdf"; recipient_email?: string | null; subject?: string | null; message?: string | null }) =>
      sendPmsInvoice(selectedInvoiceId as number, payload),
    onSuccess: async (invoice) => {
      setSelectedInvoiceId(invoice.id);
      await Promise.all([invoicesQuery.refetch(), invoicePreviewQuery.refetch(), query.refetch()]);
      toast.success("Invoice delivery recorded.");
    },
    onError: (error) => {
      console.error("Failed to send invoice", error);
      toast.error("Failed to send the invoice.");
    },
  });
  const sendMessageMutation = useMutation({
    mutationFn: (payload: {
      template_id?: number | null;
      recipient_email?: string | null;
      subject?: string | null;
      body_text?: string | null;
    }) => createPmsReservationMessage(panel.data.reservationId, payload),
    onSuccess: async () => {
      await messageThreadsQuery.refetch();
      toast.success("Guest message sent.");
      setMessageForm((current) => ({
        ...current,
        subject: "",
        body_text: "",
      }));
    },
    onError: (error) => {
      console.error("Failed to send reservation message", error);
      toast.error("Failed to send the guest message.");
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-3 text-sm text-foreground-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading reservation workspace...
      </div>
    );
  }

  if (query.error || !query.data?.reservation?.reservation_id) {
    return (
      <ApiError
        message="Failed to load the reservation workspace."
        onRetry={() => void query.refetch()}
        dismissible={false}
      />
    );
  }

  const workspace = query.data;
  const reservation = workspace.reservation;
  const guest = workspace.guests[0] || null;
  const stay = workspace.stay;
  const folio = workspace.folio_summary;
  const folioLines = useMemo(() => folio.lines || [], [folio.lines]);
  const invoices = invoicesQuery.data || [];
  const messageTemplates = messageTemplatesQuery.data || [];
  const messageThreads = messageThreadsQuery.data || [];
  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) || invoices[0] || null,
    [invoices, selectedInvoiceId],
  );
  const selectedMessageTemplate = useMemo(
    () => messageTemplates.find((template) => template.id === selectedMessageTemplateId) || null,
    [messageTemplates, selectedMessageTemplateId],
  );

  useEffect(() => {
    if (!invoices.length) {
      setSelectedInvoiceId(null);
      return;
    }
    if (!selectedInvoiceId || !invoices.some((invoice) => invoice.id === selectedInvoiceId)) {
      setSelectedInvoiceId(invoices[0].id);
    }
  }, [invoices, selectedInvoiceId]);

  useEffect(() => {
    const preview = invoicePreviewQuery.data;
    if (!selectedInvoice || !preview) {
      return;
    }
    setSendForm({
      recipient_email: selectedInvoice.recipient_email || guest?.email || reservation.guest_email || "",
      subject: preview.document?.subject || `Ihre Rechnung ${selectedInvoice.invoice_number}`,
      message: preview.document?.body_text || "",
    });
  }, [
    guest?.email,
    invoicePreviewQuery.data,
    reservation.guest_email,
    selectedInvoice,
  ]);

  useEffect(() => {
    if (activeTab !== "messages") {
      return;
    }
    setMessageForm((current) => ({
      ...current,
      recipient_email: current.recipient_email || guest?.email || reservation.guest_email || "",
    }));
  }, [activeTab, guest?.email, reservation.guest_email]);

  useEffect(() => {
    if (!messageTemplates.length) {
      setSelectedMessageTemplateId(null);
      return;
    }
    if (!selectedMessageTemplateId || !messageTemplates.some((template) => template.id === selectedMessageTemplateId)) {
      setSelectedMessageTemplateId(messageTemplates[0].id);
    }
  }, [messageTemplates, selectedMessageTemplateId]);

  useEffect(() => {
    function handleRefresh() {
      void Promise.all([query.refetch(), invoicesQuery.refetch()]);
    }

    window.addEventListener(PMS_RESERVATIONS_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(PMS_RESERVATIONS_REFRESH_EVENT, handleRefresh);
  }, [invoicesQuery, query]);

  const openEditPanel = () =>
    openPanel({
      type: "reservation.edit",
      data: { reservationId: String(reservation.reservation_id) },
      title: "Edit Reservation",
    });

  const openGuestPanel = () => {
    if (!guest) {
      return;
    }
    openPanel({
      type: "guest.details",
      data: { contactId: String(guest.id) },
      title: "Guest Details",
    });
  };

  const openPaymentsPanel = () =>
    openPanel({
      type: "payments",
      data: { reservationId: String(reservation.reservation_id) },
      title: "Payments",
    });

  const openTasksPanel = () =>
    openPanel({
      type: "tasks",
      data: {
        reservationId: String(reservation.reservation_id),
        roomId: stay.room_id ? String(stay.room_id) : undefined,
      },
      title: "Tasks",
    });

  async function submitCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setChargeSaving(true);
      setChargeError(null);
      await createPmsReservationCharge(String(reservation.reservation_id), {
        description: chargeForm.description,
        quantity: Number(chargeForm.quantity || 1),
        unit_price: Number(chargeForm.unit_price || 0),
        service_date: chargeForm.service_date || null,
        charge_type: "service",
      });
      setChargeForm({
        description: "",
        quantity: "1",
        unit_price: "",
        service_date: "",
      });
      await query.refetch();
    } catch (error) {
      console.error("Failed to add reservation charge", error);
      setChargeError("Failed to add the charge to this reservation.");
    } finally {
      setChargeSaving(false);
    }
  }

  async function submitInvoiceEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoiceId) {
      return;
    }
    await sendInvoiceMutation.mutateAsync({
      channel: "email",
      recipient_email: sendForm.recipient_email || null,
      subject: sendForm.subject || null,
      message: sendForm.message || null,
    });
  }

  async function submitReservationMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessageMutation.mutateAsync({
      template_id: selectedMessageTemplateId,
      recipient_email: messageForm.recipient_email || null,
      subject: messageForm.subject || null,
      body_text: messageForm.body_text || null,
    });
  }

  async function recordPdfDelivery() {
    if (!selectedInvoiceId) {
      return;
    }
    await sendInvoiceMutation.mutateAsync({
      channel: "pdf",
      subject: sendForm.subject || null,
      message: sendForm.message || null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
              Reservation Workspace
            </p>
            <h2 className="mt-2 text-2xl font-editorial font-bold text-foreground">
              {reservation.guest_name || "Reservation"}
            </h2>
            <p className="mt-1 text-sm text-foreground-muted">{reservation.booking_id || "Hotel reservation"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="capitalize border-transparent">
              {reservation.status || "open"}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {reservation.stay_status || stay.status || "booked"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <DetailItem
            label="Stay"
            value={
              reservation.check_in && reservation.check_out
                ? `${formatDate(reservation.check_in)} - ${formatDate(reservation.check_out)}`
                : "Dates not set"
            }
          />
          <DetailItem
            label="Room"
            value={
              reservation.room
                ? `${reservation.room} · ${reservation.room_type_label || "Room"}`
                : reservation.room_type_label || "Unassigned"
            }
          />
          <DetailItem
            label="Guests"
            value={`${reservation.adults || 0} adults${reservation.children ? `, ${reservation.children} children` : ""}`}
          />
          <DetailItem
            label="Balance"
            value={formatCurrency(Number(folio.balance_due ?? reservation.folio_balance_due ?? reservation.total_amount ?? 0))}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={openEditPanel}
            className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
          >
            <PencilLine className="h-4 w-4 text-primary" />
            Edit Reservation
          </button>
          <button
            type="button"
            onClick={openGuestPanel}
            disabled={!guest}
            className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserRound className="h-4 w-4 text-primary" />
            Guest Details
          </button>
          <button
            type="button"
            onClick={openPaymentsPanel}
            className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
          >
            <CreditCard className="h-4 w-4 text-primary" />
            Payments
          </button>
          <button
            type="button"
            onClick={openTasksPanel}
            className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
          >
            <CalendarDays className="h-4 w-4 text-primary" />
            Tasks
          </button>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  : "rounded-xl px-4 py-2 text-sm font-semibold text-foreground-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "summary" ? (
        <ReservationFrontDeskOverview
          reservation={reservation}
          stay={stay}
          guest={guest}
          folio={folio}
          onRefresh={async () => {
            await Promise.all([query.refetch(), invoicesQuery.refetch()]);
          }}
          onOpenPayments={openPaymentsPanel}
          onOpenGuestPanel={openGuestPanel}
        />
      ) : null}

      {activeTab === "guest" ? (
        guest ? (
          <div className="space-y-4">
            <Card className="border border-foreground/10 bg-card shadow-none">
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-editorial text-foreground">{guest.name || reservation.guest_name || "Guest"}</h3>
                    <p className="mt-1 text-sm text-foreground-muted">
                      {guest.email || reservation.guest_email || "No email"} · {guest.phone || reservation.guest_phone || "No phone"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openGuestPanel}
                    className="inline-flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
                  >
                    <UserRound className="h-4 w-4 text-primary" />
                    Edit Guest
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailItem label="Salutation" value={guest.salutation || reservation.anrede || "Not set"} />
                  <DetailItem label="Birthday" value={guest.birthday ? formatDate(guest.birthday) : "Not set"} />
                  <DetailItem label="Country Code" value={guest.country_code || "Not set"} />
                  <DetailItem label="Country" value={guest.country_name || "Not set"} />
                  <DetailItem label="Reservations" value={String(guest.reservation_count || 0)} />
                  <DetailItem label="Last Stay" value={guest.last_stay_date ? formatDate(guest.last_stay_date) : "No stay yet"} />
                </div>
              </CardContent>
            </Card>

            <Card className="border border-foreground/10 bg-card shadow-none">
              <CardContent className="space-y-3 p-6">
                <h4 className="text-lg font-editorial text-foreground">Custom Fields</h4>
                {guest.custom_fields_json && Object.keys(guest.custom_fields_json).length ? (
                  <pre className="overflow-x-auto rounded-2xl border border-foreground/10 bg-background p-4 text-xs text-foreground-muted">
                    {JSON.stringify(guest.custom_fields_json, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-foreground-muted">No custom guest enrichment fields saved yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <WorkspaceStub
            title="No linked guest profile"
            description="This reservation does not have a synced CRM contact yet."
            icon={UserRound}
          />
        )
      ) : null}

      {activeTab === "charges" ? (
        <div className="space-y-4">
          <Card className="border border-foreground/10 bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-editorial text-foreground">Add service charge</h3>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Post extras like late check-out, minibar, or parking directly to the stay folio.
                  </p>
                </div>
                <Badge variant="outline">{folio.folio_number || "No folio"}</Badge>
              </div>

              <form className="space-y-4" onSubmit={(event) => void submitCharge(event)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Description
                    </label>
                    <input
                      required
                      value={chargeForm.description}
                      onChange={(event) =>
                        setChargeForm((current) => ({ ...current, description: event.target.value }))
                      }
                      className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Late check-out"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Quantity
                    </label>
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={chargeForm.quantity}
                      onChange={(event) =>
                        setChargeForm((current) => ({ ...current, quantity: event.target.value }))
                      }
                      className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Unit Price
                    </label>
                    <input
                      required
                      min="0.01"
                      step="0.01"
                      type="number"
                      value={chargeForm.unit_price}
                      onChange={(event) =>
                        setChargeForm((current) => ({ ...current, unit_price: event.target.value }))
                      }
                      className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="35.00"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                      Service Date
                    </label>
                    <input
                      type="date"
                      value={chargeForm.service_date}
                      onChange={(event) =>
                        setChargeForm((current) => ({ ...current, service_date: event.target.value }))
                      }
                      className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {chargeError ? <ApiError message={chargeError} dismissible={false} /> : null}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={chargeSaving}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {chargeSaving ? "Posting..." : "Add charge"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-foreground/10 bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-editorial text-foreground">Current folio lines</h3>
                <Badge variant="outline">{folioLines.length}</Badge>
              </div>
              {folioLines.length ? (
                <div className="space-y-3">
                  {folioLines.map((line) => (
                    <div key={line.id} className="flex items-start justify-between gap-4 rounded-2xl border border-foreground/10 bg-background px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{line.description}</p>
                        <p className="mt-1 text-xs text-foreground-muted">
                          {line.charge_type} · qty {line.quantity}
                          {line.service_date ? ` · ${formatDate(line.service_date)}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {formatCurrency(line.total_price)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No folio lines posted yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {activeTab === "payments" ? (
        <ReservationPaymentConsole
          folio={folio}
          reservation={reservation}
          onRefresh={async () => {
            await Promise.all([query.refetch(), invoicesQuery.refetch()]);
          }}
        />
      ) : null}

      {activeTab === "invoices" ? (
        <div className="space-y-4">
          <Card className="border border-foreground/10 bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-editorial text-foreground">Invoices</h3>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Snapshot the current folio into an invoice, preview it, and record delivery.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => ensureInvoiceMutation.mutate()}
                  disabled={ensureInvoiceMutation.isPending}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {ensureInvoiceMutation.isPending ? "Preparing..." : "Generate invoice"}
                </button>
              </div>
              {invoicesQuery.isLoading ? (
                <div className="flex items-center gap-3 text-sm text-foreground-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading invoices...
                </div>
              ) : invoicesQuery.error ? (
                <ApiError
                  message="Failed to load invoices for this reservation."
                  onRetry={() => void invoicesQuery.refetch()}
                  dismissible={false}
                />
              ) : invoices.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {invoices.map((invoice) => (
                    <button
                      key={invoice.id}
                      type="button"
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                      className={
                        selectedInvoice?.id === invoice.id
                          ? "rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-left"
                          : "rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{invoice.invoice_number}</p>
                          <p className="mt-1 text-xs text-foreground-muted">
                            {formatDateTime(invoice.created_at)} · {invoice.lines.length} line
                            {invoice.lines.length === 1 ? "" : "s"}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {invoice.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No invoice snapshot exists for this reservation yet.</p>
              )}
            </CardContent>
          </Card>

          {selectedInvoice ? (
            <>
              <Card className="border border-foreground/10 bg-card shadow-none">
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-lg font-editorial text-foreground">Invoice Summary</h3>
                    <button
                      type="button"
                      onClick={() =>
                        openPanel({
                          type: "invoice.detail",
                          data: { invoiceId: String(selectedInvoice.id) },
                          title: selectedInvoice.invoice_number,
                        })
                      }
                      className="rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
                    >
                      Open full bill workspace
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <DetailItem label="Invoice" value={selectedInvoice.invoice_number} />
                    <DetailItem label="Status" value={selectedInvoice.status} />
                    <DetailItem label="Recipient" value={selectedInvoice.recipient_name || reservation.guest_name || "Guest"} />
                    <DetailItem label="Last Delivery" value={selectedInvoice.deliveries[0]?.sent_at ? formatDateTime(selectedInvoice.deliveries[0].sent_at) : "Not sent"} />
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
                <Card className="border border-foreground/10 bg-card shadow-none">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg font-editorial text-foreground">Invoice Preview</h3>
                      {invoicePreviewQuery.isFetching ? (
                        <div className="flex items-center gap-2 text-xs text-foreground-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Refreshing preview
                        </div>
                      ) : null}
                    </div>
                    {invoicePreviewQuery.isLoading ? (
                      <div className="flex items-center gap-3 text-sm text-foreground-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading invoice preview...
                      </div>
                    ) : invoicePreviewQuery.error || !invoicePreviewQuery.data ? (
                      <ApiError
                        message="Failed to load the invoice preview."
                        onRetry={() => void invoicePreviewQuery.refetch()}
                        dismissible={false}
                      />
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-foreground/10 bg-background">
                        <div className="min-w-[820px]">
                          <Rechnung data={invoicePreviewQuery.data.preview_data} />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card className="border border-foreground/10 bg-card shadow-none">
                    <CardContent className="space-y-4 p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-editorial text-foreground">Send Invoice</h3>
                          <p className="mt-1 text-sm text-foreground-muted">
                            Use email delivery or record a PDF handoff for the front desk workflow.
                          </p>
                        </div>
                        <Mail className="h-5 w-5 text-primary" />
                      </div>

                      <form className="space-y-4" onSubmit={(event) => void submitInvoiceEmail(event)}>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                            Recipient Email
                          </label>
                          <input
                            required
                            type="email"
                            value={sendForm.recipient_email}
                            onChange={(event) =>
                              setSendForm((current) => ({ ...current, recipient_email: event.target.value }))
                            }
                            className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="guest@example.com"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                            Subject
                          </label>
                          <input
                            value={sendForm.subject}
                            onChange={(event) =>
                              setSendForm((current) => ({ ...current, subject: event.target.value }))
                            }
                            className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Ihre Rechnung"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-foreground-muted">
                            Message
                          </label>
                          <textarea
                            rows={6}
                            value={sendForm.message}
                            onChange={(event) =>
                              setSendForm((current) => ({ ...current, message: event.target.value }))
                            }
                            className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                            placeholder="Please find your invoice attached."
                          />
                        </div>
                        <div className="flex flex-wrap justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => void recordPdfDelivery()}
                            disabled={sendInvoiceMutation.isPending}
                            className="rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03] disabled:opacity-60"
                          >
                            Record PDF delivery
                          </button>
                          <button
                            type="submit"
                            disabled={sendInvoiceMutation.isPending}
                            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            {sendInvoiceMutation.isPending ? "Sending..." : "Send email"}
                          </button>
                        </div>
                      </form>
                    </CardContent>
                  </Card>

                  <Card className="border border-foreground/10 bg-card shadow-none">
                    <CardContent className="space-y-4 p-6">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-editorial text-foreground">Delivery History</h3>
                        <Badge variant="outline">{selectedInvoice.deliveries.length}</Badge>
                      </div>
                      {selectedInvoice.deliveries.length ? (
                        <div className="space-y-3">
                          {selectedInvoice.deliveries.map((delivery) => (
                            <div
                              key={delivery.id}
                              className="rounded-2xl border border-foreground/10 bg-background px-4 py-3"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold capitalize text-foreground">{delivery.channel}</p>
                                  <p className="mt-1 text-xs text-foreground-muted">
                                    {delivery.recipient_email || "No email recipient"} ·{" "}
                                    {delivery.sent_at ? formatDateTime(delivery.sent_at) : "Not sent"}
                                  </p>
                                </div>
                                <Badge variant="secondary" className="capitalize border-transparent">
                                  {delivery.status}
                                </Badge>
                              </div>
                              {delivery.subject ? (
                                <p className="mt-3 text-xs text-foreground-muted">{delivery.subject}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-foreground-muted">No invoice deliveries recorded yet.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "messages" ? (
        <div className="space-y-4">
          <Card className="border border-foreground/10 bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-editorial text-foreground">Send Guest Message</h3>
                  <p className="mt-1 text-sm text-foreground-muted">
                    Use a hotel template or send a custom email directly from the reservation workspace.
                  </p>
                </div>
              </div>

              <form className="space-y-4" onSubmit={(event) => void submitReservationMessage(event)}>
                <select
                  value={selectedMessageTemplateId ?? ""}
                  onChange={(event) =>
                    setSelectedMessageTemplateId(event.target.value ? Number(event.target.value) : null)
                  }
                  className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {messageTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.category})
                    </option>
                  ))}
                </select>
                <input
                  type="email"
                  value={messageForm.recipient_email}
                  onChange={(event) => setMessageForm((current) => ({ ...current, recipient_email: event.target.value }))}
                  placeholder="guest@example.com"
                  className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <input
                  value={messageForm.subject}
                  onChange={(event) => setMessageForm((current) => ({ ...current, subject: event.target.value }))}
                  placeholder={selectedMessageTemplate?.subject_template || "Optional subject override"}
                  className="w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <textarea
                  value={messageForm.body_text}
                  onChange={(event) => setMessageForm((current) => ({ ...current, body_text: event.target.value }))}
                  placeholder={selectedMessageTemplate?.body_template || "Optional message override"}
                  className="min-h-[180px] w-full rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-foreground-muted">
                    If subject or body is left empty, the selected template will be rendered with reservation data.
                  </p>
                  <button
                    type="submit"
                    disabled={sendMessageMutation.isPending}
                    className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-foreground/10 bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-editorial text-foreground">Message History</h3>
                <Badge variant="outline">{messageThreads.reduce((count, thread) => count + thread.events.length, 0)}</Badge>
              </div>
              {messageThreads.length ? (
                <div className="space-y-4">
                  {messageThreads.map((thread) => (
                    <div key={thread.id} className="rounded-2xl border border-foreground/10 bg-background px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{thread.subject || "Guest thread"}</p>
                          <p className="mt-1 text-xs text-foreground-muted">
                            {thread.guest_email || "No email"} ·{" "}
                            {thread.last_message_at ? formatDateTime(thread.last_message_at) : "No activity"}
                          </p>
                        </div>
                        <Badge variant="secondary" className="capitalize border-transparent">
                          {thread.status}
                        </Badge>
                      </div>
                      <div className="mt-4 space-y-3">
                        {thread.events.map((event) => (
                          <div key={event.id} className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <p className="text-sm font-semibold text-foreground">{event.subject || "Guest message"}</p>
                                <p className="mt-1 text-xs text-foreground-muted">
                                  {event.template_name || "Custom message"} ·{" "}
                                  {event.sent_at ? formatDateTime(event.sent_at) : formatDateTime(event.created_at)}
                                </p>
                              </div>
                              <Badge variant="outline" className="capitalize">{event.status}</Badge>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{event.body_text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-foreground-muted">No guest messages have been sent for this reservation yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => closePanel(panel.id)}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground-muted transition-colors hover:bg-foreground/5"
        >
          Close
        </button>
      </div>
    </div>
  );
}
