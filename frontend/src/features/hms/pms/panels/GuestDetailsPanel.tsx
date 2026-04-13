"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { fetchPmsContact, updatePmsContact } from "@/features/hms/pms/api/contacts";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";

type Props = {
  panel: RightPanelInstance<"guest.details">;
};

export function GuestDetailsPanel({ panel }: Props) {
  const { closePanel, registerSubmitHandler, setDirty } = useRightPanel();
  const query = useQuery({
    queryKey: ["pms", "contact", panel.data.contactId],
    queryFn: () => fetchPmsContact(panel.data.contactId),
  });
  const [form, setForm] = useState({
    salutation: "",
    birthday: "",
    country_code: "",
    country_name: "",
    custom_fields_json: "{}",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!query.data) {
      return;
    }
    const next = {
      salutation: query.data.salutation || "",
      birthday: query.data.birthday || "",
      country_code: query.data.country_code || "",
      country_name: query.data.country_name || "",
      custom_fields_json: JSON.stringify(query.data.custom_fields_json || {}, null, 2),
    };
    setForm(next);
    initialSnapshot.current = JSON.stringify(next);
    setDirty(panel.id, false);
  }, [panel.id, query.data, setDirty]);

  const dirty = useMemo(() => JSON.stringify(form) !== initialSnapshot.current, [form]);

  useEffect(() => {
    setDirty(panel.id, dirty);
  }, [dirty, panel.id, setDirty]);

  async function submitForm() {
    try {
      setSaving(true);
      setError(null);
      await updatePmsContact(panel.data.contactId, {
        salutation: form.salutation || null,
        birthday: form.birthday || null,
        country_code: form.country_code || null,
        country_name: form.country_name || null,
        custom_fields_json: JSON.parse(form.custom_fields_json || "{}"),
      });
      closePanel(panel.id);
      return true;
    } catch (submitError) {
      console.error("Failed to update contact", submitError);
      setError("Failed to update contact details.");
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
        <h2 className="text-2xl font-editorial font-bold text-foreground">Guest Details</h2>
        <p className="text-sm text-foreground-muted mt-1">Edit enriched CRM fields for this contact.</p>
      </div>
      {query.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-foreground-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading contact...
        </div>
      ) : (
        <div className="space-y-4">
          <input value={form.salutation} onChange={(event) => setForm((current) => ({ ...current, salutation: event.target.value }))} placeholder="Salutation" className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
          <input type="date" value={form.birthday} onChange={(event) => setForm((current) => ({ ...current, birthday: event.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
          <div className="grid grid-cols-2 gap-4">
            <input value={form.country_code} onChange={(event) => setForm((current) => ({ ...current, country_code: event.target.value }))} placeholder="Country code" className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
            <input value={form.country_name} onChange={(event) => setForm((current) => ({ ...current, country_name: event.target.value }))} placeholder="Country name" className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <textarea value={form.custom_fields_json} onChange={(event) => setForm((current) => ({ ...current, custom_fields_json: event.target.value }))} className="min-h-40 w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      )}
      {error && <ApiError message={error} dismissible={false} />}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => closePanel(panel.id)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/5 transition-colors">Close</button>
        <button type="button" onClick={() => void submitForm()} disabled={saving || query.isLoading} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? "Saving..." : "Save Guest"}
        </button>
      </div>
    </div>
  );
}

