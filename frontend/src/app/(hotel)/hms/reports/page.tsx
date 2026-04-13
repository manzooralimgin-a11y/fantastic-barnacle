"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { downloadPmsReport, type PmsReportType } from "@/features/hms/pms/api/reports";

type ReportDefinition = {
  type: PmsReportType;
  label: string;
  format?: "CSV" | "XML";
  description: string;
};

type ReportCategory = {
  title: string;
  description: string;
  eyebrow: string;
  icon: typeof Building2;
  tone: string;
  reports: ReportDefinition[];
};

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(seed: string, days: number) {
  const next = new Date(`${seed}T12:00:00`);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

const today = toIsoDate(new Date());
const monthStart = `${today.slice(0, 8)}01`;

const categories: ReportCategory[] = [
  {
    title: "Tagesgeschäft",
    description: "Operational reports for the desk, floor teams, and daily handover.",
    eyebrow: "Operations",
    icon: Building2,
    tone: "from-sky-500/18 via-cyan-500/10 to-transparent",
    reports: [
      { type: "cockpitliste", label: "Cockpitliste", description: "Daily arrivals, in-house, departures, and live desk view." },
      { type: "housekeepingliste", label: "Housekeepingliste", description: "Room status, open tasks, and active housekeeping notes." },
      { type: "haus_status", label: "Haus Status", description: "At-a-glance room operating and housekeeping status export." },
      { type: "fb_verpflegungsbericht", label: "F&B Verpflegungsbericht", description: "Breakfast, minibar, and service postings by guest and room." },
    ],
  },
  {
    title: "Finanzen",
    description: "Front-desk-friendly exports for cash, invoices, deposits, and balances.",
    eyebrow: "Financials",
    icon: Wallet,
    tone: "from-emerald-500/18 via-teal-500/10 to-transparent",
    reports: [
      { type: "kassenbuch", label: "Kassenbuch", description: "All posted payments in the selected period." },
      { type: "anzahlungsliste", label: "Anzahlungsliste", description: "Deposit payments collected ahead of arrival." },
      { type: "einnahmebericht", label: "Einnahmebericht", description: "Invoice totals, paid amounts, and remaining balances." },
      { type: "finanzkonten_uebersicht", label: "Finanzkonten Übersicht", description: "Revenue totals by payment method." },
      { type: "offene_salden", label: "Offene Salden", description: "All invoices with outstanding balances." },
      { type: "rechnungsbericht", label: "Rechnungsbericht", description: "Full invoice register for the selected window." },
      { type: "warengruppenjournal", label: "Warengruppenjournal", description: "Revenue by posting group and service category." },
    ],
  },
  {
    title: "Auswertungen",
    description: "Occupancy and source analytics without turning the page into a BI tool.",
    eyebrow: "Analytics",
    icon: FileSpreadsheet,
    tone: "from-amber-500/18 via-gold/10 to-transparent",
    reports: [
      { type: "belegungsuebersicht", label: "Belegungsübersicht", description: "Daily occupancy percentages and sold rooms." },
      { type: "tageszahlen", label: "Tageszahlen", description: "Arrivals, departures, occupied rooms, and turnover per day." },
      { type: "buchungsquellenbericht", label: "Buchungsquellenbericht", description: "Bookings and revenue grouped by source." },
      { type: "kennzahlenbericht", label: "Kennzahlenbericht", description: "Core PMS KPIs for the selected period." },
    ],
  },
  {
    title: "Behörden & Steuern",
    description: "Compliance exports for tax, reporting, and registration workflows.",
    eyebrow: "Compliance",
    icon: ShieldCheck,
    tone: "from-rose-500/18 via-orange-500/10 to-transparent",
    reports: [
      { type: "city_tax_bericht", label: "City Tax Bericht", description: "Tax-relevant nights and guest residency data." },
      { type: "gobd_export", label: "GoBD Export", description: "Audit-friendly export of invoices and payments." },
      { type: "meldeschein_download", label: "Meldeschein Download", description: "Guest registration export for the selected arrivals." },
      { type: "fremdenverkehrsstatistik_xml", label: "Fremdenverkehrsstatistik (XML)", format: "XML", description: "Tourism statistics grouped by guest origin." },
    ],
  },
];

export default function HotelReportsPage() {
  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [activeReport, setActiveReport] = useState<PmsReportType | null>(null);

  const totalReports = useMemo(
    () => categories.reduce((count, category) => count + category.reports.length, 0),
    [],
  );

  async function handleDownload(report: ReportDefinition) {
    try {
      setActiveReport(report.type);
      await downloadPmsReport(report.type, {
        start: startDate,
        end: endDate,
      });
      toast.success(`${report.label} started downloading.`);
    } catch (error) {
      console.error("Failed to download report", error);
      toast.error(`Failed to download ${report.label}.`);
    } finally {
      setActiveReport(null);
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-foreground-muted">Berichte</p>
          <h1 className="mt-2 text-4xl font-editorial font-bold tracking-tight text-foreground">One-click hotel reporting</h1>
          <p className="mt-2 text-foreground-muted">
            Pick a date range, choose the report you need, and download it straight to the browser. No queues, no waiting,
            no giant alphabetical list to scan under pressure.
          </p>
        </div>

        <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <CalendarRange className="h-5 w-5 text-primary" />
            <div className="min-w-[140px]">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Range</div>
              <div className="text-sm font-medium text-foreground">{startDate} to {endDate}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Reports</div>
              <div className="text-sm font-medium text-foreground">{totalReports} one-click exports</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none bg-card shadow-[var(--shadow-soft)]">
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_auto_auto_auto_auto]">
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">Start</span>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">End</span>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>

          <Button type="button" variant="outline" onClick={() => { setStartDate(today); setEndDate(today); }}>
            Heute
          </Button>
          <Button type="button" variant="outline" onClick={() => { setStartDate(shiftDays(today, -6)); setEndDate(today); }}>
            7 Tage
          </Button>
          <Button type="button" variant="outline" onClick={() => { setStartDate(monthStart); setEndDate(today); }}>
            Monat
          </Button>
          <Button type="button" variant="outline" onClick={() => { setStartDate(shiftDays(today, -89)); setEndDate(today); }}>
            90 Tage
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Card key={category.title} className="overflow-hidden border-none bg-card shadow-[var(--shadow-soft)]">
              <div className={`h-1 w-full bg-gradient-to-r ${category.tone}`} />
              <CardHeader className="space-y-3 border-b border-foreground/10 bg-foreground/[0.02]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-foreground-muted">{category.eyebrow}</p>
                    <CardTitle className="mt-2 text-2xl">{category.title}</CardTitle>
                    <CardDescription className="mt-2 max-w-xl">{category.description}</CardDescription>
                  </div>
                  <div className="rounded-2xl border border-foreground/10 bg-background/70 p-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 p-4">
                {category.reports.map((report) => {
                  const isLoading = activeReport === report.type;
                  return (
                    <button
                      key={report.type}
                      type="button"
                      onClick={() => void handleDownload(report)}
                      disabled={Boolean(activeReport)}
                      className="group flex min-h-[78px] items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-background/70 px-4 py-4 text-left transition hover:border-primary/30 hover:bg-background disabled:cursor-wait disabled:opacity-70"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-foreground">{report.label}</span>
                          <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground-muted">
                            {report.format || "CSV"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-foreground-muted">{report.description}</p>
                      </div>
                      <div className="flex h-11 min-w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
