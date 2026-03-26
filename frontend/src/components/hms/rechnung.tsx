"use client";

import { forwardRef } from "react";

export interface RechnungItem {
  nr: number;
  datum_von: string;
  datum_bis: string;
  beschreibung: string;
  menge: number;
  netto: number;
  mwst_satz: number; // 7 or 19
  mwst: number;
  brutto: number;
}

export type ZahlungsMethode = "bar" | "kartenzahlung" | "booking.com" | "expedia" | "ueberweisung" | "";
export type ZahlungsStatus = "bezahlt" | "offen" | "teilweise";

export interface RechnungData {
  rechnungs_nr: string;
  folio: string;
  reservierung_nr: string;
  datum: string; // invoice date
  // Guest address
  gast_name: string;
  gast_anrede: string; // Herr, Frau, Dr., etc.
  gast_strasse: string;
  gast_plz_stadt: string;
  gast_land: string;
  // Company billing address (optional - for Firmenadresse)
  firma_name: string;
  firma_strasse: string;
  firma_plz_stadt: string;
  firma_land: string;
  firma_ust_id: string; // USt-IdNr for company
  // Stay details
  zimmer: string;
  zimmer_typ: string;
  anreise: string;
  abreise: string;
  // Items
  items: RechnungItem[];
  // Totals
  netto_7: number;
  mwst_7: number;
  netto_19: number;
  mwst_19: number;
  gesamtsumme: number;
  kurtaxe: number;
  anzahlung: number; // deposit (e.g. Booking.de)
  anzahlung_label: string;
  zahlung: number; // final payment
  // Payment info
  zahlungs_methode: ZahlungsMethode;
  zahlungs_status: ZahlungsStatus;
  zahlungs_datum: string; // date payment received
}

export const emptyRechnung: RechnungData = {
  rechnungs_nr: "", folio: "", reservierung_nr: "", datum: new Date().toISOString().slice(0, 10),
  gast_name: "", gast_anrede: "", gast_strasse: "", gast_plz_stadt: "", gast_land: "Deutschland",
  firma_name: "", firma_strasse: "", firma_plz_stadt: "", firma_land: "", firma_ust_id: "",
  zimmer: "", zimmer_typ: "", anreise: "", abreise: "",
  items: [], netto_7: 0, mwst_7: 0, netto_19: 0, mwst_19: 0,
  gesamtsumme: 0, kurtaxe: 0, anzahlung: 0, anzahlung_label: "", zahlung: 0,
  zahlungs_methode: "", zahlungs_status: "offen", zahlungs_datum: "",
};

interface Props { data: RechnungData }

