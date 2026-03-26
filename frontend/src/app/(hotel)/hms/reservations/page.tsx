"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarPlus, Search, Edit, X, FileText, Receipt, Printer, Building2 } from "lucide-react";
import api from "@/lib/api";
import {
  buildRoomRateMap,
  defaultHotelPropertyId,
  defaultRoomTypeName,
  fetchHotelRoomTypes,
  type HotelRoomTypeOption,
} from "@/lib/hotel-room-types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/websocket";
import Meldeschein, { MeldescheinData, emptyMeldeschein } from "@/components/hms/meldeschein";
import Rechnung, { RechnungData, RechnungItem, emptyRechnung, ZahlungsMethode, ZahlungsStatus } from "@/components/hms/rechnung";

type Reservation = {
  id: string; anrede: string; guest_name: string; email: string; phone: string; room_type: string;
  check_in: string; check_out: string; nights: number; adults: number; children: number;
  status: "confirmed" | "checked-in" | "checked-out" | "cancelled"; special_requests: string;
  room: string; zahlungs_methode: string; zahlungs_status: string;
};

const statusColors: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-transparent",
  "checked-in": "bg-emerald-500/10 text-emerald-600 border-transparent",
  "checked-out": "bg-foreground/10 text-foreground-muted border-transparent",
  cancelled: "bg-red-500/10 text-red-600 border-transparent",
};

const tabs = ["Upcoming", "Today", "Past", "Cancelled"] as const;
const emptyForm = { anrede: "", guest_name: "", email: "", phone: "", room_type: "", check_in: "", check_out: "", adults: "1", children: "0", special_requests: "", zahlungs_methode: "", zahlungs_status: "offen" };

function buildMeldeschein(r: Reservation): MeldescheinData {
  return { ...emptyMeldeschein, anrede: r.anrede || "", nachname: r.guest_name.split(" ").slice(-1)[0], vorname: r.guest_name.split(" ").slice(0, -1).join(" "), anreise: r.check_in, abreise: r.check_out, reservierung_nr: r.id.replace("R-", ""), zimmer: r.room, email: r.email, telefon: r.phone };
}

