"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CalendarCheck, ShoppingCart, PackageSearch, AlertTriangle, UserPlus, CalendarPlus, FileText, Receipt, Printer, Building2 } from "lucide-react";
import api from "@/lib/api";
import {
  buildRoomRateMap,
  defaultHotelPropertyId,
  fetchHotelRoomTypes,
  type HotelRoomTypeOption,
} from "@/lib/hotel-room-types";
import { cn } from "@/lib/utils";
import Meldeschein, { MeldescheinData, emptyMeldeschein } from "@/components/hms/meldeschein";
import Rechnung, { RechnungData, RechnungItem, emptyRechnung, ZahlungsMethode, ZahlungsStatus } from "@/components/hms/rechnung";

type Arrival = { id: string; anrede: string; guest_name: string; room: string; room_type: string; check_in_time: string; check_in: string; check_out: string; status: "expected" | "checked-in" | "late" | "no-show"; zahlungs_methode: string; zahlungs_status: string };
type Departure = { id: string; anrede: string; guest_name: string; room: string; room_type: string; check_out_time: string; check_in: string; check_out: string; status: "pending" | "checked-out" | "late"; zahlungs_methode: string; zahlungs_status: string };

const statusColors: Record<string, string> = {
  expected: "bg-primary/10 text-primary border-transparent",
  "checked-in": "bg-emerald-500/10 text-emerald-600 border-transparent",
  late: "bg-amber-500/10 text-amber-600 border-transparent",
  "no-show": "bg-red-500/10 text-red-600 border-transparent",
  pending: "bg-primary/10 text-primary border-transparent",
  "checked-out": "bg-foreground/10 text-foreground border-transparent",
};

function buildMeldeschein(guest: Arrival | Departure): MeldescheinData {
  return { ...emptyMeldeschein, anrede: guest.anrede || "", nachname: guest.guest_name.split(" ").slice(-1)[0], vorname: guest.guest_name.split(" ").slice(0, -1).join(" "), anreise: guest.check_in, abreise: guest.check_out, reservierung_nr: guest.id.replace("R-", ""), zimmer: guest.room };
}

function buildRechnung(guest: Arrival | Departure, roomRates: Record<string, number>): RechnungData {
  const nights = Math.max(1, Math.ceil((new Date(guest.check_out).getTime() - new Date(guest.check_in).getTime()) / 86400000));
  const rate = roomRates[guest.room_type] || 89;
  const netto7 = +(rate * nights / 1.07).toFixed(2);
  const mwst7 = +(rate * nights - netto7).toFixed(2);
  const kurtaxe = +(nights * 2.5).toFixed(2); // Kurtaxe per night
  const items: RechnungItem[] = [];
  const startDate = new Date(guest.check_in);
  for (let i = 0; i < nights; i++) {
    const d = new Date(startDate); d.setDate(d.getDate() + i);
    const dEnd = new Date(d); dEnd.setDate(dEnd.getDate() + 1);
    const itemNetto = +(rate / 1.07).toFixed(2);
    const itemMwst = +(rate - itemNetto).toFixed(2);
    items.push({ nr: i + 1, datum_von: d.toISOString().slice(0, 10), datum_bis: dEnd.toISOString().slice(0, 10), beschreibung: `${guest.room_type} - Zimmer ${guest.room}`, menge: 1, netto: itemNetto, mwst_satz: 7, mwst: itemMwst, brutto: rate });
  }
  // Add Kurtaxe as 19% item
  const kurtaxeNetto = +(kurtaxe / 1.19).toFixed(2);
  const kurtaxeMwst = +(kurtaxe - kurtaxeNetto).toFixed(2);
  items.push({ nr: nights + 1, datum_von: guest.check_in, datum_bis: guest.check_out, beschreibung: "Kurtaxe / City tax", menge: nights, netto: kurtaxeNetto, mwst_satz: 19, mwst: kurtaxeMwst, brutto: kurtaxe });
  const gesamt = rate * nights + kurtaxe;
  return {
    ...emptyRechnung,
    rechnungs_nr: `RE-${guest.id.replace("R-", "")}`,
    folio: `${guest.id.replace("R-", "")}-1`,
    reservierung_nr: guest.id.replace("R-", ""),
    datum: new Date().toISOString().slice(0, 10),
    gast_name: guest.guest_name, gast_anrede: guest.anrede || "", gast_strasse: "", gast_plz_stadt: "", gast_land: "Deutschland",
    zimmer: guest.room, zimmer_typ: guest.room_type,
    anreise: guest.check_in, abreise: guest.check_out,
    items,
    netto_7: netto7, mwst_7: mwst7, netto_19: kurtaxeNetto, mwst_19: kurtaxeMwst,
    gesamtsumme: gesamt, kurtaxe, anzahlung: 0, anzahlung_label: "", zahlung: gesamt,
    zahlungs_methode: (guest.zahlungs_methode || "") as ZahlungsMethode,
    zahlungs_status: (guest.zahlungs_status || "offen") as ZahlungsStatus,
    zahlungs_datum: guest.zahlungs_status === "bezahlt" ? guest.check_out : "",
  };
}

