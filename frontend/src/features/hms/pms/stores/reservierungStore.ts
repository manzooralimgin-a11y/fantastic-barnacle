/**
 * reservierungStore — single source of truth for the Reservierung modal.
 *
 * ZimmerBlock, GaesteBlock, RateBlock, and ProdukteBlock all read from and
 * write to this store. Any change to check-in/check-out or pax automatically
 * invalidates the cached availability and rate-plan selections so that the
 * downstream blocks re-fetch.
 */
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { create } from "zustand";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GuestRef = {
  /** null until a CRM profile is linked */
  guestProfileId: number | null;
  /** Free-text name displayed in the row while typing */
  displayName: string;
};

export type SelectedExtra = {
  extraId: number;
  name: string;
  unitPrice: number;
  perPerson: boolean;
  daily: boolean;
  quantity: number;
};

export type ReservierungState = {
  // ── modal lifecycle ──────────────────────────────────────────────────────
  isOpen: boolean;

  // ── property ─────────────────────────────────────────────────────────────
  propertyId: number;

  // ── Rechnungsempfänger block ──────────────────────────────────────────────
  billingGuestId: number | null;
  billingGuestName: string;
  bookingSource: string;
  colorTag: string;

  // ── Zimmer block ─────────────────────────────────────────────────────────
  checkIn: string;  // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  paxAdults: number;
  paxChildren: number;
  roomTypeId: number | null;
  roomTypeName: string;
  roomId: number | null;
  roomNumber: string;
  roomFixed: boolean; // Zimmerfixierung checkbox

  // ── Gäste block ──────────────────────────────────────────────────────────
  occupants: GuestRef[];

  // ── Rate block ───────────────────────────────────────────────────────────
  ratePlanId: number | null;
  ratePlanName: string;
  ratePlanTotal: number;

  // ── Produkte block ───────────────────────────────────────────────────────
  extras: SelectedExtra[];

  // ── Invoice-level fields ──────────────────────────────────────────────────
  anrede: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests: string;
  zahlungsMethode: string;
  zahlungsStatus: string;

  // ── Computed (read-only helpers) ──────────────────────────────────────────
  nights: () => number;
  totalPax: () => number;
  extrasTotal: () => number;
  gesamtpreis: () => number;

  // ── Actions ───────────────────────────────────────────────────────────────
  open: (seed?: Partial<ReservierungSeed>) => void;
  close: () => void;

  setBillingGuest: (id: number | null, name: string) => void;
  setBookingSource: (source: string) => void;
  setColorTag: (hex: string) => void;

  setCheckIn: (date: string) => void;
  setCheckOut: (date: string) => void;
  setPaxAdults: (n: number) => void;
  setPaxChildren: (n: number) => void;
  setRoomType: (id: number | null, name: string) => void;
  setRoom: (id: number | null, number: string) => void;
  setRoomFixed: (fixed: boolean) => void;

  setOccupant: (index: number, ref: GuestRef) => void;

  setRatePlan: (id: number | null, name: string, total: number) => void;

  toggleExtra: (extra: Omit<SelectedExtra, "quantity">) => void;
  setExtraQuantity: (extraId: number, quantity: number) => void;

  setField: <K extends keyof ReservierungState>(key: K, value: ReservierungState[K]) => void;
  reset: () => void;
};

