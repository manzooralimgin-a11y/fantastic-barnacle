"use client";

import { addDays, format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { ReservationForm } from "@/features/hms/pms/components/forms/ReservationForm";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import { createHotelReservationFromForm, emitPmsReservationsRefresh } from "@/features/hms/pms/api/reservations";
import { emptyReservationForm, type ReservationFormValues } from "@/features/hms/pms/schemas/reservation";
import { defaultHotelPropertyId, defaultRoomTypeName, fetchHotelRoomTypes } from "@/lib/hotel-room-types";
import { getApiErrorMessage } from "@/lib/api";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";

type Props = {
  panel: RightPanelInstance<"reservation.create">;
};

export function ReservationCreatePanel({ panel }: Props) {
  const { closePanel, registerSubmitHandler, setDirty } = useRightPanel();
  const [form, setForm] = useState<ReservationFormValues>(emptyReservationForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomTypesQuery = useQuery({
    queryKey: ["hotel-room-types", defaultHotelPropertyId],
    queryFn: () => fetchHotelRoomTypes(defaultHotelPropertyId),
  });

  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!roomTypesQuery.data?.length) {
      return;
    }
    const checkIn = panel.data.date || format(new Date(), "yyyy-MM-dd");
    const nextForm = {
      ...emptyReservationForm,
      room_type: defaultRoomTypeName(roomTypesQuery.data),
      room: panel.data.roomId || "",
      check_in: checkIn,
      check_out: format(addDays(new Date(checkIn), 1), "yyyy-MM-dd"),
    };
    setForm(nextForm);
    initialSnapshot.current = JSON.stringify(nextForm);
    setDirty(panel.id, false);
  }, [panel.data.date, panel.data.roomId, panel.id, roomTypesQuery.data, setDirty]);

  const dirty = useMemo(() => JSON.stringify(form) !== initialSnapshot.current, [form]);

  useEffect(() => {
    setDirty(panel.id, dirty);
  }, [dirty, panel.id, setDirty]);

  async function submitForm() {
    if (!form.guest_name || !form.room_type || !form.check_in || !form.check_out) {
      setError("Guest, room type, check-in, and check-out are required.");
      return false;
    }
    try {
      setSaving(true);
      setError(null);
      await createHotelReservationFromForm(form, Number(panel.data.propertyId || defaultHotelPropertyId));
      emitPmsReservationsRefresh();
      closePanel(panel.id);
      return true;
    } catch (submitError) {
      setError(
        getApiErrorMessage(
          submitError,
          "Reservation could not be created. Please review room availability and the selected dates.",
        ),
      );
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
        <h2 className="text-2xl font-editorial font-bold text-foreground">Create Reservation</h2>
        <p className="text-sm text-foreground-muted mt-1">
          Canonical hotel reservation flow using the shared reservation service.
        </p>
      </div>
      {roomTypesQuery.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading reservation form...
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
          disabled={saving || roomTypesQuery.isLoading}
          className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {saving ? "Saving..." : "Create Reservation"}
        </button>
      </div>
    </div>
  );
}
