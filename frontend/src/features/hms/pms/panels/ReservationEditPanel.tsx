"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { ReservationForm } from "@/features/hms/pms/components/forms/ReservationForm";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import {
  emitPmsReservationsRefresh,
  fetchPmsReservationSummary,
  updateHotelReservationFromForm,
} from "@/features/hms/pms/api/reservations";
import { emptyReservationForm, type ReservationFormValues } from "@/features/hms/pms/schemas/reservation";
import { defaultHotelPropertyId, defaultRoomTypeName, fetchHotelRoomTypes } from "@/lib/hotel-room-types";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";

type Props = {
  panel: RightPanelInstance<"reservation.edit">;
};

export function ReservationEditPanel({ panel }: Props) {
  const { closePanel, registerSubmitHandler, setDirty } = useRightPanel();
  const [form, setForm] = useState<ReservationFormValues>(emptyReservationForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomTypesQuery = useQuery({
    queryKey: ["hotel-room-types", defaultHotelPropertyId],
    queryFn: () => fetchHotelRoomTypes(defaultHotelPropertyId),
  });
  const summaryQuery = useQuery({
    queryKey: ["pms", "reservation-summary", panel.data.reservationId],
    queryFn: () => fetchPmsReservationSummary(panel.data.reservationId),
  });

  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!summaryQuery.data || !roomTypesQuery.data?.length) {
      return;
    }
    const nextForm: ReservationFormValues = {
      anrede: summaryQuery.data.anrede || "",
      guest_name: summaryQuery.data.guest_name,
      email: summaryQuery.data.guest_email || "",
      phone: summaryQuery.data.guest_phone || "",
      room_type: summaryQuery.data.room_type_label || defaultRoomTypeName(roomTypesQuery.data),
      room: summaryQuery.data.room || "",
      check_in: summaryQuery.data.check_in,
      check_out: summaryQuery.data.check_out,
      adults: String(summaryQuery.data.adults || 1),
      children: String(summaryQuery.data.children || 0),
      special_requests: "",
      zahlungs_methode: "",
      zahlungs_status: summaryQuery.data.payment_status || "offen",
    };
    setForm(nextForm);
    initialSnapshot.current = JSON.stringify(nextForm);
    setDirty(panel.id, false);
  }, [panel.id, roomTypesQuery.data, setDirty, summaryQuery.data]);

  const dirty = useMemo(() => JSON.stringify(form) !== initialSnapshot.current, [form]);

  useEffect(() => {
    setDirty(panel.id, dirty);
  }, [dirty, panel.id, setDirty]);

  async function submitForm() {
    try {
      setSaving(true);
      setError(null);
      await updateHotelReservationFromForm(panel.data.reservationId, form);
      emitPmsReservationsRefresh();
      closePanel(panel.id);
      return true;
    } catch (submitError) {
      console.error("Failed to update hotel reservation", submitError);
      setError("Failed to update reservation.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    registerSubmitHandler(panel.id, submitForm);
    return () => registerSubmitHandler(panel.id, null);
  }, [panel.id, registerSubmitHandler, form]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-editorial font-bold text-foreground">Edit Reservation</h2>
        <p className="text-sm text-foreground-muted mt-1">
          Update the existing reservation without leaving the current workspace.
        </p>
      </div>
      {summaryQuery.isLoading || roomTypesQuery.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading reservation details...
        </div>
      ) : (
        <ReservationForm values={form} onChange={setForm} roomTypes={roomTypesQuery.data || []} />
      )}
      {error && <ApiError message={error} dismissible={false} />}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => closePanel(panel.id)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/5 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submitForm()}
          disabled={saving || summaryQuery.isLoading}
          className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

