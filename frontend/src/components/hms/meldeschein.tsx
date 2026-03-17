"use client";

import { forwardRef } from "react";

export interface MeldescheinData {
  anrede: string;
  titel: string;
  nachname: string;
  vorname: string;
  staatsangehoerigkeit: string;
  strasse: string;
  plz_stadt: string;
  land: string;
  geburtsdatum: string;
  geburtsort: string;
  ausweis_nr: string;
  pkw_kennzeichen: string;
  telefon: string;
  email: string;
  zahlungsart: string;
  begleiter_anzahl: number;
  begleiter_namen: string;
  anreise: string;
  abreise: string;
  reservierung_nr: string;
  zimmer: string;
  // Company billing (Rechnungsempfaenger)
  rechnungsempfaenger_firma: string;
  rechnungsempfaenger_strasse: string;
  rechnungsempfaenger_plz_stadt: string;
  rechnungsempfaenger_land: string;
}

export const emptyMeldeschein: MeldescheinData = {
  anrede: "", titel: "", nachname: "", vorname: "", staatsangehoerigkeit: "Deutsch",
  strasse: "", plz_stadt: "", land: "Deutschland", geburtsdatum: "", geburtsort: "",
  ausweis_nr: "", pkw_kennzeichen: "", telefon: "", email: "", zahlungsart: "",
  begleiter_anzahl: 0, begleiter_namen: "",
  anreise: "", abreise: "", reservierung_nr: "", zimmer: "",
  rechnungsempfaenger_firma: "", rechnungsempfaenger_strasse: "",
  rechnungsempfaenger_plz_stadt: "", rechnungsempfaenger_land: "",
};

interface Props { data: MeldescheinData }

