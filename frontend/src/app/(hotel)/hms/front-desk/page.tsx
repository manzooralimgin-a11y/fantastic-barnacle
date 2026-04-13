"use client";

/**
 * Front Desk Dashboard
 *
 * Layout:
 *   • Two-column: In House (left) | Arrivals (right)
 *   • Clicking any guest card pins a Guest Folio panel as a 3rd column
 *   • "Edit Folio" opens the full GuestAddOnsModal (live bill + add-ons)
 *   • "Manage Guest" opens the GuestQuickActionsDrawer (quick services + billing)
 *   • "Check In" calls the real API and refreshes the board
 */

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Loader2, Search, UserPlus, BedDouble } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FrontDeskGuestCard } from "@/features/hms/pms/components/front-desk/FrontDeskGuestCard";
import { GuestFolioPanel } from "@/features/hms/pms/components/front-desk/GuestFolioPanel";
import { GuestQuickActionsDrawer } from "@/features/hms/pms/components/front-desk/GuestQuickActionsDrawer";
import { GuestAddOnsModal } from "@/features/hms/pms/components/front-desk/GuestAddOnsModal";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import {
  PMS_RESERVATIONS_REFRESH_EVENT,
  checkInHotelReservation,
  fetchPmsCockpit,
} from "@/features/hms/pms/api/reservations";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { usePmsSelectionStore } from "@/features/hms/pms/stores/pmsSelectionStore";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function matchesSearch(item: PmsCockpitItem, query: string) {
  if (!query) return true;
  const value = query.toLowerCase().trim();
  return (
    item.guest_name.toLowerCase().includes(value) ||
    (item.room || "").toLowerCase().includes(value) ||
    (item.booking_id || "").toLowerCase().includes(value)
  );
}

function sortGuests(items: PmsCockpitItem[]) {
  return [...items].sort((a, b) => {
    const byDate = a.check_in.localeCompare(b.check_in);
    if (byDate !== 0) return byDate;
    return a.guest_name.localeCompare(b.guest_name);
  });
}

function SectionEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-foreground/15 bg-foreground/[0.02] px-6 py-10 text-center">
      <h3 className="text-base font-editorial text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-foreground-muted">{description}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FrontDeskPage() {
  const [focusDate, setFocusDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const { openPanel } = useRightPanel();
  const setSelectedReservationId = usePmsSelectionStore(
    (state) => state.setSelectedReservationId,
  );
  const openReservierung = useReservierungStore((s) => s.open);

  // ── Panel / modal state ─────────────────────────────────────────────────
  const [folioGuest, setFolioGuest] = useState<PmsCockpitItem | null>(null);
  const [drawerGuest, setDrawerGuest] = useState<PmsCockpitItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOnsGuest, setAddOnsGuest] = useState<PmsCockpitItem | null>(null);
  const [addOnsOpen, setAddOnsOpen] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────
  const cockpitQuery = useQuery({
    queryKey: ["pms", "front-desk-cockpit", focusDate],
    queryFn: () => fetchPmsCockpit(defaultHotelPropertyId, focusDate),
  });

  useEffect(() => {
    const handler = () => { void cockpitQuery.refetch(); };
    window.addEventListener(PMS_RESERVATIONS_REFRESH_EVENT, handler);
    return () => window.removeEventListener(PMS_RESERVATIONS_REFRESH_EVENT, handler);
  }, [cockpitQuery]);

  // ── Check-in mutation ──────────────────────────────────────────────────
  const checkInMutation = useMutation({
    mutationFn: (reservationId: number) => checkInHotelReservation(reservationId),
    onSuccess: async (summary) => {
      setSelectedReservationId(String(summary.reservation_id));
      await cockpitQuery.refetch();
      toast.success(
        `${summary.guest_name} checked in${summary.room ? ` to room ${summary.room}` : ""}.`,
      );
    },
    onError: () => {
      toast.error("Failed to complete check-in. Please try again.");
    },
  });

  // ── Filtered + sorted lists ─────────────────────────────────────────────
  const arrivals = useMemo(
    () =>
      sortGuests(
        (cockpitQuery.data?.arrivals ?? []).filter((item) =>
          matchesSearch(item, deferredSearch),
        ),
      ),
    [cockpitQuery.data?.arrivals, deferredSearch],
  );
  const inHouse = useMemo(
    () =>
      sortGuests(
        (cockpitQuery.data?.in_house ?? []).filter((item) =>
          matchesSearch(item, deferredSearch),
        ),
      ),
    [cockpitQuery.data?.in_house, deferredSearch],
  );

  // ── Actions ─────────────────────────────────────────────────────────────
  function openFolio(guest: PmsCockpitItem) {
    setFolioGuest((prev) =>
      prev?.reservation_id === guest.reservation_id ? null : guest,
    );
  }

  function openDrawer(guest: PmsCockpitItem) {
    setDrawerGuest(guest);
    setDrawerOpen(true);
  }

  function openAddOns(guest: PmsCockpitItem) {
    setAddOnsGuest(guest);
    setAddOnsOpen(true);
  }

  function openPayments(reservationId: number) {
    setSelectedReservationId(String(reservationId));
    openPanel({
      type: "payments",
      data: { reservationId: String(reservationId) },
      title: "Payments",
    });
  }

  async function handleBulkCheckIn() {
    for (const arrival of arrivals) {
      await checkInMutation.mutateAsync(arrival.reservation_id);
    }
    toast.success("All visible arrivals have been checked in.");
  }

  const hasFolio = Boolean(folioGuest);

  return (
    <div className="space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-foreground-muted">
            Hotel · Front Desk
          </p>
          <h1 className="mt-2 text-4xl font-editorial font-bold tracking-tight text-foreground">
            Front Desk
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Manage arrivals, in-house guests, check-ins, and folios in one view.
          </p>
        </div>

        {/* KPI chips */}
        <div className="flex gap-3 flex-wrap">
          <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/70 px-4 py-3 min-w-[96px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
              In House
            </p>
            <p className="mt-1 text-2xl font-editorial font-bold text-emerald-700">
              {inHouse.length}
            </p>
          </div>
          <div className="rounded-2xl border border-cyan-200/60 bg-cyan-50/70 px-4 py-3 min-w-[96px]">
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-600">
              Arrivals
            </p>
            <p className="mt-1 text-2xl font-editorial font-bold text-cyan-700">
              {arrivals.length}
            </p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by guest, room, or booking…"
            className="min-h-11 w-full rounded-2xl border border-foreground/10 bg-white dark:bg-zinc-900 pl-11 pr-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <input
          type="date"
          value={focusDate}
          onChange={(e) => setFocusDate(e.target.value)}
          className="min-h-11 rounded-2xl border border-foreground/10 bg-white dark:bg-zinc-900 px-4 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => openReservierung({ propertyId: defaultHotelPropertyId })}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          New Reservation
        </button>
        <button
          type="button"
          onClick={() =>
            openPanel({
              type: "reservation.create",
              data: { propertyId: String(defaultHotelPropertyId), date: focusDate },
              title: "Walk-In Check-In",
            })
          }
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <CalendarPlus className="h-4 w-4" />
          Walk-In
        </button>
        <button
          type="button"
          onClick={() => void handleBulkCheckIn()}
          disabled={!arrivals.length || checkInMutation.isPending}
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03] disabled:opacity-60"
        >
          <BedDouble className="h-4 w-4" />
          Check In All
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {cockpitQuery.error && (
        <ApiError
          message="Failed to load the live front desk queues."
          onRetry={() => void cockpitQuery.refetch()}
          dismissible={false}
        />
      )}

      {/* ── Main grid: 2 cols normally, 3 cols when folio is pinned ─────── */}
      {cockpitQuery.isLoading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-foreground/10 bg-white dark:bg-zinc-900 px-6 py-8 text-sm text-foreground-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading front desk guests…
        </div>
      ) : (
        <div
          className={cn(
            "grid gap-5 items-start transition-all duration-300",
            hasFolio
              ? "xl:grid-cols-[1fr_1fr_360px]"
              : "xl:grid-cols-2",
          )}
        >

          {/* ── In House column ──────────────────────────────────────── */}
          <Card className="border-none bg-white dark:bg-zinc-900 shadow-[var(--shadow-soft)]">
            <CardHeader className="border-b border-foreground/10 bg-emerald-500/[0.06] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg font-editorial text-foreground">
                  🛏 In House
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-emerald-300/70 bg-white/80 text-emerald-800 font-semibold"
                >
                  {inHouse.length} Guests
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {inHouse.length ? (
                inHouse.map((guest) => (
                  <FrontDeskGuestCard
                    key={`in-house-${guest.reservation_id}`}
                    item={guest}
                    variant="inHouse"
                    onOpen={() => openFolio(guest)}
                    onOpenPayments={() => openPayments(guest.reservation_id)}
                    onPrimaryAction={() => openDrawer(guest)}
                  />
                ))
              ) : (
                <SectionEmptyState
                  title="No guests in house"
                  description="Checked-in guests appear here once processed."
                />
              )}
            </CardContent>
          </Card>

          {/* ── Arrivals column ──────────────────────────────────────── */}
          <Card className="border-none bg-white dark:bg-zinc-900 shadow-[var(--shadow-soft)]">
            <CardHeader className="border-b border-foreground/10 bg-cyan-500/[0.06] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg font-editorial text-foreground">
                  ✈ Arrivals
                </CardTitle>
                <Badge
                  variant="outline"
                  className="border-cyan-300/70 bg-white/80 text-cyan-800 font-semibold"
                >
                  {arrivals.length} Expected
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {arrivals.length ? (
                arrivals.map((guest) => (
                  <FrontDeskGuestCard
                    key={`arrival-${guest.reservation_id}`}
                    item={guest}
                    variant="arrival"
                    onOpen={() => openFolio(guest)}
                    onOpenPayments={() => openPayments(guest.reservation_id)}
                    onPrimaryAction={() => checkInMutation.mutate(guest.reservation_id)}
                    onManage={() => openDrawer(guest)}
                    actionPending={
                      checkInMutation.isPending &&
                      checkInMutation.variables === guest.reservation_id
                    }
                  />
                ))
              ) : (
                <SectionEmptyState
                  title="No arrivals for this date"
                  description="Try another date or clear the search filter."
                />
              )}
            </CardContent>
          </Card>

          {/* ── Guest Folio (3rd col, slides in when guest selected) ─── */}
          {folioGuest && (
            <div className="xl:sticky xl:top-6">
              <GuestFolioPanel
                guest={folioGuest}
                onClose={() => setFolioGuest(null)}
                onEditFolio={() => openAddOns(folioGuest)}
                onCheckout={() => {
                  toast.info(`Checkout initiated for ${folioGuest.guest_name}.`);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Drawers / Modals ─────────────────────────────────────────────── */}
      <GuestQuickActionsDrawer
        guest={drawerGuest}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenPayment={() => {
          if (drawerGuest) openPayments(drawerGuest.reservation_id);
        }}
      />
      <GuestAddOnsModal
        guest={addOnsGuest}
        open={addOnsOpen}
        onClose={() => setAddOnsOpen(false)}
      />
    </div>
  );
}
