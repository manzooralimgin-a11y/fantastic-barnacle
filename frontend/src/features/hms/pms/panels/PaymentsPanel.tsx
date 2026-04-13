"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { fetchPmsReservationFolios } from "@/features/hms/pms/api/billing";
import { fetchPmsReservationSummary } from "@/features/hms/pms/api/reservations";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";
import { ReservationPaymentConsole } from "@/features/hms/pms/components/workspace/ReservationPaymentConsole";

type Props = {
  panel: RightPanelInstance<"payments">;
};

export function PaymentsPanel({ panel }: Props) {
  const { closePanel } = useRightPanel();
  const foliosQuery = useQuery({
    queryKey: ["pms", "payments-panel", panel.data.reservationId],
    queryFn: () => fetchPmsReservationFolios(panel.data.reservationId || ""),
    enabled: Boolean(panel.data.reservationId),
  });
  const summaryQuery = useQuery({
    queryKey: ["pms", "payments-panel-summary", panel.data.reservationId],
    queryFn: () => fetchPmsReservationSummary(panel.data.reservationId || ""),
    enabled: Boolean(panel.data.reservationId),
  });

  const primaryFolio = foliosQuery.data?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-editorial font-bold text-foreground">Payments</h2>
        <p className="text-sm text-foreground-muted mt-1">Stay folios, charges, and payments for this reservation.</p>
      </div>
      {foliosQuery.isLoading || summaryQuery.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading folios...
        </div>
      ) : foliosQuery.error || summaryQuery.error ? (
        <ApiError
          message="Failed to load folios for this reservation."
          onRetry={() => void Promise.all([foliosQuery.refetch(), summaryQuery.refetch()])}
          dismissible={false}
        />
      ) : !primaryFolio || !summaryQuery.data ? (
        <p className="text-sm text-foreground-muted">No folio is linked to this reservation yet.</p>
      ) : (
        <ReservationPaymentConsole
          folio={primaryFolio}
          reservation={summaryQuery.data}
          onRefresh={async () => {
            await Promise.all([foliosQuery.refetch(), summaryQuery.refetch()]);
          }}
        />
      )}
      <div className="flex justify-end">
        <button type="button" onClick={() => closePanel(panel.id)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/5 transition-colors">Close</button>
      </div>
    </div>
  );
}