const Rechnung = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const fmtDate = (d: string) => {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
  };
  const fmtEur = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20AC";

  const guestDisplayName = data.gast_anrede ? `${data.gast_anrede} ${data.gast_name}` : data.gast_name;
  const billingAddress = data.firma_name
    ? { name: data.firma_name, extra: guestDisplayName, strasse: data.firma_strasse, plz_stadt: data.firma_plz_stadt, land: data.firma_land }
    : { name: guestDisplayName, extra: "", strasse: data.gast_strasse, plz_stadt: data.gast_plz_stadt, land: data.gast_land };

  const zahlungsMethodeLabel: Record<string, string> = {
    "bar": "Barzahlung",
    "kartenzahlung": "Kartenzahlung (EC/Kreditkarte)",
    "booking.com": "Booking.com (Online-Zahlung)",
    "expedia": "Expedia (Online-Zahlung)",
    "ueberweisung": "\u00DCberweisung",
  };
  const zahlungsStatusLabel: Record<string, { text: string; color: string }> = {
    "bezahlt": { text: "BEZAHLT", color: "text-green-700 bg-green-50 border-green-200" },
    "offen": { text: "OFFEN", color: "text-red-700 bg-red-50 border-red-200" },
    "teilweise": { text: "TEILWEISE BEZAHLT", color: "text-amber-700 bg-amber-50 border-amber-200" },
  };

  return (
    <div ref={ref} className="bg-white text-black w-[210mm] min-h-[297mm] mx-auto p-[15mm] text-[10px] leading-relaxed font-sans print:p-[12mm] print:shadow-none" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {/* Header with logo and hotel contact */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/das-elb-logo.png" alt="DAS ELB" className="w-14 h-auto object-contain" />
          <div>
            <h1 className="text-lg font-bold tracking-wider uppercase">DAS ELB</h1>
            <p className="text-[8px] text-black/50">Boutiquehotel | Hotel | Apartments</p>
          </div>
        </div>
        <div className="text-right text-[8px] text-black/50 leading-snug">
          <p className="font-bold text-black text-[9px]">39114 Magdeburg</p>
          <p>Seilerweg 19</p>
          <p>DEUTSCHLAND</p>
          <p className="mt-2">Telefon: 0391 / 543 288 8</p>
          <p>Steuernummer: 102/113/00839</p>
          <p>Gerichtsstand: Magdeburg</p>
          <p className="mt-2">Gesch{"\u00E4"}ftsf{"\u00FC"}hrung: Bhupinder Singh</p>
          <p>E-Mail: info@das-elb.de</p>
          <p>www.das-elb.de</p>
        </div>
      </div>

      {/* Sender line (small) */}
      <p className="text-[7px] text-black/40 border-b border-black/20 pb-0.5 mb-3">
        das e.l.b. &middot; Boutiquehotel, Hotel, Apartments, Seilerweg 19, 39114 Magdeburg
      </p>

      {/* Billing address */}
      <div className="mb-4">
        <p className="font-medium text-[11px]">{billingAddress.name}</p>
        {billingAddress.extra && <p className="text-[9px] text-black/60">{billingAddress.extra}</p>}
        {billingAddress.strasse && <p>{billingAddress.strasse}</p>}
        {billingAddress.plz_stadt && <p>{billingAddress.plz_stadt}</p>}
        {billingAddress.land && billingAddress.land !== "Deutschland" && <p>{billingAddress.land}</p>}
        {data.firma_name && data.firma_ust_id && (
          <p className="text-[9px] text-black/60 mt-1">USt-IdNr.: {data.firma_ust_id}</p>
        )}
      </div>

      {/* Invoice date */}
      <div className="flex justify-between items-start mb-2">
        <div>
          <p className="text-[9px] text-black/50">Wir bitten Sie Ihren Betrag an &quot;Das ELB&quot; zu {"\u00FC"}berweisen.</p>
          <p className="text-[9px] text-black/50">F{"\u00FC"}r Fragen stehen wir Ihnen zur Verf{"\u00FC"}gung.</p>
        </div>
        <p className="text-[11px] font-medium">{fmtDate(data.datum)}</p>
      </div>

      {/* Invoice info */}
      <div className="bg-black/5 px-3 py-2 mb-4 text-[10px]">
        <div className="flex gap-6">
          <span><strong>Rechnung Info-Folio:</strong> {data.folio || data.rechnungs_nr}</span>
        </div>
        <p className="text-[9px] text-black/60 mt-1">
          Vielen Dank f{"\u00FC"}r Ihren Aufenthalt bei uns. Gast: {data.gast_name} &middot; Buchungszeitraum: {fmtDate(data.anreise)} &ndash; {fmtDate(data.abreise)} &middot; Zimmer: {data.zimmer} ({data.zimmer_typ})
        </p>
      </div>

      {/* Items table */}
      <table className="w-full text-[9px] border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-black/30 text-[8px] uppercase tracking-wider text-black/60">
            <th className="text-left py-2 pr-2">Nr.</th>
            <th className="text-left py-2 pr-2">Datum</th>
            <th className="text-left py-2 pr-2">Beschreibung</th>
            <th className="text-right py-2 pr-2">Menge</th>
            <th className="text-right py-2 pr-2">Netto</th>
            <th className="text-right py-2 pr-2">MwSt %</th>
            <th className="text-right py-2 pr-2">MwSt</th>
            <th className="text-right py-2">Brutto</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, i) => (
            <tr key={i} className="border-b border-black/10">
              <td className="py-1.5 pr-2">{item.nr}</td>
              <td className="py-1.5 pr-2">{fmtDate(item.datum_von)}{item.datum_bis && item.datum_bis !== item.datum_von ? ` \u2013 ${fmtDate(item.datum_bis)}` : ""}</td>
              <td className="py-1.5 pr-2">{item.beschreibung}</td>
              <td className="py-1.5 pr-2 text-right">{item.menge}</td>
              <td className="py-1.5 pr-2 text-right">{fmtEur(item.netto)}</td>
              <td className="py-1.5 pr-2 text-right">{item.mwst_satz} %</td>
              <td className="py-1.5 pr-2 text-right">{fmtEur(item.mwst)}</td>
              <td className="py-1.5 text-right font-medium">{fmtEur(item.brutto)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end mb-4">
        <div className="w-72 space-y-1 text-[10px]">
          <div className="flex justify-between border-b border-black/10 pb-1">
            <span className="text-black/60">Gesamtsumme</span>
            <span className="font-bold text-[12px]">{fmtEur(data.gesamtsumme)}</span>
          </div>
          {data.kurtaxe > 0 && (
            <div className="flex justify-between text-black/60">
              <span>Kurtaxbeitrag</span>
              <span>{fmtEur(data.kurtaxe)}</span>
            </div>
          )}
          {data.anzahlung > 0 && (
            <div className="flex justify-between text-black/60">
              <span>{data.anzahlung_label || "Anzahlung"}</span>
              <span>-{fmtEur(data.anzahlung)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold pt-1 border-t border-black/30">
            <span>Zahlung</span>
            <span>{fmtEur(data.zahlung)}</span>
          </div>
        </div>
      </div>

      {/* Zahlungseingang / Payment Status */}
      <div className="mb-4 border border-black/20 p-3">
        <p className="text-[8px] font-bold uppercase tracking-wider text-black/50 mb-2">Zahlungseingang / Payment</p>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 text-[10px]">
            {data.zahlungs_methode && (
              <div className="flex gap-2">
                <span className="text-black/50">Zahlungsart:</span>
                <span className="font-medium">{zahlungsMethodeLabel[data.zahlungs_methode] || data.zahlungs_methode}</span>
              </div>
            )}
            {data.zahlungs_datum && (
              <div className="flex gap-2">
                <span className="text-black/50">Zahlungsdatum:</span>
                <span className="font-medium">{fmtDate(data.zahlungs_datum)}</span>
              </div>
            )}
            {!data.zahlungs_methode && !data.zahlungs_datum && data.zahlungs_status === "offen" && (
              <p className="text-black/50">Zahlung ausstehend. Bitte {"\u00FC"}berweisen Sie den Betrag an &quot;Das ELB&quot;.</p>
            )}
          </div>
          <div className={`px-3 py-1.5 border rounded text-[10px] font-bold tracking-wider ${zahlungsStatusLabel[data.zahlungs_status]?.color || "text-black/60 bg-black/5 border-black/20"}`}>
            {zahlungsStatusLabel[data.zahlungs_status]?.text || "OFFEN"}
          </div>
        </div>
      </div>

      {/* Tax breakdown */}
      <div className="mb-6">
        <p className="text-[8px] font-bold uppercase tracking-wider text-black/50 mb-1">MwSt.-{"\u00DC"}bersicht</p>
        <table className="text-[9px] border-collapse">
          <thead>
            <tr className="text-[8px] text-black/50 border-b border-black/20">
              <th className="text-left pr-6 py-1">MwSt %</th>
              <th className="text-right pr-6 py-1">Netto</th>
              <th className="text-right pr-6 py-1">MwSt</th>
              <th className="text-right py-1">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {data.netto_7 > 0 && (
              <tr className="border-b border-black/10">
                <td className="pr-6 py-1">7 %</td>
                <td className="text-right pr-6 py-1">{fmtEur(data.netto_7)}</td>
                <td className="text-right pr-6 py-1">{fmtEur(data.mwst_7)}</td>
                <td className="text-right py-1">{fmtEur(data.netto_7 + data.mwst_7)}</td>
              </tr>
            )}
            {data.netto_19 > 0 && (
              <tr className="border-b border-black/10">
                <td className="pr-6 py-1">19 %</td>
                <td className="text-right pr-6 py-1">{fmtEur(data.netto_19)}</td>
                <td className="text-right pr-6 py-1">{fmtEur(data.mwst_19)}</td>
                <td className="text-right py-1">{fmtEur(data.netto_19 + data.mwst_19)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Farewell */}
      <div className="text-[9px] text-black/60 mb-6">
        <p>Wir freuen uns auf ein Wiedersehen und verbinden mit den besten W{"\u00FC"}nschen.</p>
        <p>Ihr Team von &quot;Das ELB&quot; Boutiquehotel | Hotel | Apartments</p>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-black/20 text-[7px] text-black/40 text-center leading-snug">
        <p>B. Singh Hotel GmbH & Co. KG &middot; Seilerweg 19 &middot; 39114 Magdeburg &middot; Deutschland</p>
        <p>Telefon: 0391 / 543 288 8 &middot; Steuernummer: 102/113/00839 &middot; E-Mail: info@das-elb.de &middot; www.das-elb.de</p>
        <p>Bankverbindung: Deutsche Bank &middot; IBAN: DE88 8107 0024 0116 1300 00 &middot; BIC: DEUTDEDBMD</p>
      </div>
    </div>
  );
});

Rechnung.displayName = "Rechnung";
export default Rechnung;
