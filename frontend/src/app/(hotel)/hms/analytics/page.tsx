"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/components/shared/api-error";
import { BarChart3, Euro, Loader2, Percent, PlaneLanding, PlaneTakeoff } from "lucide-react";
import {
  fetchHmsCrmGuests,
  fetchHmsReportingDaily,
  fetchHmsReportingSummary,
  type HotelCrmGuest,
  type HotelReportDaily,
  type HotelReportSummary,
} from "@/lib/hms";

function formatCurrency(value: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<HotelReportSummary | null>(null);
  const [daily, setDaily] = useState<HotelReportDaily | null>(null);
  const [guests, setGuests] = useState<HotelCrmGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        setLoading(true);
        const [nextSummary, nextDaily, nextGuests] = await Promise.all([
          fetchHmsReportingSummary(undefined, days),
          fetchHmsReportingDaily(undefined, Math.min(days, 31)),
          fetchHmsCrmGuests(),
        ]);
        setSummary(nextSummary);
        setDaily(nextDaily);
        setGuests(nextGuests);
        setFetchError(null);
      } catch (error) {
        console.error("Failed to load hotel analytics", error);
        setFetchError("Failed to load analytics data.");
      } finally {
        setLoading(false);
      }
    }

    void loadAnalytics();
  }, [days]);

  const guestOrigins = useMemo(() => {
    const grouped = new Map<
      string,
      { country: string; guests: number; reservations: number; birthdaysKnown: number }
    >();
    for (const guest of guests) {
      const key = guest.country_name || guest.country_code || "Unknown";
      const current = grouped.get(key) ?? {
        country: key,
        guests: 0,
        reservations: 0,
        birthdaysKnown: 0,
      };
      current.guests += 1;
      current.reservations += guest.reservation_count;
      current.birthdaysKnown += guest.birthday ? 1 : 0;
      grouped.set(key, current);
    }
    return Array.from(grouped.values())
      .sort((left, right) => right.reservations - left.reservations)
      .slice(0, 8);
  }, [guests]);

  const stats = summary
    ? [
        {
          label: "Occupancy",
          value: `${Math.round(summary.occupancy_pct)}%`,
          icon: Percent,
          trend: `${summary.occupied_room_nights}/${summary.available_room_nights} room nights`,
        },
        {
          label: "Arrivals",
          value: summary.arrivals.toString(),
          icon: PlaneLanding,
          trend: `${summary.days} day window`,
        },
        {
          label: "Departures",
          value: summary.departures.toString(),
          icon: PlaneTakeoff,
          trend: `${summary.days} day window`,
        },
        {
          label: "Turnover",
          value: formatCurrency(summary.turnover_total, summary.currency),
          icon: Euro,
          trend: `Property ${summary.property_id}`,
        },
      ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">
            Analytics
          </h1>
          <p className="text-foreground-muted mt-1">
            Live PMS reporting for occupancy, arrivals, departures, and turnover.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-foreground/10 bg-card p-1">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDays(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                days === value
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground-muted hover:text-foreground"
              }`}
            >
              {value}d
            </button>
          ))}
        </div>
      </div>

      {fetchError && <ApiError message={fetchError} dismissible={false} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {loading && stats.length === 0 ? (
          <Card className="col-span-full bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-8 flex items-center gap-3 text-foreground-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading analytics...
            </CardContent>
          </Card>
        ) : (
          stats.map(({ label, value, icon: Icon, trend }) => (
            <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                    {label}
                  </p>
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
                  <span className="text-[10px] font-medium text-foreground/60">{trend}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">
              Daily Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!daily ? (
              <div className="p-8 text-sm text-foreground-muted">No daily report data yet.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Occupancy</th>
                    <th className="px-6 py-4">Arrivals</th>
                    <th className="px-6 py-4">Departures</th>
                    <th className="px-6 py-4 text-right">Turnover</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {daily.items.map((item) => (
                    <tr key={item.report_date} className="hover:bg-foreground/[0.01]">
                      <td className="px-6 py-4 text-foreground-muted">
                        {new Date(item.report_date).toLocaleDateString("de-DE")}
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {Math.round(item.occupancy_pct)}%
                      </td>
                      <td className="px-6 py-4 text-foreground-muted">{item.arrivals}</td>
                      <td className="px-6 py-4 text-foreground-muted">{item.departures}</td>
                      <td className="px-6 py-4 text-right font-mono text-foreground">
                        {formatCurrency(item.turnover, daily.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">
              Guest Origins
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {guestOrigins.length === 0 ? (
              <div className="p-8 text-sm text-foreground-muted">
                No guest origin data is available yet.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                  <tr>
                    <th className="px-6 py-4">Country</th>
                    <th className="px-6 py-4">Profiles</th>
                    <th className="px-6 py-4">Reservations</th>
                    <th className="px-6 py-4">Birthdays Known</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/10">
                  {guestOrigins.map((origin) => (
                    <tr key={origin.country} className="hover:bg-foreground/[0.01]">
                      <td className="px-6 py-4 font-medium text-foreground">{origin.country}</td>
                      <td className="px-6 py-4 text-foreground-muted">{origin.guests}</td>
                      <td className="px-6 py-4 text-foreground-muted">{origin.reservations}</td>
                      <td className="px-6 py-4 text-foreground-muted">
                        {origin.birthdaysKnown}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none">
        <CardContent className="p-6 flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-editorial text-foreground">Reporting Source</h3>
            <p className="text-sm text-foreground-muted">
              These analytics now come from the live PMS reporting endpoints and shared CRM
              profiles, not from static demo values.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
