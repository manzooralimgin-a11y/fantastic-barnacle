"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CreditCard, Loader2, PencilLine, ScrollText, UserRound } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { useReservationSummary } from "@/features/hms/pms/hooks/useReservationSummary";

function formatDateRange(checkIn: string, checkOut: string) {
  return `${new Date(checkIn).toLocaleDateString("de-DE")} - ${new Date(checkOut).toLocaleDateString("de-DE")}`;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

type Props = {
  reservationId: string | number | null;
  emptyTitle?: string;
  emptyDescription?: string;
};

export function ReservationSummaryRail({
  reservationId,
  emptyTitle = "No reservation selected",
  emptyDescription = "Select a reservation from the board or cockpit to see a live PMS summary here.",
}: Props) {
  const router = useRouter();
  const { openPanel } = useRightPanel();
  const query = useReservationSummary(reservationId);

  const summaryFacts = useMemo(() => {
    if (!query.data) {
      return [];
    }
    const paymentLabel =
      query.data.zahlungs_status ||
      query.data.invoice_state ||
      query.data.payment_status ||
      "offen";

    return [
      {
        label: "Abreise",
        value: new Date(query.data.check_out).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }),
      },
      {
        label: "Aufenthalt",
        value: formatDateRange(query.data.check_in, query.data.check_out),
      },
      {
        label: "Zimmer",
        value: query.data.room
          ? `${query.data.room} · ${query.data.room_type_label || "Hotel room"}`
          : query.data.room_type_label || "Nicht zugewiesen",
      },
      {
        label: "Gäste",
        value: `${query.data.adults} Erw.${query.data.children ? ` · ${query.data.children} Kinder` : ""}`,
      },
      {
        label: "Quelle",
        value: query.data.booking_source || "—",
      },
      {
        label: "Zahlung",
        value: `${formatCurrency(query.data.total_amount, query.data.currency)} · ${paymentLabel}`,
      },
    ];
  }, [query.data]);

  if (!reservationId) {
    return (
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
        <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
          <CardTitle className="text-lg font-editorial text-foreground">{emptyTitle}</CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-sm text-foreground-muted">{emptyDescription}</CardContent>
      </Card>
    );
  }

  if (query.isLoading) {
    return (
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
        <CardContent className="p-6 flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading reservation summary...
        </CardContent>
      </Card>
    );
  }

  if (query.error || !query.data) {
    return (
      <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
        <CardContent className="p-6">
          <ApiError message="Failed to load the PMS reservation summary." onRetry={() => void query.refetch()} dismissible={false} />
        </CardContent>
      </Card>
    );
  }

  const summary = query.data;

  return (
    <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
      <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Reservation Summary</p>
            <div className="mt-2 flex items-center gap-2">
              {summary.color_tag && (
                <span
                  className="h-3 w-3 flex-shrink-0 rounded-full border border-foreground/20"
                  style={{ background: summary.color_tag }}
                />
              )}
              <CardTitle className="text-xl font-editorial text-foreground truncate">{summary.guest_name}</CardTitle>
            </div>
            <p className="mt-1.5 text-sm font-mono text-foreground-muted">{summary.booking_id}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="secondary" className="capitalize border-transparent">{summary.status}</Badge>
            <Badge variant="outline" className="capitalize">{summary.invoice_state || "open"}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="grid gap-3">
          {summaryFacts.map((item) => (
            <div key={item.label} className="flex items-start justify-between gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{item.label}</span>
              <span className="text-right text-sm font-medium text-foreground">{item.value}</span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Quick Actions</p>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() =>
                openPanel({
                  type: "reservation.edit",
                  data: { reservationId: String(summary.reservation_id) },
                  title: "Edit Reservation",
                })
              }
              className="flex items-center justify-between rounded-2xl border border-foreground/10 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
            >
              <span>Edit Reservation</span>
              <PencilLine className="h-4 w-4 text-primary" />
            </button>

            <button
              type="button"
              disabled={!summary.guest_id}
              onClick={() =>
                summary.guest_id &&
                openPanel({
                  type: "guest.details",
                  data: { contactId: String(summary.guest_id) },
                  title: "Guest Details",
                })
              }
              className="flex items-center justify-between rounded-2xl border border-foreground/10 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Guest Details</span>
              <UserRound className="h-4 w-4 text-primary" />
            </button>

            <button
              type="button"
              onClick={() =>
                openPanel({
                  type: "payments",
                  data: { reservationId: String(summary.reservation_id) },
                  title: "Payments",
                })
              }
              className="flex items-center justify-between rounded-2xl border border-foreground/10 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
            >
              <span>Payments</span>
              <CreditCard className="h-4 w-4 text-primary" />
            </button>

            <button
              type="button"
              onClick={() =>
                openPanel({
                  type: "tasks",
                  data: { reservationId: String(summary.reservation_id) },
                  title: "Tasks",
                })
              }
              className="flex items-center justify-between rounded-2xl border border-foreground/10 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
            >
              <span>Tasks</span>
              <CalendarDays className="h-4 w-4 text-primary" />
            </button>

            <button
              type="button"
              onClick={() => router.push(`/hms/documents?reservationId=${summary.reservation_id}`)}
              className="flex items-center justify-between rounded-2xl border border-foreground/10 px-4 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
            >
              <span>Documents</span>
              <ScrollText className="h-4 w-4 text-primary" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
