"use client";

/**
 * GaesteBlock — Ticket 3.2
 *
 * Renders one GuestSearchCombobox row per occupant slot (adults + children).
 * The number of rows is driven by paxAdults + paxChildren from the store, so
 * it updates automatically when ZimmerBlock's pax steppers change.
 */
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { GuestSearchCombobox } from "../shared/GuestSearchCombobox";
import type { GuestSearchResult } from "@/features/hms/pms/api/inventory";

export function GaesteBlock() {
  const occupants = useReservierungStore((s) => s.occupants);
  const propertyId = useReservierungStore((s) => s.propertyId);
  const setOccupant = useReservierungStore((s) => s.setOccupant);

  if (occupants.length === 0) return null;

  return (
    <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Gäste</h3>
        <span className="text-xs text-foreground-muted">
          {occupants.length} {occupants.length === 1 ? "Person" : "Personen"}
        </span>
      </div>

      {occupants.map((occ, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {/* Slot label */}
          <span className="w-5 flex-shrink-0 text-center text-[10px] font-bold text-foreground-muted">
            {idx + 1}
          </span>
          <div className="flex-1">
            <GuestSearchCombobox
              value={occ.displayName}
              placeholder={idx === 0 ? "Hauptgast (Primär)…" : `Gast ${idx + 1}…`}
              propertyId={propertyId}
              onSelect={(guest: GuestSearchResult) =>
                setOccupant(idx, { guestProfileId: guest.id, displayName: guest.name })
              }
              onClear={() =>
                setOccupant(idx, { guestProfileId: null, displayName: "" })
              }
            />
          </div>
          {idx === 0 && (
            <span className="flex-shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Primär
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