function buildRechnung(r: Reservation, roomRates: Record<string, number>): RechnungData {
  const nights = r.nights || Math.max(1, Math.ceil((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 86400000));
  const rate = roomRates[r.room_type] || 89;
  const netto7 = +(rate * nights / 1.07).toFixed(2);
  const mwst7 = +(rate * nights - netto7).toFixed(2);
  const kurtaxe = +(nights * 2.5).toFixed(2);
  const items: RechnungItem[] = [];
  const startDate = new Date(r.check_in);
  for (let i = 0; i < nights; i++) {
    const d = new Date(startDate); d.setDate(d.getDate() + i);
    const dEnd = new Date(d); dEnd.setDate(dEnd.getDate() + 1);
    const itemNetto = +(rate / 1.07).toFixed(2);
    const itemMwst = +(rate - itemNetto).toFixed(2);
    items.push({ nr: i + 1, datum_von: d.toISOString().slice(0, 10), datum_bis: dEnd.toISOString().slice(0, 10), beschreibung: `${r.room_type} - Zimmer ${r.room}`, menge: 1, netto: itemNetto, mwst_satz: 7, mwst: itemMwst, brutto: rate });
  }
  const kurtaxeNetto = +(kurtaxe / 1.19).toFixed(2);
  const kurtaxeMwst = +(kurtaxe - kurtaxeNetto).toFixed(2);
  items.push({ nr: nights + 1, datum_von: r.check_in, datum_bis: r.check_out, beschreibung: "Kurtaxe / City tax", menge: nights, netto: kurtaxeNetto, mwst_satz: 19, mwst: kurtaxeMwst, brutto: kurtaxe });
  const gesamt = rate * nights + kurtaxe;
  return {
    ...emptyRechnung, rechnungs_nr: `RE-${r.id.replace("R-", "")}`, folio: `${r.id.replace("R-", "")}-1`,
    reservierung_nr: r.id.replace("R-", ""), datum: new Date().toISOString().slice(0, 10),
    gast_name: r.guest_name, gast_anrede: r.anrede || "", gast_strasse: "", gast_plz_stadt: "", gast_land: "Deutschland",
    zimmer: r.room, zimmer_typ: r.room_type, anreise: r.check_in, abreise: r.check_out,
    items, netto_7: netto7, mwst_7: mwst7, netto_19: kurtaxeNetto, mwst_19: kurtaxeMwst,
    gesamtsumme: gesamt, kurtaxe, anzahlung: 0, anzahlung_label: "", zahlung: gesamt,
    zahlungs_methode: (r.zahlungs_methode || "") as ZahlungsMethode,
    zahlungs_status: (r.zahlungs_status || "offen") as ZahlungsStatus,
    zahlungs_datum: r.zahlungs_status === "bezahlt" ? r.check_out : "",
  };
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [roomTypes, setRoomTypes] = useState<HotelRoomTypeOption[]>([]);
  const [activeTab, setActiveTab] = useState<string>("Upcoming");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  // Document dialogs
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
      api.get("/hms/reservations"),
      fetchHotelRoomTypes(defaultHotelPropertyId),
    ])
      .then(([reservationResponse, roomTypeResponse]) => {
        setReservations(reservationResponse.data.items || reservationResponse.data || []);
        setRoomTypes(roomTypeResponse);
      })
      .catch((error) => {
        console.error("Failed to load hotel reservations", error);
      });
  }, []);

  useEffect(() => {
    if (!editId && !form.room_type && roomTypes.length > 0) {
      setForm((current) => ({ ...current, room_type: defaultRoomTypeName(roomTypes) }));
    }
  }, [editId, form.room_type, roomTypes]);

  useWebSocket("NEW_HOTEL_BOOKING", (data) => {
    console.log("New hotel booking:", data);
    api.get("/hms/reservations").then(r => setReservations(r.data.items || r.data || [])).catch(() => {});
  });

  const filtered = reservations.filter(r => {
    const matchesSearch = !search || r.guest_name.toLowerCase().includes(search.toLowerCase()) || r.id.toLowerCase().includes(search.toLowerCase());
    if (activeTab === "Cancelled") return r.status === "cancelled" && matchesSearch;
    if (activeTab === "Today") return r.check_in === new Date().toISOString().slice(0, 10) && r.status !== "cancelled" && matchesSearch;
    if (activeTab === "Past") return (r.status === "checked-out") && matchesSearch;
    return (r.status === "confirmed" || r.status === "checked-in") && matchesSearch;
  });

  const openNew = () => {
    setEditId(null);
    setForm({ ...emptyForm, room_type: defaultRoomTypeName(roomTypes) });
    setDialogOpen(true);
  };

  const openEdit = (r: Reservation) => {
    setEditId(r.id);
    setForm({ anrede: r.anrede || "", guest_name: r.guest_name, email: r.email, phone: r.phone, room_type: r.room_type, check_in: r.check_in, check_out: r.check_out, adults: String(r.adults), children: String(r.children), special_requests: r.special_requests, zahlungs_methode: r.zahlungs_methode || "", zahlungs_status: r.zahlungs_status || "offen" });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const nights = Math.max(1, Math.ceil((new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86400000));
    const payload = { ...form, adults: Number(form.adults), children: Number(form.children), nights, anrede: form.anrede, zahlungs_methode: form.zahlungs_methode, zahlungs_status: form.zahlungs_status };
    try {
      if (editId) {
        const response = await api.put<Reservation>(`/hms/reservations/${editId}`, payload);
        setReservations(prev => prev.map(r => r.id === editId ? response.data : r));
      } else {
        const canonicalPayload = {
          kind: "hotel",
          property_id: defaultHotelPropertyId,
          guest_name: form.guest_name,
          guest_email: form.email,
          phone: form.phone,
          anrede: form.anrede,
          room_type_label: form.room_type || defaultRoomTypeName(roomTypes),
          check_in: form.check_in,
          check_out: form.check_out,
          adults: Number(form.adults),
          children: Number(form.children),
          special_requests: form.special_requests,
          zahlungs_methode: form.zahlungs_methode,
          zahlungs_status: form.zahlungs_status || "offen",
          status: "confirmed",
          booking_id_prefix: "BK",
        };
        const response = await api.post<Reservation>("/reservations", canonicalPayload);
        setReservations(prev => [response.data, ...prev]);
      }
    } catch (error) {
      console.error("Failed to save hotel reservation", error);
    } finally {
      setSaving(false);
      setDialogOpen(false);
    }
  };

  const handleCancel = (id: string) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status: "cancelled" as const } : r));
    api.patch(`/hms/reservations/${id}`, { status: "cancelled" }).catch(() => {});
  };

  const openMeldeschein = (r: Reservation) => { setMeldescheinData(buildMeldeschein(r)); setMeldescheinOpen(true); };
  const openRechnung = (r: Reservation) => {
    setRechnungData(buildRechnung(r, roomRates));
    setCompanyBilling(false);
    setCompanyForm({ firma: "", strasse: "", plz_stadt: "", land: "Deutschland", ust_id: "" });
    setRechnungOpen(true);
  };

  const handlePrintDoc = () => {
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
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-editorial font-bold text-foreground tracking-tight">Reservations</h1>
          <p className="text-foreground-muted mt-1">Manage hotel room bookings</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <button onClick={openNew} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start">
              <CalendarPlus className="w-4 h-4" /> New Reservation
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-editorial">{editId ? "Edit Reservation" : "New Reservation"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Anrede / Title</label>
                  <select value={form.anrede} onChange={e => setForm(f => ({ ...f, anrede: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="">-- Bitte w{"\u00E4"}hlen --</option>
                    <option value="Herr">Herr</option>
                    <option value="Frau">Frau</option>
                    <option value="Herr Dr.">Herr Dr.</option>
                    <option value="Frau Dr.">Frau Dr.</option>
                    <option value="Herr Prof.">Herr Prof.</option>
                    <option value="Frau Prof.">Frau Prof.</option>
                    <option value="Herr Prof. Dr.">Herr Prof. Dr.</option>
                    <option value="Frau Prof. Dr.">Frau Prof. Dr.</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Guest Name</label>
                  <input required value={form.guest_name} onChange={e => setForm(f => ({ ...f, guest_name: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Email</label>
                  <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Phone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Room Type</label>
                  <select value={form.room_type} onChange={e => setForm(f => ({ ...f, room_type: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                    {roomTypes.map((roomType) => (
                      <option key={roomType.id} value={roomType.name}>{roomType.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Check-in</label>
                  <input type="date" required value={form.check_in} onChange={e => setForm(f => ({ ...f, check_in: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Check-out</label>
                  <input type="date" required value={form.check_out} onChange={e => setForm(f => ({ ...f, check_out: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Adults</label>
                  <input type="number" min="1" max="10" value={form.adults} onChange={e => setForm(f => ({ ...f, adults: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Children</label>
                  <input type="number" min="0" max="10" value={form.children} onChange={e => setForm(f => ({ ...f, children: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Special Requests</label>
                  <textarea value={form.special_requests} onChange={e => setForm(f => ({ ...f, special_requests: e.target.value }))} rows={2} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Zahlungsart / Payment</label>
                  <select value={form.zahlungs_methode} onChange={e => setForm(f => ({ ...f, zahlungs_methode: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="">-- Noch offen --</option>
                    <option value="bar">Barzahlung</option>
                    <option value="kartenzahlung">Kartenzahlung (EC/Kreditkarte)</option>
                    <option value="booking.com">Booking.com</option>
                    <option value="expedia">Expedia</option>
                    <option value="ueberweisung">{"\u00DC"}berweisung</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground-muted uppercase tracking-wider block mb-1.5">Zahlungsstatus</label>
                  <select value={form.zahlungs_status} onChange={e => setForm(f => ({ ...f, zahlungs_status: e.target.value }))} className="w-full bg-muted rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="offen">Offen</option>
                    <option value="bezahlt">Bezahlt</option>
                    <option value="teilweise">Teilweise bezahlt</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setDialogOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/5 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? "Saving..." : editId ? "Update" : "Create Reservation"}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex bg-card rounded-xl p-1 border border-foreground/10">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors", activeTab === tab ? "bg-primary text-primary-foreground" : "text-foreground-muted hover:text-foreground")}>
              {tab}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guests..." className="w-full bg-card border border-foreground/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
      </div>

      <Card className="bg-card shadow-[var(--shadow-soft)] border-none overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-foreground-muted font-bold bg-foreground/[0.01]">
                <tr>
                  <th className="px-6 py-4">ID</th><th className="px-6 py-4">Guest</th><th className="px-6 py-4">Room Type</th>
                  <th className="px-6 py-4">Check-in</th><th className="px-6 py-4">Check-out</th><th className="px-6 py-4">Nights</th>
                  <th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/10">
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-foreground-muted">No reservations found</td></tr>
                )}
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-foreground/[0.01] transition-colors">
                    <td className="px-6 py-4 font-mono text-foreground-muted text-xs">{r.id}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-foreground">{r.anrede ? `${r.anrede} ` : ""}{r.guest_name}</div>
                      <div className="text-xs text-foreground-muted">{r.email}</div>
                    </td>
                    <td className="px-6 py-4 text-foreground-muted">{r.room_type}</td>
                    <td className="px-6 py-4 text-foreground-muted">{new Date(r.check_in).toLocaleDateString("de-DE")}</td>
                    <td className="px-6 py-4 text-foreground-muted">{new Date(r.check_out).toLocaleDateString("de-DE")}</td>
                    <td className="px-6 py-4 text-foreground-muted">{r.nights}</td>
                    <td className="px-6 py-4">
                      <Badge variant="secondary" className={cn("capitalize text-[10px] font-bold tracking-wide border rounded-full", statusColors[r.status])}>{r.status.replace("-", " ")}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openMeldeschein(r)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Meldeschein"><FileText className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openRechnung(r)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Rechnung"><Receipt className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground-muted hover:text-foreground transition-colors" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
                        {r.status !== "cancelled" && r.status !== "checked-out" && (
                          <button onClick={() => handleCancel(r.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-foreground-muted hover:text-red-600 transition-colors" title="Cancel"><X className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Meldeschein Dialog */}
      <Dialog open={meldescheinOpen} onOpenChange={setMeldescheinOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-editorial flex items-center gap-2"><FileText className="w-5 h-5" /> Meldeschein / Registration Form</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2 mb-2 print:hidden">
            <button onClick={handlePrintDoc} className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
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
          <div className="bg-muted rounded-xl p-4 space-y-3 print:hidden">
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setCompanyBilling(!companyBilling)} className={cn("w-12 h-6 rounded-full transition-colors relative", companyBilling ? "bg-primary" : "bg-foreground/20")}>
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
            <button onClick={handlePrintDoc} className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
              <Printer className="w-4 h-4" /> Download PDF
            </button>
          </div>
          <div ref={rechnungOpen ? printRef : undefined} className="border border-foreground/10 rounded-lg overflow-hidden">
            <Rechnung data={{
              ...rechnungData,
              ...(companyBilling && companyForm.firma ? {
                firma_name: companyForm.firma, firma_strasse: companyForm.strasse,
                firma_plz_stadt: companyForm.plz_stadt, firma_land: companyForm.land,
                firma_ust_id: companyForm.ust_id,
              } : {}),
            }} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
