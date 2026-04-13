"use client";

/**
 * ReservierungModal — assembles all 5 blocks into a two-column dialog.
 *
 * Left column  (55%): RechnungsempfaengerBlock + ZimmerBlock + GaesteBlock
 * Right column (45%): RateBlock + ProdukteBlock
 *
 * The footer shows the live Gesamtpreis and the Create / Cancel actions.
 * On submit, a POST /reservations payload is built from the store and the
 * modal closes on success. The modal is globally reachable via the store's
 * open() / close() actions, so both the Belegungsplan board and the
 * Reservations list page can open it.
 */
import { useState } from "react";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReservierungStore } from "@/features/hms/pms/stores/reservierungStore";
import { createHotelReservationFromForm, emitPmsReservationsRefresh } from "@/features/hms/pms/api/reservations";
import { RechnungsempfaengerBlock } from "./blocks/RechnungsempfaengerBlock";
import { ZimmerBlock } from "./blocks/ZimmerBlock";
import { GaesteBlock } from "./blocks/GaesteBlock";
import { RateBlock } from "./blocks/RateBlock";
import { ProdukteBlock } from "./blocks/ProdukteBlock";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/lib/api";

function formatEur(amount: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function ReservierungModal() {
  const isOpen = useReservierungStore((s) => s.isOpen);
  const close = useReservierungStore((s) => s.close);

  // Form-level fields (invoice recipient info)
  const anrede = useReservierungStore((s) => s.anrede);
  const guestName = useReservierungStore((s) => s.guestName);
  const guestEmail = useReservierungStore((s) => s.guestEmail);
  const guestPhone = useReservierungStore((s) => s.guestPhone);
  const specialRequests = useReservierungStore((s) => s.specialRequests);
  const zahlungsMethode = useReservierungStore((s) => s.zahlungsMethode);
  const zahlungsStatus = useReservierungStore((s) => s.zahlungsStatus);
  const setField = useReservierungStore((s) => s.setField);

  // Derived totals
  const gesamtpreis = useReservierungStore((s) => s.gesamtpreis);
  const ratePlanTotal = useReservierungStore((s) => s.ratePlanTotal);
  const extrasTotal = useReservierungStore((s) => s.extrasTotal);
  const colorTag = useReservierungStore((s) => s.colorTag);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read snapshot for submit
  const checkIn = useReservierungStore((s) => s.checkIn);
  const checkOut = useReservierungStore((s) => s.checkOut);
  const paxAdults = useReservierungStore((s) => s.paxAdults);
  const paxChildren = useReservierungStore((s) => s.paxChildren);
  const roomTypeName = useReservierungStore((s) => s.roomTypeName);
  const roomNumber = useReservierungStore((s) => s.roomNumber);
  const propertyId = useReservierungStore((s) => s.propertyId);
  const bookingSource = useReservierungStore((s) => s.bookingSource);

  async function handleSubmit() {
    if (!guestName.trim()) {
      setError("Gastname ist erforderlich.");
      return;
    }
    if (!checkIn || !checkOut) {
      setError("An- und Abreisedatum sind erforderlich.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await createHotelReservationFromForm(
        {
          anrede,
          guest_name: guestName,
          email: guestEmail,
          phone: guestPhone,
          room_type: roomTypeName,
          room: roomNumber,
          check_in: checkIn,
          check_out: checkOut,
          adults: String(paxAdults),
          children: String(paxChildren),
          special_requests: specialRequests,
          zahlungs_methode: zahlungsMethode,
          zahlungs_status: zahlungsStatus || "offen",
        },
        propertyId,
        { color_tag: colorTag || null, booking_source: bookingSource || null },
      );

      emitPmsReservationsRefresh();
      close();
    } catch (err) {
      setError(
        getApiErrorMessage(
          err,
          "Reservierung konnte nicht gespeichert werden. Bitte Zimmer und Zeitraum prüfen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  const fieldCls =
    "w-full rounded-xl border border-foreground/10 bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-shadow";

  const labelCls = "text-[10px] font-bold uppercase tracking-widest text-foreground-muted mb-1.5 block";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent
        className={cn(
          "max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0",
          "rounded-2xl border border-foreground/10 bg-card shadow-xl",
        )}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-foreground/10 bg-foreground/[0.02]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Color tag indicator */}
              {colorTag && (
                <span
                  className="h-4 w-4 rounded-full border-2 border-foreground/20 flex-shrink-0"
                  style={{ background: colorTag }}
                />
              )}
              <DialogTitle className="text-lg font-editorial font-bold text-foreground">
                Neue Reservierung
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {/* ── Body (scrollable) ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[55%_45%] divide-x divide-foreground/10">

            {/* ── Left column ─────────────────────────────────────────────── */}
            <div className="space-y-4 p-5">

              {/* Guest info (name, anrede) */}
              <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                  Gast
                </h3>
                <div className="grid grid-cols-[120px_1fr] gap-3">
                  <div>
                    <label className={labelCls}>Anrede</label>
                    <select
                      value={anrede}
                      onChange={(e) => setField("anrede", e.target.value)}
                      className={fieldCls}
                    >
                      <option value="">—</option>
                      <option value="Herr">Herr</option>
                      <option value="Frau">Frau</option>
                      <option value="Herr Dr.">Herr Dr.</option>
                      <option value="Frau Dr.">Frau Dr.</option>
                      <option value="Divers">Divers</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Name *</label>
                    <input
                      value={guestName}
                      onChange={(e) => setField("guestName", e.target.value)}
                      placeholder="Vor- und Nachname"
                      className={fieldCls}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>E-Mail</label>
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setField("guestEmail", e.target.value)}
                      placeholder="gast@example.com"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Telefon</label>
                    <input
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setField("guestPhone", e.target.value)}
                      placeholder="+49 …"
                      className={fieldCls}
                    />
                  </div>
                </div>
              </section>

              {/* Rechnungsempfänger */}
              <RechnungsempfaengerBlock />

              {/* Zimmer */}
              <ZimmerBlock />

              {/* Gäste */}
              <GaesteBlock />

              {/* Special requests */}
              <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                  Besondere Wünsche
                </h3>
                <textarea
                  rows={2}
                  value={specialRequests}
                  onChange={(e) => setField("specialRequests", e.target.value)}
                  placeholder="Allergien, Anreisezeit, Sonderwünsche…"
                  className={cn(fieldCls, "resize-none")}
                />
              </section>
            </div>

            {/* ── Right column ─────────────────────────────────────────────── */}
            <div className="space-y-4 p-5">

              {/* Rate plans */}
              <RateBlock />

              {/* Extras / Produkte */}
              <ProdukteBlock />

              {/* Payment method */}
              <section className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                  Zahlung
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Zahlungsart</label>
                    <select
                      value={zahlungsMethode}
                      onChange={(e) => setField("zahlungsMethode", e.target.value)}
                      className={fieldCls}
                    >
                      <option value="">— Wählen —</option>
                      <option value="Bar">Bar</option>
                      <option value="EC-Karte">EC-Karte</option>
                      <option value="Kreditkarte">Kreditkarte</option>
                      <option value="Überweisung">Überweisung</option>
                      <option value="OTA">OTA</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Zahlungsstatus</label>
                    <select
                      value={zahlungsStatus}
                      onChange={(e) => setField("zahlungsStatus", e.target.value)}
                      className={fieldCls}
                    >
                      <option value="offen">Offen</option>
                      <option value="teilbezahlt">Teilbezahlt</option>
                      <option value="komplett bezahlt">Komplett bezahlt</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* Gesamtpreis summary */}
              <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">
                  Gesamtpreis
                </h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-foreground-muted">
                    <span>Zimmerrate</span>
                    <span className="font-mono">{formatEur(ratePlanTotal)}</span>
                  </div>
                  <div className="flex justify-between text-foreground-muted">
                    <span>Extras</span>
                    <span className="font-mono">{formatEur(extrasTotal())}</span>
                  </div>
                  <div className="h-px bg-foreground/10" />
                  <div className="flex justify-between">
                    <span className="font-semibold text-foreground">Total</span>
                    <span className="font-mono font-bold text-lg text-foreground">
                      {formatEur(gesamtpreis())}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-foreground/10 bg-foreground/[0.02] px-6 py-4">
          {error && (
            <p className="mb-3 rounded-xl border border-status-danger/30 bg-status-danger/10 px-4 py-2 text-sm text-status-danger">
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground-muted hover:bg-foreground/[0.04] transition-colors disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Speichern…" : "Reservierung anlegen"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
