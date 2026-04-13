"use client";

/**
 * GuestQuickActionsDrawer — Screenshot 2
 *
 * Right-side drawer that opens when "Manage Guest" is clicked.
 * Shows:
 *  • Quick Add Services (Parking / Breakfast / Pet Fee) icon toggles
 *  • Room Management with Change Room button
 *  • Guest Details (name / email / phone)
 *  • Billing & Company toggle + company field
 *  • Total balance + Open Payment CTA (red)
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X,
  Car,
  UtensilsCrossed,
  PawPrint,
  ArrowRight,
  AlertCircle,
  BedDouble,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fetchPmsReservationSummary } from "@/features/hms/pms/api/reservations";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type AddOns = { parking: boolean; breakfast: boolean; pet: boolean };

export type GuestQuickActionsDrawerProps = {
  guest: PmsCockpitItem | null;
  open: boolean;
  onClose: () => void;
  onOpenPayment: () => void;
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors duration-200 flex-shrink-0",
        checked ? "bg-primary" : "bg-foreground/20",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

function ServiceButton({
  icon: Icon,
  label,
  shortLabel,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  shortLabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 transition-all duration-150",
        active
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-sm"
          : "border-foreground/10 bg-zinc-50 dark:bg-zinc-800/40 text-foreground-muted hover:text-foreground hover:border-foreground/20",
      )}
    >
      <Icon className="h-6 w-6" />
      <span className="text-xs font-semibold">{shortLabel ?? label}</span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GuestQuickActionsDrawer({
  guest,
  open,
  onClose,
  onOpenPayment,
}: GuestQuickActionsDrawerProps) {
  const [addOns, setAddOns] = useState<AddOns>({
    parking: false,
    breakfast: false,
    pet: false,
  });
  const [billToCompany, setBillToCompany] = useState(false);
  const [companyName, setCompanyName] = useState("");

  const { data: summary } = useQuery({
    queryKey: ["pms", "reservation-summary", guest?.reservation_id],
    queryFn: () => fetchPmsReservationSummary(guest!.reservation_id, defaultHotelPropertyId),
    enabled: open && Boolean(guest?.reservation_id),
    staleTime: 30_000,
  });

  if (!guest) return null;

  const toggle = (key: keyof AddOns) =>
    setAddOns((prev) => ({ ...prev, [key]: !prev[key] }));

  const balance = summary?.folio_balance_due ?? guest.total_amount;

  function fmtEur(n: number) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm w-full max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border border-foreground/10 gap-0 ml-auto mr-4 mt-4 bg-white dark:bg-zinc-900">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 border-b border-foreground/10 px-6 py-5 flex-shrink-0">
          <div className="min-w-0">
            <DialogTitle className="font-bold text-xl text-foreground truncate">
              {guest.guest_name}
            </DialogTitle>
            <p className="text-sm text-foreground-muted mt-0.5">
              Reservation #{guest.booking_id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-foreground/[0.06] transition-colors flex-shrink-0 mt-0.5"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Quick Add Services */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-3">
              Quick Add Services
            </p>
            <div className="grid grid-cols-3 gap-3">
              <ServiceButton
                icon={Car}
                label="Parking"
                active={addOns.parking}
                onClick={() => toggle("parking")}
              />
              <ServiceButton
                icon={UtensilsCrossed}
                label="Breakfast"
                active={addOns.breakfast}
                onClick={() => toggle("breakfast")}
              />
              <ServiceButton
                icon={PawPrint}
                label="Pet Fee"
                active={addOns.pet}
                onClick={() => toggle("pet")}
              />
            </div>
          </section>

          {/* Room Management */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-3">
              Room Management
            </p>
            <div className="rounded-2xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-800/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 flex-shrink-0 rounded-xl bg-foreground text-background flex items-center justify-center font-bold text-lg select-none">
                  {guest.room ?? <BedDouble className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {guest.room_type_label ?? "Hotel Room"}
                  </p>
                  {summary?.booking_source && (
                    <p className="text-xs text-foreground-muted mt-0.5">
                      via {summary.booking_source}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="flex-shrink-0 text-xs font-semibold text-foreground border border-foreground/10 rounded-xl px-3 py-1.5 hover:bg-foreground/[0.04] transition-colors"
                >
                  Change Room
                </button>
              </div>
            </div>
          </section>

          {/* Guest Details */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                Guest Details
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-primary hover:opacity-80 transition-opacity"
              >
                Edit All
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Name", value: guest.guest_name },
                { label: "Email", value: summary?.guest_email ?? "—" },
                { label: "Phone", value: summary?.guest_phone ?? "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-0.5">
                    {label}
                  </p>
                  <p className="text-sm text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Billing & Company */}
          <section>
            <div className="rounded-2xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-800/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                  Billing & Company
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-muted">Guest Name</span>
                  <Toggle checked={billToCompany} onChange={setBillToCompany} />
                </div>
              </div>
              {billToCompany && (
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Company name"
                  className="w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                />
              )}
            </div>
          </section>
        </div>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div className="border-t border-foreground/10 p-5 flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground-muted font-medium">Total Balance</p>
            <p className="text-2xl font-bold text-foreground">{fmtEur(balance)}</p>
          </div>
          <button
            type="button"
            onClick={() => { onClose(); onOpenPayment(); }}
            className="w-full flex items-center justify-between rounded-2xl bg-rose-600 text-white px-5 py-3.5 font-bold text-sm hover:opacity-90 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Open Payment
            </div>
            <div className="flex items-center gap-1">
              Pay Now
              <ArrowRight className="h-4 w-4" />
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