export type ReservierungSeed = {
  propertyId?: number;
  checkIn?: string;
  checkOut?: string;
  roomId?: number | null;
  roomNumber?: string;
  roomTypeId?: number | null;
  roomTypeName?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const today = () => format(new Date(), "yyyy-MM-dd");
const tomorrow = () => format(addDays(new Date(), 1), "yyyy-MM-dd");

function makeOccupants(adults: number, children: number): GuestRef[] {
  const total = adults + children;
  return Array.from({ length: total }, () => ({ guestProfileId: null, displayName: "" }));
}

// ── Initial state factory ─────────────────────────────────────────────────────

function initialState(): Omit<
  ReservierungState,
  "nights" | "totalPax" | "extrasTotal" | "gesamtpreis" |
  "open" | "close" | "setBillingGuest" | "setBookingSource" | "setColorTag" |
  "setCheckIn" | "setCheckOut" | "setPaxAdults" | "setPaxChildren" |
  "setRoomType" | "setRoom" | "setRoomFixed" | "setOccupant" |
  "setRatePlan" | "toggleExtra" | "setExtraQuantity" | "setField" | "reset"
> {
  return {
    isOpen: false,
    propertyId: defaultHotelPropertyId,
    billingGuestId: null,
    billingGuestName: "",
    bookingSource: "",
    colorTag: "",
    checkIn: today(),
    checkOut: tomorrow(),
    paxAdults: 2,
    paxChildren: 0,
    roomTypeId: null,
    roomTypeName: "",
    roomId: null,
    roomNumber: "",
    roomFixed: false,
    occupants: makeOccupants(2, 0),
    ratePlanId: null,
    ratePlanName: "",
    ratePlanTotal: 0,
    extras: [],
    anrede: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    specialRequests: "",
    zahlungsMethode: "",
    zahlungsStatus: "offen",
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useReservierungStore = create<ReservierungState>((set, get) => ({
  ...initialState(),

  // ── Computed ───────────────────────────────────────────────────────────────
  nights: () => {
    const s = get();
    if (!s.checkIn || !s.checkOut) return 0;
    return Math.max(differenceInCalendarDays(new Date(s.checkOut), new Date(s.checkIn)), 0);
  },
  totalPax: () => {
    const s = get();
    return s.paxAdults + s.paxChildren;
  },
  extrasTotal: () => {
    const s = get();
    const nights = s.nights();
    const pax = s.totalPax();
    return s.extras.reduce((sum, e) => {
      let amt = e.unitPrice * e.quantity;
      if (e.perPerson) amt *= pax;
      if (e.daily) amt *= nights;
      return sum + amt;
    }, 0);
  },
  gesamtpreis: () => {
    const s = get();
    return s.ratePlanTotal + s.extrasTotal();
  },

  // ── Modal lifecycle ────────────────────────────────────────────────────────
  open: (seed) => {
    const base = initialState();
    const checkIn = seed?.checkIn || today();
    const checkOut = seed?.checkOut || format(addDays(new Date(checkIn), 1), "yyyy-MM-dd");
    set({
      ...base,
      isOpen: true,
      propertyId: seed?.propertyId ?? defaultHotelPropertyId,
      checkIn,
      checkOut,
      roomId: seed?.roomId ?? null,
      roomNumber: seed?.roomNumber ?? "",
      roomTypeId: seed?.roomTypeId ?? null,
      roomTypeName: seed?.roomTypeName ?? "",
      occupants: makeOccupants(base.paxAdults, base.paxChildren),
    });
  },
  close: () => set({ isOpen: false }),

  // ── Rechnungsempfänger ─────────────────────────────────────────────────────
  setBillingGuest: (id, name) => set({ billingGuestId: id, billingGuestName: name }),
  setBookingSource: (source) => set({ bookingSource: source }),
  setColorTag: (hex) => set({ colorTag: hex }),

  // ── Zimmer ─────────────────────────────────────────────────────────────────
  setCheckIn: (date) =>
    set((s) => {
      // push check-out forward if it would undercut check-in
      const currentOut = new Date(s.checkOut);
      const newIn = new Date(date);
      const newOut = currentOut <= newIn ? format(addDays(newIn, 1), "yyyy-MM-dd") : s.checkOut;
      // if room not fixed, clear room + rate since availability changed
      return {
        checkIn: date,
        checkOut: newOut,
        ...(!s.roomFixed && { roomId: null, roomNumber: "" }),
        ratePlanId: null,
        ratePlanName: "",
        ratePlanTotal: 0,
      };
    }),
  setCheckOut: (date) =>
    set((s) => ({
      checkOut: date,
      ...(!s.roomFixed && { roomId: null, roomNumber: "" }),
      ratePlanId: null,
      ratePlanName: "",
      ratePlanTotal: 0,
    })),
  setPaxAdults: (n) =>
    set((s) => {
      const adults = Math.max(1, n);
      return {
        paxAdults: adults,
        occupants: makeOccupants(adults, s.paxChildren),
        ...(!s.roomFixed && { roomId: null, roomNumber: "" }),
      };
    }),
  setPaxChildren: (n) =>
    set((s) => {
      const children = Math.max(0, n);
      return {
        paxChildren: children,
        occupants: makeOccupants(s.paxAdults, children),
      };
    }),
  setRoomType: (id, name) =>
    set({
      roomTypeId: id,
      roomTypeName: name,
      roomId: null,
      roomNumber: "",
      ratePlanId: null,
      ratePlanName: "",
      ratePlanTotal: 0,
    }),
  setRoom: (id, number) => set({ roomId: id, roomNumber: number }),
  setRoomFixed: (fixed) => set({ roomFixed: fixed }),

  // ── Gäste ──────────────────────────────────────────────────────────────────
  setOccupant: (index, ref) =>
    set((s) => {
      const next = [...s.occupants];
      next[index] = ref;
      return { occupants: next };
    }),

  // ── Rate ───────────────────────────────────────────────────────────────────
  setRatePlan: (id, name, total) => set({ ratePlanId: id, ratePlanName: name, ratePlanTotal: total }),

  // ── Produkte ───────────────────────────────────────────────────────────────
  toggleExtra: (extra) =>
    set((s) => {
      const exists = s.extras.find((e) => e.extraId === extra.extraId);
      if (exists) {
        return { extras: s.extras.filter((e) => e.extraId !== extra.extraId) };
      }
      return { extras: [...s.extras, { ...extra, quantity: 1 }] };
    }),
  setExtraQuantity: (extraId, quantity) =>
    set((s) => ({
      extras: s.extras.map((e) => (e.extraId === extraId ? { ...e, quantity } : e)),
    })),

  // ── Generic setter + reset ─────────────────────────────────────────────────
  setField: (key, value) => set({ [key]: value } as Partial<ReservierungState>),
  reset: () => set(initialState()),
}));
