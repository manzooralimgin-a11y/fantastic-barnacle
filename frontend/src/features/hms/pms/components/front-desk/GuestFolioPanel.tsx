"use client";

/**
 * GuestFolioPanel — Screenshot 1 (right panel)
 *
 * Slides in as a 3rd column on the front-desk dashboard when a guest is selected.
 * Shows: guest avatar + name + VIP badge, Room/Folio stats, Recent Charges,
 * Guest Preferences, and Edit Folio / Checkout Guest actions.
 */

import { useQuery } from "@tanstack/react-query";
import {
  X,
  Star,
  Bookmark,
  Plus,
  LogOut,
  FileEdit,
  UtensilsCrossed,
  Wine,
} from "lucide-react";
import { fetchPmsReservationSummary } from "@/features/hms/pms/api/reservations";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import { cn } from "@/lib/utils";

// ── Mock charges ───────────────────────────────────────────────────────────────
// Shown as placeholder until a dedicated charges endpoint is wired in.
const MOCK_CHARGES = [
  { Icon: UtensilsCrossed, name: "L'Atelier Room Service", time: "21:10", amount: 42.0 },
  { Icon: Wine, name: "Mini Bar Refill", time: "10:30", amount: 18.0 },
];

// ── Props ──────────────────────────────────────────────────────────────────────

export type GuestFolioPanelProps = {
  guest: PmsCockpitItem;
  onClose: () => void;
  onEditFolio: () => void;
  onCheckout: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtEur(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function GuestFolioPanel({
  guest,
  onClose,
  onEditFolio,
  onCheckout,
}: GuestFolioPanelProps) {
  const { data: summary } = useQuery({
    queryKey: ["pms", "reservation-summary", guest.reservation_id],
    queryFn: () => fetchPmsReservationSummary(guest.reservation_id, defaultHotelPropertyId),
    enabled: Boolean(guest.reservation_id),
    staleTime: 30_000,
  });

  const folioBalance = summary?.folio_balance_due ?? 0;
  const isSettled = folioBalance === 0;

  const todayShort = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex h-full flex-col rounded-2xl border border-foreground/10 bg-white dark:bg-zinc-900 shadow-[var(--shadow-soft)] overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/10 flex-shrink-0">
        <h2 className="font-semibold text-foreground">Guest Folio</h2>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-foreground-muted hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
          aria-label="Close folio panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Guest identity */}
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-foreground/[0.07] flex items-center justify-center text-lg font-bold text-foreground flex-shrink-0 select-none">
            {initials(guest.guest_name)}
          </div>
          <div>
            <p className="font-bold text-foreground text-lg leading-snug">{guest.guest_name}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-xs text-foreground-muted">VIP Platinum Member</span>
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-800/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
              Room Assigned
            </p>
            <p className="mt-1.5 text-2xl font-editorial font-bold text-foreground">
              {guest.room ?? "—"}
            </p>
            <p className="text-xs text-foreground-muted mt-0.5 truncate">
              {guest.room_type_label ?? "Hotel Room"}
            </p>
          </div>
          <div
            className={cn(
              "rounded-xl border p-3",
              isSettled
                ? "border-emerald-200/50 bg-emerald-50/60"
                : "border-amber-200/50 bg-amber-50/60",
            )}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
              Folio Balance
            </p>
            <p
              className={cn(
                "mt-1.5 text-2xl font-editorial font-bold",
                isSettled ? "text-emerald-700" : "text-amber-700",
              )}
            >
              {fmtEur(folioBalance)}
            </p>
            <p
              className={cn(
                "text-xs mt-0.5",
                isSettled ? "text-emerald-600" : "text-amber-600",
              )}
            >
              {isSettled ? "Fully Settled" : "Outstanding"}
            </p>
          </div>
        </div>

        {/* Recent Charges */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
              Recent Charges
            </p>
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary hover:opacity-80 transition-opacity"
            >
              <Plus className="h-3 w-3" />
              Add Charge
            </button>
          </div>
          <div className="space-y-2">
            {MOCK_CHARGES.map((charge, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-foreground/[0.07] bg-zinc-50/60 dark:bg-zinc-800/20 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-foreground/[0.05] flex items-center justify-center flex-shrink-0">
                    <charge.Icon className="h-4 w-4 text-foreground-muted" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{charge.name}</p>
                    <p className="text-[10px] text-foreground-muted">
                      {todayShort} · {charge.time}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-foreground">{fmtEur(charge.amount)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Guest Preferences */}
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bookmark className="h-3.5 w-3.5 text-amber-700 flex-shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">
              Guest Preferences
            </p>
          </div>
          <p className="text-sm text-amber-900 leading-relaxed">
            {summary?.special_requests ||
              "Guest allergic to down feathers. Ensure synthetic pillows are in room. Prefers sparkling water in mini-bar."}
          </p>
        </div>
      </div>

      {/* ── Footer actions ──────────────────────────────────────────────── */}
      <div className="border-t border-foreground/10 grid grid-cols-2 gap-3 p-4 flex-shrink-0">
        <button
          type="button"
          onClick={onEditFolio}
          className="flex items-center justify-center gap-2 rounded-xl border border-foreground/10 bg-zinc-50 dark:bg-zinc-800/40 py-2.5 text-sm font-semibold text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
        >
          <FileEdit className="h-4 w-4" />
          Edit Folio
        </button>
        <button
          type="button"
          onClick={onCheckout}
          className="flex items-center justify-center gap-2 rounded-xl bg-foreground text-background py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <LogOut className="h-4 w-4" />
          Checkout Guest
        </button>
      </div>
    </div>
  );
}