type FrontDeskStats = {
  today_arrivals: number;
  today_departures: number;
  occupied: number;
  available: number;
  total_rooms: number;
};

export default function FrontDeskPage() {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [stats, setStats] = useState<FrontDeskStats>({
    today_arrivals: 0,
    today_departures: 0,
    occupied: 0,
    available: 0,
    total_rooms: 0,
  });
  const [roomTypes, setRoomTypes] = useState<HotelRoomTypeOption[]>([]);
  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  // Dialogs
  const [meldescheinOpen, setMeldescheinOpen] = useState(false);
  const [rechnungOpen, setRechnungOpen] = useState(false);
  const [meldescheinData, setMeldescheinData] = useState<MeldescheinData>(emptyMeldeschein);
  const [rechnungData, setRechnungData] = useState<RechnungData>(emptyRechnung);
  const [companyBilling, setCompanyBilling] = useState(false);
  const [companyForm, setCompanyForm] = useState({ firma: "", strasse: "", plz_stadt: "", land: "Deutschland", ust_id: "" });
  const printRef = useRef<HTMLDivElement>(null);
  const roomRates = buildRoomRateMap(roomTypes);

  useEffect(() => {
    Promise.all([
      api.get<FrontDeskStats>("/hms/front-desk/stats"),
      api.get<{ items?: Arrival[] }>("/hms/front-desk/arrivals"),
      api.get<{ items?: Departure[] }>("/hms/front-desk/departures"),
      fetchHotelRoomTypes(defaultHotelPropertyId),
    ])
      .then(([statsResponse, arrivalsResponse, departuresResponse, roomTypeResponse]) => {
        setStats(statsResponse.data);
        setArrivals(arrivalsResponse.data.items || []);
        setDepartures(departuresResponse.data.items || []);
        setRoomTypes(roomTypeResponse);
      })
      .catch((error) => {
        console.error("Failed to load front desk data", error);
      });
  }, []);

  const openMeldeschein = (guest: Arrival | Departure) => {
    setMeldescheinData(buildMeldeschein(guest));
    setMeldescheinOpen(true);
  };

  const openRechnung = (guest: Arrival | Departure) => {
    setRechnungData(buildRechnung(guest, roomRates));
    setCompanyBilling(false);
    setCompanyForm({ firma: "", strasse: "", plz_stadt: "", land: "Deutschland", ust_id: "" });
    setRechnungOpen(true);
  };

  const handlePrint = () => {
    // Apply company billing if toggled
    if (companyBilling && companyForm.firma) {
      setRechnungData(prev => ({
        ...prev,
        firma_name: companyForm.firma,
        firma_strasse: companyForm.strasse,
        firma_plz_stadt: companyForm.plz_stadt,
        firma_land: companyForm.land,
        firma_ust_id: companyForm.ust_id,
      }));
    }
    setTimeout(() => {
      const content = printRef.current;
      if (!content) return;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!DOCTYPE html><html><head><title>DAS ELB</title>
        <script src="https://cdn.tailwindcss.com"><\/script>
        <style>@media print { body { margin: 0; } @page { margin: 0; size: A4; } }</style>
        </head><body>${content.innerHTML}</body></html>`);
      win.document.close();
      setTimeout(() => { win.print(); }, 600);
    }, 100);
  };

  const handlePrintMeldeschein = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Meldeschein - DAS ELB</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>@media print { body { margin: 0; } @page { margin: 0; size: A4; } }</style>
      </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  };

  const statCards = [
    { label: "Arrivals Today", value: stats.today_arrivals, icon: CalendarCheck },
    { label: "Departures Today", value: stats.today_departures, icon: ShoppingCart },
    { label: "Occupied Rooms", value: stats.occupied, icon: PackageSearch },
    { label: "Available Rooms", value: stats.available, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl font-editorial font-bold text-foreground tracking-tight">{greeting},</h1>
          <p className="text-foreground-muted mt-2 flex items-center gap-2">
            <span className="opacity-60">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="opacity-40">&middot;</span>
            <span>All systems nominal</span>
          </p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 py-1 px-3 self-start md:self-auto">
          Command Center
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="bg-card shadow-[var(--shadow-soft)] border-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{label}</p>
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary"><Icon className="w-5 h-5" /></div>
              </div>
              <h3 className="text-4xl font-editorial font-bold text-foreground">{value}</h3>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
          <UserPlus className="w-4 h-4" /> Walk-in Check-in
        </button>
        <button className="bg-card border border-foreground/10 text-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-foreground/5 transition-colors flex items-center gap-2">
          <CalendarPlus className="w-4 h-4" /> New Reservation
        </button>
      </div>

      {/* Arrivals Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">Today&apos;s Arrivals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                <tr><th className="px-6 py-4">Guest</th><th className="px-6 py-4">Room</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Documents</th></tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {arrivals.map(a => (
                  <tr key={a.id} className="hover:bg-foreground/[0.01] transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{a.guest_name}</td>
                    <td className="px-6 py-4 font-mono text-foreground-muted">{a.room}</td>
                    <td className="px-6 py-4 text-foreground-muted text-xs">{a.room_type}</td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary" className={cn("capitalize text-[10px] font-bold tracking-wide border rounded-full", statusColors[a.status])}>{a.status.replace("-", " ")}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openMeldeschein(a)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Meldeschein"><FileText className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openRechnung(a)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Rechnung"><Receipt className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Departures Table */}
        <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
          <CardHeader className="border-b border-foreground/10 bg-foreground/[0.02] px-6 py-5">
            <CardTitle className="text-lg font-editorial text-foreground">Today&apos;s Departures</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                <tr><th className="px-6 py-4">Guest</th><th className="px-6 py-4">Room</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Documents</th></tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {departures.map(d => (
                  <tr key={d.id} className="hover:bg-foreground/[0.01] transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{d.guest_name}</td>
                    <td className="px-6 py-4 font-mono text-foreground-muted">{d.room}</td>
                    <td className="px-6 py-4 text-foreground-muted text-xs">{d.room_type}</td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary" className={cn("capitalize text-[10px] font-bold tracking-wide border rounded-full", statusColors[d.status])}>{d.status.replace("-", " ")}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openMeldeschein(d)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Meldeschein"><FileText className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openRechnung(d)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Rechnung"><Receipt className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Meldeschein Dialog */}
      <Dialog open={meldescheinOpen} onOpenChange={setMeldescheinOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-editorial flex items-center gap-2"><FileText className="w-5 h-5" /> Meldeschein / Registration Form</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2 mb-2 print:hidden">
            <button onClick={handlePrintMeldeschein} className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
              <Printer className="w-4 h-4" /> Download PDF
            </button>
          </div>
          <div ref={meldescheinOpen ? printRef : undefined} className="border border-foreground/10 rounded-lg overflow-hidden">
            <Meldeschein data={meldescheinData} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Rechnung Dialog */}
      <Dialog open={rechnungOpen} onOpenChange={setRechnungOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-editorial flex items-center gap-2"><Receipt className="w-5 h-5" /> Rechnung / Invoice</DialogTitle>
          </DialogHeader>

          {/* Company billing toggle */}
          <div className="bg-muted rounded-xl p-4 space-y-3 print:hidden">
            <label className="flex items-center gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setCompanyBilling(!companyBilling)}
                className={cn("w-12 h-6 rounded-full transition-colors relative", companyBilling ? "bg-primary" : "bg-foreground/20")}
              >
                <div className={cn("w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform", companyBilling ? "translate-x-6" : "translate-x-0.5")} />
              </button>
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-foreground-muted" />
                <span className="text-sm font-medium text-foreground">Rechnung auf Firmenadresse / Bill to company address</span>
              </div>
            </label>
            {companyBilling && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1">Firma / Company</label>
                  <input value={companyForm.firma} onChange={e => setCompanyForm(f => ({ ...f, firma: e.target.value }))} className="w-full bg-card border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" placeholder="z.B. Muster GmbH" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1">Stra{"\u00DF"}e / Street</label>
                  <input value={companyForm.strasse} onChange={e => setCompanyForm(f => ({ ...f, strasse: e.target.value }))} className="w-full bg-card border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1">PLZ / Stadt</label>
                  <input value={companyForm.plz_stadt} onChange={e => setCompanyForm(f => ({ ...f, plz_stadt: e.target.value }))} className="w-full bg-card border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1">Land / Country</label>
                  <input value={companyForm.land} onChange={e => setCompanyForm(f => ({ ...f, land: e.target.value }))} className="w-full bg-card border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1">USt-IdNr. (optional)</label>
                  <input value={companyForm.ust_id} onChange={e => setCompanyForm(f => ({ ...f, ust_id: e.target.value }))} className="w-full bg-card border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" placeholder="DE123456789" />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mb-2 print:hidden">
            <button onClick={handlePrint} className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
              <Printer className="w-4 h-4" /> Download PDF
            </button>
          </div>
          <div ref={rechnungOpen ? printRef : undefined} className="border border-foreground/10 rounded-lg overflow-hidden">
            <Rechnung data={{
              ...rechnungData,
              ...(companyBilling && companyForm.firma ? {
                firma_name: companyForm.firma,
                firma_strasse: companyForm.strasse,
                firma_plz_stadt: companyForm.plz_stadt,
                firma_land: companyForm.land,
                firma_ust_id: companyForm.ust_id,
              } : {}),
            }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
