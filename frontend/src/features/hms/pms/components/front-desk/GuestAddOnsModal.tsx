"use client";

/**
 * GuestAddOnsModal — Screenshot 3
 *
 * Two-column dialog:
 *   Left  — Guest Add-Ons toggles (Parking / Breakfast / Pets)
 *           + Billing Details (company name, address, tax ID)
 *   Right — Live Bill Preview (real-time line-item receipt)
 *
 * Footer — Print Folio | Cancel | Save Changes
 */

import { useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Car, UtensilsCrossed, PawPrint, Printer, UserRound, CreditCard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { cn } from "@/lib/utils";

// ── Rates ──────────────────────────────────────────────────────────────────────

const PARKING_RATE = 15;
const BREAKFAST_RATE = 25;
const PETS_FEE = 40;
const CITY_TAX = 18;
const TAX_RATE = 0.1;

// ── Types ──────────────────────────────────────────────────────────────────────

type AddOns = { parking: boolean; breakfast: boolean; pets: boolean };
type Billing = {
  enabled: boolean;
  companyName: string;
  address: string;
  taxId: string;
};

export type GuestAddOnsModalProps = {
  guest: PmsCockpitItem | null;
  open: boolean;
  onClose: () => void;
};

// ── Toggle ─────────────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

export function GuestAddOnsModal({ guest, open, onClose }: GuestAddOnsModalProps) {
  const [addOns, setAddOns] = useState<AddOns>({
    parking: false,
    breakfast: false,
    pets: false,
  });
  const [billing, setBilling] = useState<Billing>({
    enabled: false,
    companyName: "",
    address: "",
    taxId: "",
  });

  if (!guest) return null;

  const nights = Math.max(
    differenceInCalendarDays(
      new Date(guest.check_out + "T00:00:00"),
      new Date(guest.check_in + "T00:00:00"),
    ),
    1,
  );

  const baseRate = guest.total_amount;
  const parkingTotal = addOns.parking ? PARKING_RATE * nights : 0;
  const breakfastTotal = addOns.breakfast ? BREAKFAST_RATE * nights : 0;
  const petsTotal = addOns.pets ? PETS_FEE : 0;
  const subtotal = baseRate + parkingTotal + breakfastTotal + petsTotal + CITY_TAX;
  const tax = +(subtotal * TAX_RATE).toFixed(2);
  const total = subtotal + tax;

  const checkOutFormatted = new Date(guest.check_out + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const todayFormatted = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  const isSettled = (guest.payment_status || "").toLowerCase().includes("paid");

  function fmtEur(n: number) {
    return `€${n.toFixed(2)}`;
  }

  const addonRows = [
    {
      key: "parking" as const,
      Icon: Car,
      label: "Car Parking",
      sub: `+€${PARKING_RATE} per night`,
    },
    {
      key: "breakfast" as const,
      Icon: UtensilsCrossed,
      label: "Breakfast",
      sub: `+€${BREAKFAST_RATE} per night`,
    },
    {
      key: "pets" as const,
      Icon: PawPrint,
      label: "Pets",
      sub: `+€${PETS_FEE} flat fee`,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col p-0 rounded-2xl gap-0 border border-foreground/10 bg-white dark:bg-zinc-900">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 border-b border-foreground/10 px-6 py-5 flex-shrink-0">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <UserRound className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-foreground truncate">
              Guest Details: {guest.guest_name} (Room {guest.room ?? "TBD"})
            </DialogTitle>
            <p className="text-sm text-foreground-muted mt-0.5">
              Reservation ID: #{guest.booking_id} · Checking out: {checkOutFormatted}
            </p>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[1fr_380px] divide-x divide-foreground/10">

          {/* Left col — Add-ons + Billing */}
          <div className="p-6 space-y-6">

            {/* Guest Add-Ons */}
            <section>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-3">
                Guest Add-Ons
              </p>
              <div className="space-y-2">
                {addonRows.map(({ key, Icon, label, sub }) => (
                  <div
                    key={key}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                      addOns[key]
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-foreground/10 bg-zinc-50/80 dark:bg-zinc-800/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          addOns[key] ? "text-primary" : "text-foreground-muted",
                        )}
                      />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{label}</p>
                        <p className="text-xs text-foreground-muted">{sub}</p>
                      </div>
                    </div>
                    <Toggle
                      checked={addOns[key]}
                      onChange={(v) => setAddOns((p) => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Billing Details */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                  Billing Details
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-muted">Bill to Company</span>
                  <Toggle
                    checked={billing.enabled}
                    onChange={(v) => setBilling((p) => ({ ...p, enabled: v }))}
                  />
                </div>
              </div>
              {billing.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Company Name</label>
                    <input
                      value={billing.companyName}
                      onChange={(e) => setBilling((p) => ({ ...p, companyName: e.target.value }))}
                      placeholder="Acme Dynamics Corp"
                      className="w-full rounded-xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Business Address</label>
                    <textarea
                      rows={2}
                      value={billing.address}
                      onChange={(e) => setBilling((p) => ({ ...p, address: e.target.value }))}
                      placeholder="123 Business St, Suite 500, City"
                      className="w-full rounded-xl border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-shadow resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-foreground-muted mb-1 block">Tax ID / VAT Number</label>
                    <input
                      value={billing.taxId}
                      onChange={(e) => setBilling((p) => ({ ...p, taxId: e.target.value }))}
                      placeholder="DE-123456789"
                      className="w-full rounded-xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                    />
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right col — Live Bill Preview */}
          <div className="p-6">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-4">
              Live Bill Preview
            </p>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">

              {/* Hotel header */}
              <div className="flex items-start justify-between">
                <div>
                  <p
                    className="text-teal-700 font-bold text-xl"
                    style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}
                  >
                    Das ELB
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 mt-0.5">
                    Hamburg Waterfront Hotel
                  </p>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Date: {todayFormatted}</p>
              </div>

              {/* Billing name */}
              <p className="text-sm text-slate-700 font-medium">
                {billing.enabled && billing.companyName
                  ? `${guest.guest_name}, ${billing.companyName}`
                  : guest.guest_name}
              </p>

              <div className="border-t border-slate-100" />

              {/* Line items */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-slate-700">
                  <span>
                    {guest.room_type_label || "Hotel Room"} ({nights}{" "}
                    {nights === 1 ? "Night" : "Nights"})
                  </span>
                  <span className="font-mono text-xs">{fmtEur(baseRate)}</span>
                </div>
                {addOns.parking && (
                  <div className="flex justify-between text-slate-500">
                    <span>Car Parking Add-on</span>
                    <span className="font-mono text-xs">{fmtEur(parkingTotal)}</span>
                  </div>
                )}
                {addOns.breakfast && (
                  <div className="flex justify-between text-slate-500">
                    <span>Breakfast Add-on</span>
                    <span className="font-mono text-xs">{fmtEur(breakfastTotal)}</span>
                  </div>
                )}
                {addOns.pets && (
                  <div className="flex justify-between text-slate-500">
                    <span>Pet Fee</span>
                    <span className="font-mono text-xs">{fmtEur(petsTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500">
                  <span>City Tax (Fixed)</span>
                  <span className="font-mono text-xs">{fmtEur(CITY_TAX)}</span>
                </div>
              </div>

              {/* Subtotals */}
              <div className="border-t border-slate-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono text-xs">{fmtEur(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax (10%)</span>
                  <span className="font-mono text-xs">{fmtEur(tax)}</span>
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    Total Amount
                  </p>
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                      isSettled
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700",
                    )}
                  >
                    {isSettled ? "Settled" : "Outstanding"}
                  </span>
                </div>
                <p className="text-2xl font-bold text-slate-800">{fmtEur(total)}</p>
                <button
                  type="button"
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 text-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-700 transition-colors"
                >
                  <CreditCard className="h-4 w-4" />
                  Process Payment
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="border-t border-foreground/10 flex items-center justify-between px-6 py-4 flex-shrink-0 bg-foreground/[0.01]">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground/[0.03] transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print Folio
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-semibold text-foreground-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
