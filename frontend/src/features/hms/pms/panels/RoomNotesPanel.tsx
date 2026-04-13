"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, NotebookPen, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { fetchHousekeepingRoomNote, updateHousekeepingRoomNote } from "@/lib/hms";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";

type Props = {
  panel: RightPanelInstance<"room.notes">;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function RoomNotesPanel({ panel }: Props) {
  const { closePanel, registerSubmitHandler, setDirty } = useRightPanel();
  const [noteDate, setNoteDate] = useState(panel.data.noteDate || todayIso());
  const [form, setForm] = useState({
    housekeeping_note: "",
    maintenance_note: "",
    maintenance_required: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialSnapshot = useRef("");

  const query = useQuery({
    queryKey: ["hms", "room-note", panel.data.roomId, noteDate],
    queryFn: () => fetchHousekeepingRoomNote(Number(panel.data.roomId), noteDate),
    enabled: Boolean(panel.data.roomId && noteDate),
  });

  useEffect(() => {
    if (!query.data) {
      return;
    }
    const next = {
      housekeeping_note: query.data.housekeeping_note || "",
      maintenance_note: query.data.maintenance_note || "",
      maintenance_required: query.data.maintenance_required || false,
    };
    setForm(next);
    initialSnapshot.current = JSON.stringify({ ...next, noteDate });
    setDirty(panel.id, false);
  }, [noteDate, panel.id, query.data, setDirty]);

  const dirty = useMemo(
    () => JSON.stringify({ ...form, noteDate }) !== initialSnapshot.current,
    [form, noteDate],
  );

  useEffect(() => {
    setDirty(panel.id, dirty);
  }, [dirty, panel.id, setDirty]);

  async function submitForm() {
    try {
      setSaving(true);
      setError(null);
      const saved = await updateHousekeepingRoomNote(Number(panel.data.roomId), {
        note_date: noteDate,
        housekeeping_note: form.housekeeping_note || null,
        maintenance_note: form.maintenance_note || null,
        maintenance_required: form.maintenance_required,
      });
      const next = {
        housekeeping_note: saved.housekeeping_note || "",
        maintenance_note: saved.maintenance_note || "",
        maintenance_required: saved.maintenance_required,
      };
      setForm(next);
      initialSnapshot.current = JSON.stringify({ ...next, noteDate });
      setDirty(panel.id, false);
      toast.success("Room note saved.");
      await query.refetch();
      return true;
    } catch (submitError) {
      console.error("Failed to save room note", submitError);
      setError("Failed to save the room note.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    registerSubmitHandler(panel.id, submitForm);
    return () => registerSubmitHandler(panel.id, null);
  }, [panel.id, registerSubmitHandler, noteDate, form]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-editorial font-bold text-foreground">
          Room Notes
        </h2>
        <p className="mt-1 text-sm text-foreground-muted">
          {panel.data.roomNumber ? `Room ${panel.data.roomNumber}` : "Selected room"} daily housekeeping and maintenance notes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">Date</p>
          <input
            type="date"
            value={noteDate}
            onChange={(event) => setNoteDate(event.target.value)}
            className="mt-2 w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-end">
          <Badge variant="outline" className="capitalize">
            {query.data?.room_type_name || "Room"}
          </Badge>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading room note...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <NotebookPen className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-lg font-editorial text-foreground">Housekeeping Note</h3>
                <p className="text-sm text-foreground-muted">Arrival prep, cleaning reminders, and guest-facing instructions.</p>
              </div>
            </div>
            <textarea
              rows={6}
              value={form.housekeeping_note}
              onChange={(event) => setForm((current) => ({ ...current, housekeeping_note: event.target.value }))}
              className="w-full rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="VIP arrival at 18:00, flowers on desk, extra towels."
            />
          </div>

          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-status-danger/10 p-2 text-status-danger">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-lg font-editorial text-foreground">Maintenance Note</h3>
                <p className="text-sm text-foreground-muted">Track room defects and flag items that need follow-up.</p>
              </div>
            </div>
            <textarea
              rows={5}
              value={form.maintenance_note}
              onChange={(event) => setForm((current) => ({ ...current, maintenance_note: event.target.value }))}
              className="w-full rounded-2xl border border-foreground/10 bg-background px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Bathroom lamp flickers. Check extractor fan."
            />
            <label className="mt-4 flex items-center gap-3 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.maintenance_required}
                onChange={(event) =>
                  setForm((current) => ({ ...current, maintenance_required: event.target.checked }))
                }
                className="h-4 w-4 rounded border-foreground/20"
              />
              Flag maintenance follow-up task
            </label>
          </div>
        </div>
      )}

      {error ? <ApiError message={error} dismissible={false} /> : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => closePanel(panel.id)}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground-muted transition-colors hover:bg-foreground/5"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => void submitForm()}
          disabled={saving || query.isLoading}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Note"}
        </button>
      </div>
    </div>
  );
}
