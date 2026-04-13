"use client";

/**
 * ProdukteBlock — Ticket 4.2
 *
 * Fetches GET /hms/pms/inventory/extras and renders a tabular checklist.
 * Each extra can be toggled on/off. Quantity is editable.
 * Per-person (Pers) and daily (Täglich) multipliers are applied live to show
 * the line total. The extrasTotal() selector in the store feeds the modal footer.
 */
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { fetchExtras, type HotelExtra } from "@/features/hms/pms/api/inventory";

function formatEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function ProdukteBlock() {
  const propertyId = useReservierungStore((s) => s.propertyId);
  const extras = useReservierungStore((s) => s.extras);
  const nights = useReservierungStore((s) => s.nights);
  const totalPax = useReservierungStore((s) => s.totalPax);
  const extrasTotal = useReservierungStore((s) => s.extrasTotal);
  const toggleExtra = useReservierungStore((s) => s.toggleExtra);
  const setExtraQuantity = useReservierungStore((s) => s.setExtraQuantity);

  const nightCount = nights();
  const pax = totalPax();
  const runningTotal = extrasTotal();

  const { data: catalog = [], isFetching } = useQuery({
    queryKey: ["pms-extras", propertyId],
    queryFn: () => fetchExtras(propertyId),
    staleTime: 5 * 60_000,
  });

  function lineTotal(extra: HotelExtra | typeof extras[number], qty: number): number {
    let amt = ("unit_price" in extra ? extra.unit_price : extra.unitPrice) * qty;
    const perPerson = "per_person" in extra ? extra.per_person : extra.perPerson;
    if (perPerson) amt *= pax;
    if (extra.daily) amt *= nightCount;
    return amt;
  }

  function isSelected(id: number) {
    return extras.some((e) => e.extraId === id);
  }

  function getSelected(id: number) {
    return extras.find((e) => e.extraId === id);
  }

  return (
    <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Produkte</h3>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin text-foreground-muted" />}
      </div>

      {catalog.length === 0 && !isFetching && (
        <p className="text-xs text-foreground-muted">
          Keine Extras für diese Property konfiguriert.
        </p>
      )}

      {catalog.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-foreground/[0.03] text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                <th className="px-3 py-2 text-left w-6" />
                <th className="px-3 py-2 text-left">Produkt</th>
                <th className="px-3 py-2 text-center w-8" title="Pro Person">Pers</th>
                <th className="px-3 py-2 text-center w-12" title="Täglich">Tägl.</th>
                <th className="px-3 py-2 text-center w-16">Anzahl</th>
                <th className="px-3 py-2 text-right">Betrag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {catalog.map((extra) => {
                const selected = isSelected(extra.id);
                const sel = getSelected(extra.id);
                const qty = sel?.quantity ?? 1;

                return (
                  <tr
                    key={extra.id}
                    className={cn(
                      "transition-colors",
                      selected ? "bg-primary/[0.04]" : "hover:bg-foreground/[0.02]",
                    )}
                  >
                    {/* Toggle checkbox */}
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleExtra({
                            extraId: extra.id,
                            name: extra.name,
                            unitPrice: extra.unit_price,
                            perPerson: extra.per_person,
                            daily: extra.daily,
                          })
                        }
                        className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("font-medium", selected && "text-primary")}>
                        {extra.name}
                      </span>
                      <span className="ml-1 text-[10px] text-foreground-muted font-mono">
                        {formatEur(extra.unit_price)}
                      </span>
                    </td>
                    {/* Pers indicator */}
                    <td className="px-3 py-2.5 text-center">
                      {extra.per_person && (
                        <span className="inline-block rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold text-foreground-muted">
                          ×{pax}
                        </span>
                      )}
                    </td>
                    {/* Daily indicator */}
                    <td className="px-3 py-2.5 text-center">
                      {extra.daily && (
                        <span className="inline-block rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold text-foreground-muted">
                          ×{nightCount}N
                        </span>
                      )}
                    </td>
                    {/* Quantity */}
                    <td className="px-3 py-2.5 text-center">
                      {selected ? (
                        <input
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e) =>
                            setExtraQuantity(extra.id, Math.max(1, Number(e.target.value)))
                          }
                          className="w-12 rounded-lg border border-foreground/10 bg-card px-2 py-1 text-center text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                        />
                      ) : (
                        <span className="text-xs text-foreground-muted">—</span>
                      )}
                    </td>
                    {/* Line total */}
                    <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-foreground">
                      {selected
                        ? formatEur(lineTotal(extra, qty))
                        : <span className="text-foreground-muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Running extras total */}
      {extras.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-foreground-muted">Extras gesamt</span>
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatEur(runningTotal)}
          </span>
        </div>
      )}
    </section>
  );
}
