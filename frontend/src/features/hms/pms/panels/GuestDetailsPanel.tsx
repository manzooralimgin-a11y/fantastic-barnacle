"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, User, Mail, Phone, CalendarDays, Globe, Tag } from "lucide-react";
import { ApiError } from "@/components/shared/api-error";
import { fetchPmsContact, updatePmsContact } from "@/features/hms/pms/api/contacts";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { RightPanelInstance } from "@/features/hms/pms/components/right-panel/RightPanelProvider";

type Props = {
  panel: RightPanelInstance<"guest.details">;
};

type FormState = {
  name: string;
  email: string;
  phone: string;
  salutation: string;
  birthday: string;
  country_code: string;
  country_name: string;
};

function FieldGroup({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#8ab89a]">
        <Icon className="h-3 w-3" />
        {label}
      </label>
      {children}
    </div>
  );
}

// Dark-green panel palette
const panelBg = "bg-[#15302200]"; // applied at wrapper level via className
const cardCls = "rounded-2xl border border-[#3a6b4a]/40 bg-[#1a3d2b] p-4 space-y-4";
const labelCls = "text-[10px] font-bold uppercase tracking-widest text-[#8ab89a]";
const inputCls =
  "w-full rounded-xl border border-[#3a6b4a]/60 bg-[#122a1d] px-3 py-2.5 text-sm text-[#f0e8d4] outline-none focus:ring-2 focus:ring-[#5d9e72]/40 transition-shadow placeholder:text-[#6d9b7b]/60";

export function GuestDetailsPanel({ panel }: Props) {
  const { closePanel, registerSubmitHandler, setDirty } = useRightPanel();

  const query = useQuery({
    queryKey: ["pms", "contact", panel.data.contactId],
    queryFn: () => fetchPmsContact(panel.data.contactId),
  });

  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    phone: "",
    salutation: "",
    birthday: "",
    country_code: "",
    country_name: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialSnapshot = useRef("");

  useEffect(() => {
    if (!query.data) return;
    const next: FormState = {
      name: query.data.name || "",
      email: query.data.email || "",
      phone: query.data.phone || "",
      salutation: query.data.salutation || "",
      birthday: query.data.birthday || "",
      country_code: query.data.country_code || "",
      country_name: query.data.country_name || "",
    };
    setForm(next);
    initialSnapshot.current = JSON.stringify(next);
    setDirty(panel.id, false);
  }, [panel.id, query.data, setDirty]);

  const dirty = useMemo(() => JSON.stringify(form) !== initialSnapshot.current, [form]);

  useEffect(() => {
    setDirty(panel.id, dirty);
  }, [dirty, panel.id, setDirty]);

  function set(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  async function submitForm() {
    try {
      setSaving(true);
      setError(null);
      await updatePmsContact(panel.data.contactId, {
        name: form.name || null,
        email: form.email || null,
        phone: form.phone || null,
        salutation: form.salutation || null,
        birthday: form.birthday || null,
        country_code: form.country_code || null,
        country_name: form.country_name || null,
      });
      closePanel(panel.id);
      return true;
    } catch (err) {
      console.error("Failed to update contact", err);
      setError("Failed to save guest details. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    registerSubmitHandler(panel.id, submitForm);
    return () => registerSubmitHandler(panel.id, null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel.id, registerSubmitHandler, form]);

  return (
    <div className="space-y-6 rounded-2xl bg-[#112a1c] p-5 min-h-full">
      <div>
        <h2 className="text-2xl font-editorial font-bold text-[#f0e8d4]">Guest Details</h2>
        <p className="text-sm text-[#8ab89a] mt-1">
          Edit contact information for this guest.
        </p>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-3 text-sm text-[#8ab89a] py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading guest…
        </div>
      ) : (
        <div className="space-y-5">
          {/* Identity */}
          <div className={cardCls}>
            <p className={labelCls}>Identity</p>

            <FieldGroup icon={Tag} label="Salutation">
              <select value={form.salutation} onChange={set("salutation")} className={`${inputCls} [&>option]:bg-[#122a1d] [&>option]:text-[#f0e8d4]`}>
                <option value="">— Select —</option>
                <option value="Herr">Herr</option>
                <option value="Frau">Frau</option>
                <option value="Mx">Mx</option>
                <option value="Dr.">Dr.</option>
                <option value="Prof.">Prof.</option>
              </select>
            </FieldGroup>

            <FieldGroup icon={User} label="Full Name">
              <input
                value={form.name}
                onChange={set("name")}
                placeholder="Anna Fischer"
                className={inputCls}
              />
            </FieldGroup>

            <FieldGroup icon={CalendarDays} label="Date of Birth">
              <input
                type="date"
                value={form.birthday}
                onChange={set("birthday")}
                className={inputCls}
              />
            </FieldGroup>
          </div>

          {/* Contact */}
          <div className={cardCls}>
            <p className={labelCls}>Contact</p>

            <FieldGroup icon={Mail} label="Email Address">
              <input
                type="email"
                value={form.email}
                onChange={set("email")}
                placeholder="anna.fischer@example.com"
                className={inputCls}
              />
            </FieldGroup>

            <FieldGroup icon={Phone} label="Phone Number">
              <input
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="+49 40 123456"
                className={inputCls}
              />
            </FieldGroup>
          </div>

          {/* Location */}
          <div className={cardCls}>
            <p className={labelCls}>Location</p>

            <div className="grid grid-cols-[100px_1fr] gap-3">
              <FieldGroup icon={Globe} label="Code">
                <input
                  value={form.country_code}
                  onChange={set("country_code")}
                  placeholder="DE"
                  maxLength={3}
                  className={inputCls}
                />
              </FieldGroup>
              <FieldGroup icon={Globe} label="Country">
                <input
                  value={form.country_name}
                  onChange={set("country_name")}
                  placeholder="Germany"
                  className={inputCls}
                />
              </FieldGroup>
            </div>
          </div>

          {/* Read-only stats */}
          {query.data && (
            <div className={cardCls}>
              <p className={labelCls}>Stay History</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[#6d9b7b]">Total Stays</p>
                  <p className="text-lg font-editorial font-bold text-[#f0e8d4]">
                    {query.data.reservation_count}
                  </p>
                </div>
                {query.data.last_stay_date && (
                  <div>
                    <p className="text-[10px] text-[#6d9b7b]">Last Stay</p>
                    <p className="text-sm font-semibold text-[#f0e8d4]">
                      {new Date(query.data.last_stay_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <ApiError message={error} dismissible={false} />}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => closePanel(panel.id)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-[#8ab89a] hover:bg-[#1a3d2b] transition-colors"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => void submitForm()}
          disabled={saving || query.isLoading || !dirty}
          className="bg-[#3a7d52] text-[#f0e8d4] px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : "Save Guest"}
        </button>
      </div>
    </div>
  );
}
