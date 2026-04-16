"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Car,
  UtensilsCrossed,
  PawPrint,
  ArrowRight,
  AlertCircle,
  BedDouble,
  Loader2,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createPmsReservationCharge } from "@/features/hms/pms/api/billing";
import {
  fetchPmsReservationSummary,
  patchHotelReservation,
  syncPmsReservationGuest,
} from "@/features/hms/pms/api/reservations";
import { useRightPanel } from "@/features/hms/pms/components/right-panel/useRightPanel";
import type { PmsCockpitItem } from "@/features/hms/pms/schemas/reservation";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import { getJson } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const ADDON_PRICES = {
  parking:   { label: "Car Parking", price: 10,    chargeType: "parking"   },
  breakfast: { label: "Breakfast",   price: 24.90, chargeType: "breakfast" },
  pet:       { label: "Pet Fee",     price: 15,    chargeType: "pet_fee"   },
} as const;

type AddOnKey = keyof typeof ADDON_PRICES;
type AddOns = Record<AddOnKey, boolean>;

// ── Types ──────────────────────────────────────────────────────────────────────

export type GuestQuickActionsDrawerProps = {
  guest: PmsCockpitItem | null;
  open: boolean;
  onClose: () => void;
  onOpenPayment: () => void;
};

type RoomItem = { id: string; number: string; room_type_name: string; status: string };

