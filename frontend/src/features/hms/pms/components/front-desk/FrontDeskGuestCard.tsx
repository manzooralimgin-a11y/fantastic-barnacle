"use client";

/**
 * FrontDeskGuestCard — Screenshot 1 card design
 *
 * In-House card:
 *   Avatar · Name · Room · Dates · CHECKED-IN badge
 *   Payment status (Fully Paid / Outstanding / Partial)
 *   "Manage Guest →" link
 *
 * Arrival card:
 *   Avatar · Name · Room · Dates · ARRIVING badge · OTA source
 *   Payment status chip
 *   "Check In" dark button
 */

import { differenceInCalendarDays } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plane,
  Circle,
} from "lucide-react";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Props = {
  item: PmsCockpitItem;
  variant: "arrival" | "inHouse";
  /** Open the Guest Folio panel */
  onOpen: () => void;
  /** Open the payment panel */
  onOpenPayments: () => void;
  /** Check In (arrivals) or Manage Guest (in-house) */
  onPrimaryAction?: () => void;
  actionPending?: boolean;
  /** Open the Quick Actions Drawer (shown on both variants) */
  onManage?: () => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtMonthDay(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
}

function avatarInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// ── Payment indicator ──────────────────────────────────────────────────────────

function PaymentBadge({
  status,
  variant,
}: {
  status: string | null;
  variant: "arrival" | "inHouse";
}) {
  const normalized = (status || "").toLowerCase();
  const isPaid =
    normalized.includes("paid") ||
    normalized.includes("bezahlt") ||
    normalized.includes("komplett");
  const isPartial =
    normalized.includes("partial") || normalized.includes("teil") || normalized.includes("deposit");

  if (variant === "arrival") {
    // Chip style for arrivals
    if (isPaid) {
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 bg-emerald-50 border border-emerald-200/70 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="h-3 w-3" />
          Paid in Full
        </span>
      );
    }
    if (isPartial) {
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200/70 px-2.5 py-1 rounded-full">
          <Circle className="h-3 w-3 fill-amber-400" />
          Deposit Paid
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 border border-rose-200/70 px-2.5 py-1 rounded-full">
        <AlertCircle className="h-3 w-3" />
        Collect
      </span>
    );
  }

  // In-house: inline text style
  if (isPaid) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Fully Paid
      </span>
    );
  }
  if (isPartial) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
        <Circle className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        Partial Payment
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-rose-600">
      <AlertCircle className="h-3.5 w-3.5" />
      Outstanding
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FrontDeskGuestCard({
  item,
  variant,
  onOpen,
  onOpenPayments,
  onPrimaryAction,
  actionPending = false,
  onManage,
}: Props) {
  const isArrival = variant === "arrival";
  const nights = differenceInCalendarDays(
    new Date(item.check_out + "T00:00:00"),
    new Date(item.check_in + "T00:00:00"),
  );

  return (
    <article className="rounded-2xl border border-foreground/[0.08] bg-white dark:bg-zinc-800 px-5 py-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">

      {/* ── Top row: avatar + name/room + dates ────────────────────────── */}
      <div className="flex items-start gap-3">

        {/* Avatar circle */}
        <button
          type="button"
          onClick={onOpen}
          className="flex-shrink-0 h-10 w-10 rounded-xl bg-foreground/[0.07] flex items-center justify-center text-sm font-bold text-foreground hover:bg-foreground/10 transition-colors select-none"
          aria-label={`Open folio for ${item.guest_name}`}
        >
          {avatarInitials(item.guest_name)}
        </button>

        {/* Name + room */}
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left group"
        >
          <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate leading-snug">
            {item.guest_name}
          </p>
          <p className="text-xs text-foreground-muted mt-0.5 truncate">
            {item.room ? `Room ${item.room}` : "Room TBD"}
            {item.room_type_label ? ` · ${item.room_type_label}` : ""}
          </p>
        </button>

        {/* Dates */}
        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-semibold text-foreground whitespace-nowrap">
            {fmtMonthDay(item.check_in)} – {fmtMonthDay(item.check_out)}
          </p>
          <p className="text-[10px] text-foreground-muted mt-0.5">
            {nights} {nights === 1 ? "Night" : "Nights"}
          </p>
        </div>
      </div>

      {/* ── Status chip ────────────────────────────────────────────────── */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {isArrival ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-cyan-600/[0.09] text-cyan-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-cyan-200/60">
            <Plane className="h-2.5 w-2.5" /> Arriving
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600/[0.09] text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-emerald-200/60">
            <CheckCircle2 className="h-2.5 w-2.5" /> Checked-In
          </span>
        )}
      </div>

      {/* ── Payment + primary action ────────────────────────────────────── */}
      <div className="mt-3.5 flex items-center justify-between gap-3">

        {/* Payment status — clickable */}
        <button
          type="button"
          onClick={onOpenPayments}
          className="hover:opacity-75 transition-opacity min-w-0"
        >
          <PaymentBadge status={item.payment_status} variant={variant} />
        </button>

        {/* Primary action button(s) */}
        {isArrival ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {onManage && (
              <button
                type="button"
                onClick={onManage}
                className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors"
              >
                Manage Guest
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={actionPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground text-background text-xs font-semibold px-3.5 py-2 hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {actionPending ? (
                <Clock className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {actionPending ? "Working…" : "Check In"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPrimaryAction ?? onManage}
            className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-muted hover:text-foreground transition-colors flex-shrink-0"
          >
            Manage Guest
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </article>
  );
}
