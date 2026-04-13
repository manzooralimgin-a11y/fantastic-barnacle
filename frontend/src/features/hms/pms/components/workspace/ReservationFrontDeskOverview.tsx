"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  BedDouble,
  Building2,
  CalendarCheck2,
  CarFront,
  CheckCheck,
  Coffee,
  CreditCard,
  Loader2,
  PawPrint,
  PencilLine,
  Save,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/components/shared/api-error";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  createPmsReservationCharge,
  voidPmsFolioLine,
} from "@/features/hms/pms/api/billing";
import { updatePmsContact } from "@/features/hms/pms/api/contacts";
import {
  fetchAvailability,
  fetchExtras,
  moveHotelStay,
  type AvailableRoom,
  type HotelExtra,
} from "@/features/hms/pms/api/inventory";
import {
  checkInHotelReservation,
  emitPmsReservationsRefresh,
  patchHotelReservation,
} from "@/features/hms/pms/api/reservations";
import type { PmsContact } from "@/features/hms/pms/schemas/contact";
import type { PmsFolio, PmsFolioLine } from "@/features/hms/pms/schemas/payment";
import type { PmsReservationSummary } from "@/features/hms/pms/schemas/reservation";
import type { HotelStay } from "@/lib/hms";
import { defaultHotelPropertyId, fetchHotelRoomTypes } from "@/lib/hotel-room-types";
import { cn, formatCurrency, formatDate, formatRelativeTime } from "@/lib/utils";

type Props = {
  reservation: Partial<PmsReservationSummary>;
  stay: Partial<HotelStay>;
  guest: PmsContact | null;
  folio: Partial<PmsFolio>;
  onRefresh: () => Promise<unknown>;
  onOpenPayments: () => void;
  onOpenGuestPanel: () => void;
};

type QuickEditForm = {
  guest_name: string;
  email: string;
  phone: string;
  special_requests: string;
};

type CompanyBillingForm = {
  enabled: boolean;
  company_name: string;
  company_address: string;
  tax_id: string;
  bill_name_mode: "guest_only" | "guest_and_company";
};

type PetForm = {
  petType: string;
  petName: string;
};

type QuickServicePreset = {
  key: "parking" | "breakfast" | "pet_fee";
  label: string;
  icon: typeof CarFront;
  keywords: string[];
  fallbackPrice: number;
  daily: boolean;
  perPerson: boolean;
};

const QUICK_SERVICE_PRESETS: QuickServicePreset[] = [
  {
    key: "parking",
    label: "Car Parking",
    icon: CarFront,
    keywords: ["parking", "park"],
    fallbackPrice: 15,
    daily: true,
    perPerson: false,
  },
  {
    key: "breakfast",
    label: "Breakfast",
    icon: Coffee,
    keywords: ["breakfast", "frühstück"],
    fallbackPrice: 18,
    daily: true,
    perPerson: true,
  },
  {
    key: "pet_fee",
    label: "Pets",
    icon: PawPrint,
    keywords: ["pet", "haustier"],
    fallbackPrice: 25,
    daily: false,
    perPerson: false,
  },
];

function nightsBetween(checkIn: string | null | undefined, checkOut: string | null | undefined) {
  if (!checkIn || !checkOut) return 1;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(diff / 86400000));
}

