"use client";

import api, { getJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type { HotelReportDaily, HotelReportSummary } from "@/lib/hms";

export type PmsReportType =
  | "cockpitliste"
  | "housekeepingliste"
  | "haus_status"
  | "fb_verpflegungsbericht"
  | "kassenbuch"
  | "anzahlungsliste"
  | "einnahmebericht"
  | "finanzkonten_uebersicht"
  | "offene_salden"
  | "rechnungsbericht"
  | "warengruppenjournal"
  | "belegungsuebersicht"
  | "tageszahlen"
  | "buchungsquellenbericht"
  | "kennzahlenbericht"
  | "city_tax_bericht"
  | "gobd_export"
  | "meldeschein_download"
  | "fremdenverkehrsstatistik_xml";

function filenameFromDisposition(headerValue: string | undefined, fallback: string) {
  if (!headerValue) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(headerValue);
  return match?.[1] || fallback;
}

export async function fetchPmsReportSummary(propertyId: number = defaultHotelPropertyId, days = 30) {
  return getJson<HotelReportSummary>("/hms/pms/reports/summary", {
    params: { property_id: propertyId, days },
  });
}

export async function fetchPmsReportDaily(propertyId: number = defaultHotelPropertyId, days = 30) {
  return getJson<HotelReportDaily>("/hms/pms/reports/daily", {
    params: { property_id: propertyId, days },
  });
}

export async function downloadPmsReport(
  reportType: PmsReportType,
  {
    propertyId = defaultHotelPropertyId,
    start,
    end,
  }: {
    propertyId?: number;
    start?: string;
    end?: string;
  } = {},
) {
  const response = await api.get<Blob>("/hms/pms/reports/download", {
    params: {
      type: reportType,
      property_id: propertyId,
      start,
      end,
    },
    responseType: "blob",
  });

  const contentType = response.headers["content-type"] || "application/octet-stream";
  const blob = new Blob([response.data], { type: contentType });
  const fallbackExtension = reportType === "fremdenverkehrsstatistik_xml" ? "xml" : "csv";
  const fallbackName = `${reportType}.${fallbackExtension}`;
  const filename = filenameFromDisposition(response.headers["content-disposition"], fallbackName);
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