// ── Sub-components ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
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
  price,
  active,
  pending,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  price: number;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-pressed={active}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 transition-all duration-150",
        active
          ? "border-emerald-400 bg-emerald-500/[0.12] text-emerald-700 dark:text-emerald-400 shadow-sm"
          : "border-foreground/10 bg-foreground/[0.03] text-foreground-muted hover:text-foreground hover:border-foreground/20",
        pending && "opacity-60 cursor-wait",
      )}
    >
      {active && (
        <span className="absolute top-1.5 right-1.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
          <Check className="h-2 w-2 text-white" strokeWidth={3} />
        </span>
      )}
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <Icon className="h-5 w-5" />
      )}
      <span className="text-[10px] font-bold leading-none">{label}</span>
      <span className="text-[9px] font-semibold opacity-70">
        +€{price % 1 === 0 ? price : price.toFixed(2)}
      </span>
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
  const { openPanel } = useRightPanel();
  const queryClient = useQueryClient();

  const [addOns, setAddOns] = useState<AddOns>({ parking: false, breakfast: false, pet: false });
  const [pendingAddon, setPendingAddon] = useState<AddOnKey | null>(null);
  const [billToCompany, setBillToCompany] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [syncingGuest, setSyncingGuest] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [changingRoom, setChangingRoom] = useState(false);

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["pms", "reservation-summary", guest?.reservation_id],
    queryFn: () => fetchPmsReservationSummary(guest!.reservation_id, defaultHotelPropertyId),
    enabled: open && Boolean(guest?.reservation_id),
    staleTime: 30_000,
  });

  const { data: roomsData } = useQuery({
    queryKey: ["hms", "pms", "rooms", defaultHotelPropertyId],
    queryFn: () => getJson<{ items: RoomItem[] }>("/hms/pms/rooms", {
      params: { property_id: defaultHotelPropertyId },
    }),
    enabled: roomPickerOpen,
    staleTime: 60_000,
  });

  if (!guest) return null;

  // Live balance = server balance + cost of any add-ons ticked this session
  const baseBalance = summary?.folio_balance_due ?? guest.total_amount;
  const addOnTotal = (Object.keys(ADDON_PRICES) as AddOnKey[]).reduce(
    (sum, key) => sum + (addOns[key] ? ADDON_PRICES[key].price : 0),
    0,
  );
  const displayBalance = baseBalance + addOnTotal;

  function fmtEur(n: number) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
  }

  async function toggle(key: AddOnKey) {
    if (addOns[key]) return; // already added — don't double-charge
    setPendingAddon(key);
    try {
      await createPmsReservationCharge(guest.reservation_id, {
        description: ADDON_PRICES[key].label,
        quantity: 1,
        unit_price: ADDON_PRICES[key].price,
        charge_type: ADDON_PRICES[key].chargeType,
        service_date: new Date().toISOString().slice(0, 10),
      });
      setAddOns((prev) => ({ ...prev, [key]: true }));
      toast.success(`${ADDON_PRICES[key].label} added to folio.`);
      void refetchSummary();
      void queryClient.invalidateQueries({ queryKey: ["pms", "reservation-workspace"] });
    } catch {
      toast.error(`Could not add ${ADDON_PRICES[key].label}. Try again.`);
    } finally {
      setPendingAddon(null);
    }
  }

  async function handleChangeRoom(roomNumber: string) {
    setChangingRoom(true);
    try {
      await patchHotelReservation(guest.reservation_id, { room: roomNumber });
      toast.success(`Room changed to ${roomNumber}.`);
      setRoomPickerOpen(false);
      void refetchSummary();
      void queryClient.invalidateQueries({ queryKey: ["pms", "front-desk-cockpit"] });
    } catch {
      toast.error("Could not change room. Try again.");
    } finally {
      setChangingRoom(false);
    }
  }

  async function openEditDetails() {
    let contactId = summary?.guest_id;
    if (!contactId) {
      try {
        setSyncingGuest(true);
        const synced = await syncPmsReservationGuest(guest.reservation_id);
        contactId = synced.guest_id;
      } catch {
        toast.error("Could not load guest profile. Try again.");
        return;
      } finally {
        setSyncingGuest(false);
      }
    }
    onClose();
    openPanel({
      type: "guest.details",
      data: { contactId: String(contactId) },
      title: `Edit: ${guest.guest_name}`,
    });
  }

  const currentRoom = summary?.room ?? guest.room;

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
            <div className="grid grid-cols-3 gap-2.5">
              {(Object.keys(ADDON_PRICES) as AddOnKey[]).map((key) => {
                const cfg = ADDON_PRICES[key];
                const Icon = key === "parking" ? Car : key === "breakfast" ? UtensilsCrossed : PawPrint;
                return (
                  <ServiceButton
                    key={key}
                    icon={Icon}
                    label={cfg.label === "Car Parking" ? "Parking" : cfg.label === "Pet Fee" ? "Pet" : cfg.label}
                    price={cfg.price}
                    active={addOns[key]}
                    pending={pendingAddon === key}
                    onClick={() => void toggle(key)}
                  />
                );
              })}
            </div>
            {addOnTotal > 0 && (
              <p className="mt-2 text-xs font-semibold text-emerald-600">
                +{fmtEur(addOnTotal)} added this session
              </p>
            )}
          </section>

          {/* Room Management */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-3">
              Room Management
            </p>
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 flex-shrink-0 rounded-xl bg-foreground text-background flex items-center justify-center font-bold text-lg select-none">
                  {currentRoom ?? <BedDouble className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {guest.room_type_label ?? "Hotel Room"}
                  </p>
                  <p className="text-xs text-foreground-muted mt-0.5">
                    {currentRoom ? `Room ${currentRoom}` : "Room TBD"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRoomPickerOpen((prev) => !prev)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs font-semibold text-foreground border border-foreground/10 rounded-xl px-3 py-1.5 hover:bg-foreground/[0.04] transition-colors"
                >
                  Change Room
                  {roomPickerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {/* Room picker dropdown */}
              {roomPickerOpen && (
                <div className="border-t border-foreground/10 pt-3 space-y-1 max-h-48 overflow-y-auto">
                  {!roomsData ? (
                    <div className="flex items-center gap-2 text-xs text-foreground-muted py-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading rooms…
                    </div>
                  ) : roomsData.items.length === 0 ? (
                    <p className="text-xs text-foreground-muted py-2">No rooms found.</p>
                  ) : (
                    roomsData.items.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        disabled={changingRoom || room.number === currentRoom}
                        onClick={() => void handleChangeRoom(room.number)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors",
                          room.number === currentRoom
                            ? "bg-emerald-500/10 text-emerald-700 font-semibold cursor-default"
                            : "hover:bg-foreground/[0.05] text-foreground",
                          changingRoom && "opacity-50 cursor-wait",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-bold">{room.number}</span>
                          <span className="text-foreground-muted text-xs">{room.room_type_name}</span>
                        </span>
                        {room.number === currentRoom && (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                        {changingRoom && room.number !== currentRoom && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground-muted" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
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
                onClick={() => void openEditDetails()}
                disabled={syncingGuest}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 transition-opacity disabled:opacity-60"
              >
                {syncingGuest && <Loader2 className="h-3 w-3 animate-spin" />}
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
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                  Billing & Company
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground-muted">Bill to Company</span>
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
            <div>
              <p className="text-xs text-foreground-muted font-medium">Total Balance</p>
              {addOnTotal > 0 && (
                <p className="text-[10px] text-emerald-600">incl. {fmtEur(addOnTotal)} new charges</p>
              )}
            </div>
            <p className="text-2xl font-bold text-foreground">{fmtEur(displayBalance)}</p>
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
