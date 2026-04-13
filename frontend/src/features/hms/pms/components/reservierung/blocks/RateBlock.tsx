"use client";

/**
 * RateBlock — Ticket 4.1
 *
 * Fetches POST /hms/pms/pricing/quote whenever checkIn, checkOut, or
 * roomTypeId change in the store. Renders a radio-button table of available
 * rate plans. Selecting a plan writes ratePlanId + ratePlanTotal to the store,
 * which feeds the Gesamtpreis total in the modal footer.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { fetchPricingQuote } from "@/features/hms/pms/api/inventory";

function formatEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function RateBlock() {
  const checkIn = useReservierungStore((s) => s.checkIn);
  const checkOut = useReservierungStore((s) => s.checkOut);
  const roomTypeId = useReservierungStore((s) => s.roomTypeId);
  const propertyId = useReservierungStore((s) => s.propertyId);
  const ratePlanId = useReservierungStore((s) => s.ratePlanId);
  const setRatePlan = useReservierungStore((s) => s.setRatePlan);
  const nights = useReservierungStore((s) => s.nights);
  const nightCount = nights();

  const enabled = !!checkIn && !!checkOut && !!roomTypeId && nightCount > 0;

  const { data: quote, isFetching, isError } = useQuery({
    queryKey: ["pms-pricing-quote", checkIn, checkOut, roomTypeId, propertyId],
    queryFn: () => fetchPricingQuote(checkIn, checkOut, roomTypeId!, propertyId),
    enabled,
    staleTime: 60_000,
  });

  // Auto-select first plan when results arrive and nothing is selected
  useEffect(() => {
    if (!quote?.rate_plans?.length) return;
    if (ratePlanId && quote.rate_plans.some((p) => p.plan_id === ratePlanId)) return;
    const first = quote.rate_plans[0];
    setRatePlan(first.plan_id, first.plan_name, first.total_price);
  }, [quote]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Rate</h3>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin text-foreground-muted" />}
      </div>

      {!enabled && (
        <p className="text-xs text-foreground-muted">
          Zimmer und Datum wählen, um Ratenpläne zu laden.
        </p>
      )}

      {enabled && isError && (
        <p className="text-xs text-status-danger">
          Ratenpläne konnten nicht geladen werden.
        </p>
      )}

      {enabled && !isFetching && quote?.rate_plans?.length === 0 && (
        <p className="text-xs text-foreground-muted">
          Kein Ratenplan für diese Kombination verfügbar.
        </p>
      )}

      {quote?.rate_plans && quote.rate_plans.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-foreground/[0.03] text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                <th className="px-3 py-2 text-left w-6" />
                <th className="px-3 py-2 text-left">Ratenplan</th>
                <th className="px-3 py-2 text-right">Ø / Nacht</th>
                <th className="px-3 py-2 text-right">Gesamt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/10">
              {quote.rate_plans.map((plan) => {
                const selected = ratePlanId === plan.plan_id;
                return (
                  <tr
                    key={plan.plan_id}
                    onClick={() => setRatePlan(plan.plan_id, plan.plan_name, plan.total_price)}
                    className={cn(
                      "cursor-pointer transition-colors",
                      selected
                        ? "bg-primary/[0.06]"
                        : "hover:bg-foreground/[0.02]",
                    )}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="radio"
                        readOnly
                        checked={selected}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={cn("font-medium", selected && "text-primary")}>
                        {plan.plan_name}
                      </span>
                      <span className="ml-2 text-[10px] text-foreground-muted font-mono">
                        {plan.plan_code}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-foreground-muted">
                      {formatEur(plan.avg_nightly_rate)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                      {formatEur(plan.total_price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