function normalized(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractCompanyBilling(guest: PmsContact | null): CompanyBillingForm {
  const company = asRecord(asRecord(guest?.custom_fields_json).company_billing);
  const billNameMode = company.bill_name_mode === "guest_and_company" ? "guest_and_company" : "guest_only";
  return {
    enabled: Boolean(company.enabled),
    company_name: typeof company.company_name === "string" ? company.company_name : "",
    company_address: typeof company.company_address === "string" ? company.company_address : "",
    tax_id: typeof company.tax_id === "string" ? company.tax_id : "",
    bill_name_mode: billNameMode,
  };
}

function findServiceExtra(preset: QuickServicePreset, extras: HotelExtra[]) {
  return extras.find((extra) =>
    preset.keywords.some((keyword) => normalized(extra.name).includes(keyword)),
  );
}

function findServiceLine(preset: QuickServicePreset, lines: PmsFolioLine[]) {
  return lines.find((line) => {
    if (line.status === "void") return false;
    const metadata = asRecord(line.metadata_json);
    if (metadata.service_key === preset.key) return true;
    return preset.keywords.some((keyword) => normalized(line.description).includes(keyword));
  });
}

function buildCompanyPreview(form: CompanyBillingForm, guestName: string) {
  const primaryName =
    form.enabled && form.company_name && form.bill_name_mode === "guest_and_company"
      ? `${guestName}, ${form.company_name}`
      : guestName;

  return [primaryName, form.company_address, form.tax_id ? `Tax ID ${form.tax_id}` : ""]
    .filter(Boolean)
    .join(" · ");
}

export function ReservationFrontDeskOverview({
  reservation,
  stay,
  guest,
  folio,
  onRefresh,
  onOpenPayments,
  onOpenGuestPanel,
}: Props) {
  const [quickEditForm, setQuickEditForm] = useState<QuickEditForm>({
    guest_name: reservation.guest_name || "",
    email: reservation.guest_email || guest?.email || "",
    phone: reservation.guest_phone || guest?.phone || "",
    special_requests: reservation.special_requests || "",
  });
  const [companyForm, setCompanyForm] = useState<CompanyBillingForm>(() => extractCompanyBilling(guest));
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [petDialogOpen, setPetDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [petForm, setPetForm] = useState<PetForm>({ petType: "", petName: "" });
  const [quickEditSavedAt, setQuickEditSavedAt] = useState<string | null>(null);
  const [billingSavedAt, setBillingSavedAt] = useState<string | null>(null);
  const [quickEditError, setQuickEditError] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const extrasQuery = useQuery({
    queryKey: ["pms", "extras", defaultHotelPropertyId],
    queryFn: () => fetchExtras(defaultHotelPropertyId),
  });
  const roomTypesQuery = useQuery({
    queryKey: ["hotel-room-types", defaultHotelPropertyId],
    queryFn: () => fetchHotelRoomTypes(defaultHotelPropertyId),
  });
  const availabilityQuery = useQuery({
    queryKey: [
      "pms",
      "availability",
      reservation.check_in,
      reservation.check_out,
      reservation.adults,
      reservation.children,
    ],
    queryFn: () =>
      fetchAvailability(
        reservation.check_in || "",
        reservation.check_out || "",
        Math.max(1, Number(reservation.adults || 0) + Number(reservation.children || 0)),
      ),
    enabled: roomDialogOpen && Boolean(reservation.check_in && reservation.check_out),
  });

  useEffect(() => {
    setQuickEditForm({
      guest_name: reservation.guest_name || "",
      email: reservation.guest_email || guest?.email || "",
      phone: reservation.guest_phone || guest?.phone || "",
      special_requests: reservation.special_requests || "",
    });
  }, [guest?.email, guest?.phone, reservation.guest_email, reservation.guest_name, reservation.guest_phone, reservation.special_requests]);

  useEffect(() => {
    setCompanyForm(extractCompanyBilling(guest));
  }, [guest]);

  const nights = nightsBetween(reservation.check_in, reservation.check_out);
  const totalGuests = Math.max(1, Number(reservation.adults || 0) + Number(reservation.children || 0));
  const activeLines = useMemo(
    () => ((folio.lines as PmsFolioLine[] | undefined) || []).filter((line) => line.status !== "void"),
    [folio.lines],
  );
  const outstanding = Number(folio.balance_due ?? reservation.folio_balance_due ?? reservation.total_amount ?? 0);
  const roomTypesByName = useMemo(
    () => new Map((roomTypesQuery.data || []).map((roomType) => [roomType.name, roomType])),
    [roomTypesQuery.data],
  );

  const serviceCards = useMemo(() => {
    const extras = extrasQuery.data || [];
    return QUICK_SERVICE_PRESETS.map((preset) => {
      const extra = findServiceExtra(preset, extras);
      const line = findServiceLine(preset, activeLines);
      const unitPrice = extra?.unit_price ?? preset.fallbackPrice;
      let quantity = 1;
      if (extra?.daily ?? preset.daily) quantity *= nights;
      if (extra?.per_person ?? preset.perPerson) quantity *= totalGuests;
      const estimatedTotal = Number((unitPrice * quantity).toFixed(2));
      return {
        ...preset,
        line,
        extra,
        estimatedTotal,
      };
    });
  }, [activeLines, extrasQuery.data, nights, totalGuests]);

  const roomOptions = useMemo(() => {
    const currentRoomType = reservation.room_type_label ? roomTypesByName.get(reservation.room_type_label) : null;
    return ((availabilityQuery.data?.rooms as AvailableRoom[] | undefined) || [])
      .filter((room) => room.room_number !== reservation.room)
      .map((room) => {
        const targetType = roomTypesByName.get(room.room_type_name);
        const nightlyDelta = Number((targetType?.base_price || 0) - (currentRoomType?.base_price || 0));
        return {
          ...room,
          nightlyDelta,
          totalDelta: nightlyDelta * nights,
        };
      });
  }, [availabilityQuery.data?.rooms, nights, reservation.room, reservation.room_type_label, roomTypesByName]);

  const quickEditMutation = useMutation({
    mutationFn: async () => {
      await patchHotelReservation(reservation.reservation_id as number, {
        guest_name: quickEditForm.guest_name,
        email: quickEditForm.email || null,
        phone: quickEditForm.phone || null,
        special_requests: quickEditForm.special_requests || null,
      });
      if (guest?.id) {
        await updatePmsContact(guest.id, {
          name: quickEditForm.guest_name || null,
          email: quickEditForm.email || null,
          phone: quickEditForm.phone || null,
        });
      }
    },
    onSuccess: async () => {
      await onRefresh();
      emitPmsReservationsRefresh();
      setQuickEditSavedAt(new Date().toISOString());
      setQuickEditError(null);
      toast.success("Guest details updated.");
    },
    onError: (error) => {
      console.error("Failed to update guest details", error);
      setQuickEditError("Failed to update guest details.");
    },
  });

  const billingMutation = useMutation({
    mutationFn: async () => {
      if (!guest?.id) {
        throw new Error("No linked guest profile");
      }
      const currentCustomFields = asRecord(guest.custom_fields_json);
      return updatePmsContact(guest.id, {
        custom_fields_json: {
          ...currentCustomFields,
          company_billing: companyForm,
        },
      });
    },
    onSuccess: async () => {
      await onRefresh();
      setBillingSavedAt(new Date().toISOString());
      setBillingError(null);
      toast.success("Billing details saved.");
    },
    onError: (error) => {
      console.error("Failed to save billing details", error);
      setBillingError("Failed to save billing details.");
    },
  });

  const serviceMutation = useMutation({
    mutationFn: async (payload: { mode: "add" | "remove"; preset: QuickServicePreset; lineId?: number; pet?: PetForm }) => {
      if (!folio.id || !reservation.reservation_id) {
        throw new Error("No folio linked to this reservation");
      }

      if (payload.mode === "remove" && payload.lineId) {
        return voidPmsFolioLine(folio.id, payload.lineId);
      }

      const extra = findServiceExtra(payload.preset, extrasQuery.data || []);
      const unitPrice = extra?.unit_price ?? payload.preset.fallbackPrice;
      let quantity = 1;
      if (extra?.daily ?? payload.preset.daily) quantity *= nights;
      if (extra?.per_person ?? payload.preset.perPerson) quantity *= totalGuests;
      const petSuffix =
        payload.preset.key === "pet_fee" && payload.pet
          ? [payload.pet.petType, payload.pet.petName].filter(Boolean).join(" · ")
          : "";
      return createPmsReservationCharge(reservation.reservation_id, {
        description: petSuffix ? `${payload.preset.label} · ${petSuffix}` : payload.preset.label,
        quantity,
        unit_price: unitPrice,
        service_date: reservation.check_in || null,
        charge_type: "service",
        metadata_json: {
          service_key: payload.preset.key,
          pet_type: payload.pet?.petType || null,
          pet_name: payload.pet?.petName || null,
          source: "front_desk_quick_service",
        },
      });
    },
    onSuccess: async () => {
      await onRefresh();
      emitPmsReservationsRefresh();
      toast.success("Booking add-on updated.");
    },
    onError: (error) => {
      console.error("Failed to update service line", error);
      toast.error("Failed to update the booking add-on.");
    },
  });

  const roomChangeMutation = useMutation({
    mutationFn: async () => {
      if (!stay.id || !selectedRoomId) {
        throw new Error("No stay or room selected");
      }
      return moveHotelStay(stay.id, {
        room_id: selectedRoomId,
        notes: "Front desk room change",
      });
    },
    onSuccess: async (result) => {
      await onRefresh();
      emitPmsReservationsRefresh();
      setRoomDialogOpen(false);
      setSelectedRoomId(null);
      toast.success(`Room changed to ${result.room_number || "the selected room"}.`);
    },
    onError: (error) => {
      console.error("Failed to move stay", error);
      toast.error("Failed to change the room.");
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!reservation.reservation_id) {
        throw new Error("No reservation linked");
      }
      return checkInHotelReservation(reservation.reservation_id);
    },
    onSuccess: async () => {
      await onRefresh();
      emitPmsReservationsRefresh();
      toast.success(`${reservation.guest_name || "Guest"} checked in${reservation.room ? ` to room ${reservation.room}` : ""}.`);
    },
    onError: (error) => {
      console.error("Failed to check in reservation", error);
      toast.error("Failed to complete check-in.");
    },
  });

  async function submitQuickEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuickEditError(null);
    await quickEditMutation.mutateAsync();
  }

  async function submitCompanyBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBillingError(null);
    await billingMutation.mutateAsync();
  }

  async function handleServiceToggle(serviceKey: QuickServicePreset["key"]) {
    const preset = QUICK_SERVICE_PRESETS.find((item) => item.key === serviceKey);
    if (!preset) return;
    const line = findServiceLine(preset, activeLines);
    if (line) {
      await serviceMutation.mutateAsync({ mode: "remove", preset, lineId: line.id });
      return;
    }
    if (serviceKey === "pet_fee") {
      setPetDialogOpen(true);
      return;
    }
    await serviceMutation.mutateAsync({ mode: "add", preset });
  }

  async function confirmPetService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preset = QUICK_SERVICE_PRESETS.find((item) => item.key === "pet_fee");
    if (!preset) return;
    await serviceMutation.mutateAsync({ mode: "add", preset, pet: petForm });
    setPetDialogOpen(false);
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">
                Guest Folio
              </p>
              <h3 className="mt-2 text-3xl font-editorial text-foreground">
                {reservation.guest_name || guest?.name || "Reservation"}
              </h3>
              <p className="mt-1 text-sm text-foreground-muted">
                {reservation.booking_id || "Hotel booking"} · {reservation.status || "confirmed"}
              </p>
            </div>
            <div className="space-y-2 text-right">
              <div className="rounded-2xl bg-emerald-500/10 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700">
                  Balance
                </p>
                <p className="mt-1 text-2xl font-editorial text-emerald-700">
                  {formatCurrency(outstanding)}
                </p>
              </div>
              <div className="flex justify-end gap-2">
                {normalized(reservation.status) !== "checked_in" ? (
                  <button
                    type="button"
                    onClick={() => checkInMutation.mutate()}
                    disabled={checkInMutation.isPending}
                    className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {checkInMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck2 className="h-4 w-4" />}
                    Save & Check In
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenPayments}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <CreditCard className="h-4 w-4" />
                  Open Payment
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Room Assigned</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {reservation.room ? `${reservation.room} · ${reservation.room_type_label || "Room"}` : "Not assigned"}
              </p>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Stay Dates</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {reservation.check_in && reservation.check_out
                  ? `${formatDate(reservation.check_in)} - ${formatDate(reservation.check_out)}`
                  : "Not scheduled"}
              </p>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Payment Status</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {reservation.zahlungs_status || reservation.payment_status || "Outstanding"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-editorial text-foreground">Quick Add-ons</h3>
              <p className="mt-1 text-sm text-foreground-muted">
                Toggle the most common arrival extras with live folio updates.
              </p>
            </div>
            {serviceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {serviceCards.map((service) => {
              const Icon = service.icon;
              const isActive = Boolean(service.line);
              return (
                <button
                  key={service.key}
                  type="button"
                  onClick={() => void handleServiceToggle(service.key)}
                  disabled={serviceMutation.isPending || !folio.id}
                  className={cn(
                    "rounded-[24px] border p-4 text-left transition-colors disabled:opacity-60",
                    isActive
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-foreground/10 bg-background hover:bg-foreground/[0.03]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={cn(
                        "inline-flex h-11 w-11 items-center justify-center rounded-2xl",
                        isActive ? "bg-emerald-500/12 text-emerald-700" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <Badge variant="outline" className={cn(isActive ? "border-emerald-300 text-emerald-700" : "")}>
                      {isActive ? "Added" : "Optional"}
                    </Badge>
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">{service.label}</p>
                  <p className="mt-1 text-sm text-foreground-muted">
                    {formatCurrency(service.line ? service.line.total_price : service.estimatedTotal)}
                  </p>
                  {service.key === "pet_fee" && service.line?.metadata_json ? (
                    <p className="mt-2 text-xs text-foreground-muted">
                      {[asRecord(service.line.metadata_json).pet_type, asRecord(service.line.metadata_json).pet_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="border border-foreground/10 bg-card shadow-none">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-editorial text-foreground">Room Management</h3>
                <p className="mt-1 text-sm text-foreground-muted">
                  Reassign the room with live availability and nightly delta preview.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoomDialogOpen(true)}
                disabled={!stay.id}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03] disabled:opacity-60"
              >
                <ArrowRightLeft className="h-4 w-4 text-primary" />
                Change Room
              </button>
            </div>
            <div className="rounded-2xl border border-foreground/10 bg-background px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Current Room</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {reservation.room ? `${reservation.room} · ${reservation.room_type_label || "Room"}` : "Room assignment pending"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-foreground/10 bg-card shadow-none">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-editorial text-foreground">Guest Details</h3>
                <p className="mt-1 text-sm text-foreground-muted">
                  Edit the arrival contact without leaving the front desk workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenGuestPanel}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-foreground/10 px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-foreground/[0.03]"
              >
                <UserRound className="h-4 w-4 text-primary" />
                Open CRM
              </button>
            </div>

            <form className="space-y-4" onSubmit={(event) => void submitQuickEdit(event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Guest Name
                  </label>
                  <input
                    value={quickEditForm.guest_name}
                    onChange={(event) =>
                      setQuickEditForm((current) => ({ ...current, guest_name: event.target.value }))
                    }
                    className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Email
                  </label>
                  <input
                    value={quickEditForm.email}
                    onChange={(event) =>
                      setQuickEditForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Phone
                  </label>
                  <input
                    value={quickEditForm.phone}
                    onChange={(event) =>
                      setQuickEditForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Special Requests
                  </label>
                  <textarea
                    value={quickEditForm.special_requests}
                    onChange={(event) =>
                      setQuickEditForm((current) => ({ ...current, special_requests: event.target.value }))
                    }
                    className="min-h-28 w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {quickEditError ? <ApiError message={quickEditError} dismissible={false} /> : null}

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-foreground-muted">
                  {quickEditSavedAt ? `Last saved ${formatRelativeTime(quickEditSavedAt)}.` : "No recent edits yet."}
                </p>
                <button
                  type="submit"
                  disabled={quickEditMutation.isPending}
                  className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {quickEditMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PencilLine className="h-4 w-4" />}
                  Save Guest Details
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border border-foreground/10 bg-card shadow-none">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-editorial text-foreground">Billing & Company</h3>
              <p className="mt-1 text-sm text-foreground-muted">
                Save company billing preferences and preview how the bill header will look.
              </p>
            </div>
            <Badge variant="outline">{companyForm.enabled ? "Company billing" : "Guest billing"}</Badge>
          </div>

          <form className="space-y-4" onSubmit={(event) => void submitCompanyBilling(event)}>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCompanyForm((current) => ({ ...current, enabled: !current.enabled }))}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  companyForm.enabled
                    ? "bg-primary text-primary-foreground"
                    : "border border-foreground/10 text-foreground hover:bg-foreground/[0.03]",
                )}
              >
                <Building2 className="h-4 w-4" />
                {companyForm.enabled ? "Company billing enabled" : "Add company address to bill"}
              </button>
              <div className="inline-flex rounded-2xl border border-foreground/10 p-1">
                <button
                  type="button"
                  onClick={() => setCompanyForm((current) => ({ ...current, bill_name_mode: "guest_only" }))}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-semibold",
                    companyForm.bill_name_mode === "guest_only" ? "bg-foreground text-background" : "text-foreground-muted",
                  )}
                >
                  Guest Name Only
                </button>
                <button
                  type="button"
                  onClick={() => setCompanyForm((current) => ({ ...current, bill_name_mode: "guest_and_company" }))}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm font-semibold",
                    companyForm.bill_name_mode === "guest_and_company" ? "bg-foreground text-background" : "text-foreground-muted",
                  )}
                >
                  Guest + Company
                </button>
              </div>
            </div>

            {companyForm.enabled ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Company Name
                  </label>
                  <input
                    value={companyForm.company_name}
                    onChange={(event) =>
                      setCompanyForm((current) => ({ ...current, company_name: event.target.value }))
                    }
                    className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Tax ID
                  </label>
                  <input
                    value={companyForm.tax_id}
                    onChange={(event) =>
                      setCompanyForm((current) => ({ ...current, tax_id: event.target.value }))
                    }
                    className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                    Company Address
                  </label>
                  <textarea
                    value={companyForm.company_address}
                    onChange={(event) =>
                      setCompanyForm((current) => ({ ...current, company_address: event.target.value }))
                    }
                    className="min-h-24 w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-dashed border-foreground/15 bg-foreground/[0.02] px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Bill Preview</p>
              <p className="mt-2 text-sm text-foreground">
                {buildCompanyPreview(companyForm, reservation.guest_name || guest?.name || "Guest")}
              </p>
            </div>

            {billingError ? <ApiError message={billingError} dismissible={false} /> : null}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-foreground-muted">
                {billingSavedAt ? `Saved ${formatRelativeTime(billingSavedAt)}.` : guest ? "Stored in guest billing preferences." : "Link a guest profile to save billing preferences."}
              </p>
              <button
                type="submit"
                disabled={billingMutation.isPending || !guest}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {billingMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Billing Details
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-editorial">Change Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {availabilityQuery.isLoading ? (
              <div className="flex items-center gap-3 text-sm text-foreground-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading available rooms...
              </div>
            ) : availabilityQuery.error ? (
              <ApiError message="Failed to load available rooms." dismissible={false} onRetry={() => void availabilityQuery.refetch()} />
            ) : roomOptions.length ? (
              <div className="grid gap-3">
                {roomOptions.map((room) => (
                  <button
                    key={room.room_id}
                    type="button"
                    onClick={() => setSelectedRoomId(room.room_id)}
                    className={cn(
                      "rounded-2xl border px-4 py-4 text-left transition-colors",
                      selectedRoomId === room.room_id
                        ? "border-primary bg-primary/8"
                        : "border-foreground/10 hover:bg-foreground/[0.03]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-base font-semibold text-foreground">
                          {room.room_number} · {room.room_type_name}
                        </p>
                        <p className="mt-1 text-sm text-foreground-muted">
                          {room.floor ? `Floor ${room.floor}` : "Floor n/a"} · {room.status}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-semibold", room.totalDelta >= 0 ? "text-foreground" : "text-emerald-700")}>
                          {room.totalDelta === 0
                            ? "No price change"
                            : `${room.totalDelta > 0 ? "+" : "-"}${formatCurrency(Math.abs(room.totalDelta))}`}
                        </p>
                        <p className="mt-1 text-xs text-foreground-muted">
                          {room.nightlyDelta === 0
                            ? "Same nightly rate"
                            : `${room.nightlyDelta > 0 ? "+" : "-"}${formatCurrency(Math.abs(room.nightlyDelta))} / night`}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground-muted">No alternative rooms are available for this stay window.</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRoomDialogOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground-muted hover:bg-foreground/[0.03]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => roomChangeMutation.mutate()}
                disabled={!selectedRoomId || roomChangeMutation.isPending}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {roomChangeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BedDouble className="h-4 w-4" />}
                Confirm Change
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={petDialogOpen} onOpenChange={setPetDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-editorial">Add Pet Fee</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void confirmPetService(event)}>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                Pet Type
              </label>
              <input
                value={petForm.petType}
                onChange={(event) => setPetForm((current) => ({ ...current, petType: event.target.value }))}
                placeholder="Dog"
                className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-foreground-muted">
                Pet Name
              </label>
              <input
                value={petForm.petName}
                onChange={(event) => setPetForm((current) => ({ ...current, petName: event.target.value }))}
                placeholder="Milo"
                className="w-full rounded-xl border border-foreground/10 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPetDialogOpen(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-foreground-muted hover:bg-foreground/[0.03]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={serviceMutation.isPending}
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {serviceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Save Pet Fee
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