const Meldeschein = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const formatDate = (d: string) => {
    if (!d) return "";
    try { return new Date(d).toLocaleDateString("de-DE"); } catch { return d; }
  };

  return (
    <div ref={ref} className="bg-white text-black w-[210mm] min-h-[297mm] mx-auto p-[15mm] text-[11px] leading-relaxed font-sans print:p-[12mm] print:shadow-none" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src="/das-elb-logo.png" alt="DAS ELB" className="w-14 h-auto object-contain" />
          <div>
            <h1 className="text-lg font-bold tracking-wider uppercase">DAS ELB</h1>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-base font-bold">Meldeschein / Registration form</h2>
        </div>
      </div>

      {/* Rechnungsempfaenger (Billing recipient) */}
      <div className="border border-black/30 p-3 mb-4">
        <p className="text-[9px] font-bold uppercase tracking-wider text-black/60 mb-2">Rechnungsempf{"\u00E4"}nger</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Firma / Company</span>
            <span className="font-medium">{data.rechnungsempfaenger_firma || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Stra{"\u00DF"}e / Street</span>
            <span className="font-medium">{data.rechnungsempfaenger_strasse || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">PLZ / Stadt</span>
            <span className="font-medium">{data.rechnungsempfaenger_plz_stadt || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Land / Country</span>
            <span className="font-medium">{data.rechnungsempfaenger_land || "\u00A0"}</span>
          </div>
        </div>
      </div>

      {/* Booking summary row */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="border border-black/30 p-2">
          <span className="text-[8px] text-black/50 block">Anreise / Arrival</span>
          <span className="font-bold text-sm">{formatDate(data.anreise)}</span>
        </div>
        <div className="border border-black/30 p-2">
          <span className="text-[8px] text-black/50 block">Abreise / Departure</span>
          <span className="font-bold text-sm">{formatDate(data.abreise)}</span>
        </div>
        <div className="border border-black/30 p-2">
          <span className="text-[8px] text-black/50 block">Reservierung / Reservation</span>
          <span className="font-bold text-sm"># {data.reservierung_nr}</span>
        </div>
        <div className="border border-black/30 p-2">
          <span className="text-[8px] text-black/50 block">Zimmer / Room</span>
          <span className="font-bold text-sm">{data.zimmer}</span>
        </div>
      </div>

      {/* Guest details */}
      <div className="border border-black/30 p-3 mb-4">
        <div className="grid grid-cols-4 gap-x-4 gap-y-2">
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Anrede / Salutation</span>
            <span>{data.anrede || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Titel / Title</span>
            <span>{data.titel || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Nachname / Surname</span>
            <span className="font-medium">{data.nachname || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Vorname / First name</span>
            <span className="font-medium">{data.vorname || "\u00A0"}</span>
          </div>
          <div className="col-span-2 border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Staatsangeh{"\u00F6"}rigkeit / Nationality</span>
            <span>{data.staatsangehoerigkeit || "\u00A0"}</span>
          </div>
          <div className="col-span-2 border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Stra{"\u00DF"}e, Hausnr. / Street</span>
            <span>{data.strasse || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">PLZ / Stadt</span>
            <span>{data.plz_stadt || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Land / Country</span>
            <span>{data.land || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Geburtsdatum / Date of birth</span>
            <span>{formatDate(data.geburtsdatum)}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Geburtsort / Place of birth</span>
            <span>{data.geburtsort || "\u00A0"}</span>
          </div>
        </div>
      </div>

      {/* ID & Vehicle */}
      <div className="border border-black/30 p-3 mb-4">
        <div className="grid grid-cols-3 gap-x-4 gap-y-2">
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Personalausweis-Nr. / ID-Nr.</span>
            <span>{data.ausweis_nr || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">PKW Kennzeichen (IHK / Marke)</span>
            <span>{data.pkw_kennzeichen || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Telefon / Phone</span>
            <span>{data.telefon || "\u00A0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Zahlungsart / Payment</span>
            <span>{data.zahlungsart || "\u00A0"}</span>
          </div>
          <div className="col-span-2 border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">E-Mail</span>
            <span>{data.email || "\u00A0"}</span>
          </div>
        </div>
      </div>

      {/* Begleitpersonen (Companions) */}
      <div className="border border-black/30 p-3 mb-6">
        <p className="text-[9px] font-bold uppercase tracking-wider text-black/60 mb-2">Stornierungsbedingung(en) / Cancellation policy</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Zahl der Mitreisenden / No. of companions</span>
            <span>{data.begleiter_anzahl || "0"}</span>
          </div>
          <div className="border-b border-black/20 pb-1">
            <span className="text-[8px] text-black/50 block">Begleitperson(en) / Companion(s)</span>
            <span>{data.begleiter_namen || "\u00A0"}</span>
          </div>
        </div>
      </div>

      {/* Signature */}
      <div className="border-t border-black/30 pt-4 mb-6">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="h-16 border-b border-black/30" />
            <p className="text-[9px] text-black/50 mt-1">Unterschrift / Datum &mdash; Signature / Date</p>
          </div>
          <div>
            <div className="h-16 border-b border-black/30" />
            <p className="text-[9px] text-black/50 mt-1">Hotelmitarbeiter / Hotel staff</p>
          </div>
        </div>
      </div>

      {/* Legal text */}
      <div className="text-[7px] text-black/40 leading-snug space-y-1.5">
        <p>Ich erkl{"\u00E4"}re, die als Gast/Besucher zu der als Beherbergungsst{"\u00E4"}tte dienenden R{"\u00E4"}umlichkeit nur f{"\u00FC"}r den angegebenen Zeitraum zu nutzen.</p>
        <p>Es gelten die Allgemeinen Gesch{"\u00E4"}ftsbedingungen des DAS ELB. Mit meiner Unterschrift best{"\u00E4"}tige ich, diese zur Kenntnis genommen zu haben.</p>
        <p>Datenschutz: Ihre Daten werden gem{"\u00E4"}{"\u00DF"} DSGVO verarbeitet und nur f{"\u00FC"}r die Durchf{"\u00FC"}hrung des Beherbergungsvertrags verwendet.</p>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-3 border-t border-black/20 text-[8px] text-black/40 text-center">
        <p>B. Singh Hotel GmbH & Co. KG &middot; Seilerweg 19 &middot; 39114 Magdeburg &middot; Deutschland</p>
        <p>Telefon: 0391 / 543 288 8 &middot; E-Mail: info@das-elb.de &middot; www.das-elb.de</p>
      </div>
    </div>
  );
});

Meldeschein.displayName = "Meldeschein";
export default Meldeschein;
