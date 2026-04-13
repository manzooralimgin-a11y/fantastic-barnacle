"use client";

/**
 * RechnungsempfaengerBlock — Ticket 2.1
 *
 * Invoice payer (Rechnungsempfänger) CRM lookup, booking source,
 * and color-tag picker. All fields write directly to reservierungStore.
 */
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { GuestSearchCombobox } from "../shared/GuestSearchCombobox";
import { BuchungsquelleSelect } from "../shared/BuchungsquelleSelect";
import { ColorPickerInput } from "../shared/ColorPickerInput";
import type { GuestSearchResult } from "@/features/hms/pms/api/inventory";

function BlockLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-1.5">
      {children}
    </p>
  );
}

export function RechnungsempfaengerBlock() {
  const billingGuestName = useReservierungStore((s) => s.billingGuestName);
  const bookingSource = useReservierungStore((s) => s.bookingSource);
  const colorTag = useReservierungStore((s) => s.colorTag);
  const propertyId = useReservierungStore((s) => s.propertyId);
  const setBillingGuest = useReservierungStore((s) => s.setBillingGuest);
  const setBookingSource = useReservierungStore((s) => s.setBookingSource);
  const setColorTag = useReservierungStore((s) => s.setColorTag);

  function handleGuestSelect(guest: GuestSearchResult) {
    setBillingGuest(guest.id, guest.name);
  }
  function handleGuestClear() {
    setBillingGuest(null, "");
  }

  return (
    <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
        Rechnungsempfänger
      </h3>

      <div>
        <BlockLabel>Rechnungsempfänger (CRM)</BlockLabel>
        <GuestSearchCombobox
          value={billingGuestName}
          placeholder="Name, E-Mail oder Firma…"
          propertyId={propertyId}
          onSelect={handleGuestSelect}
          onClear={handleGuestClear}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <BlockLabel>Buchungsquelle</BlockLabel>
          <BuchungsquelleSelect value={bookingSource} onChange={setBookingSource} />
        </div>
        <div>
          <BlockLabel>Farbe</BlockLabel>
          <ColorPickerInput value={colorTag} onChange={setColorTag} />
        </div>
      </div>
    </section>
  );
}
