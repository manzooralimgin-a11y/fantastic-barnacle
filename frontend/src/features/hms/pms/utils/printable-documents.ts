"use client";

import type { RechnungPreviewData } from "@/features/hms/pms/schemas/payment";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function openPrintWindow(title: string, html: string) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");
  if (!popup) {
    throw new Error("Print window could not be opened");
  }
  popup.document.write(`<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; color: #111827; }
        h1, h2, h3 { margin: 0; }
        .muted { color: #6b7280; }
        .grid { display: grid; gap: 16px; }
        .cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
        .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { border-bottom: 1px solid #e5e7eb; padding: 10px 8px; text-align: left; font-size: 13px; }
        th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
        .totals { margin-top: 24px; width: 360px; margin-left: auto; }
        .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
        .strong { font-weight: 700; }
        .pre { white-space: pre-wrap; line-height: 1.55; }
        @media print { body { margin: 0; padding: 24px; } }
      </style>
    </head>
    <body>${html}</body>
  </html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

export function printInvoicePreview(data: RechnungPreviewData) {
  const rows = data.items
    .map(
      (item) => `
      <tr>
        <td>${item.nr}</td>
        <td>${escapeHtml(item.beschreibung)}</td>
        <td>${item.menge}</td>
        <td>${item.mwst_satz}%</td>
        <td>${item.brutto.toFixed(2)} EUR</td>
      </tr>`,
    )
    .join("");

  openPrintWindow(
    `Invoice ${data.rechnungs_nr}`,
    `
      <div class="grid">
        <div>
          <h1>${escapeHtml(data.rechnungs_nr)}</h1>
          <p class="muted">${escapeHtml(data.datum)} · Reservation ${escapeHtml(data.reservierung_nr)}</p>
        </div>
        <div class="cols">
          <div class="card"><strong>Guest</strong><div>${escapeHtml(data.gast_name)}</div></div>
          <div class="card"><strong>Room</strong><div>${escapeHtml(data.zimmer || "-")}</div></div>
          <div class="card"><strong>Stay</strong><div>${escapeHtml(data.anreise)} → ${escapeHtml(data.abreise)}</div></div>
        </div>
        <table>
          <thead>
            <tr><th>#</th><th>Description</th><th>Qty</th><th>Tax</th><th>Gross</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="totals">
          <div class="totals-row"><span>Total</span><span>${data.gesamtsumme.toFixed(2)} EUR</span></div>
          <div class="totals-row"><span>Paid</span><span>${(data.gesamtsumme - data.zahlung).toFixed(2)} EUR</span></div>
          <div class="totals-row strong"><span>Balance due</span><span>${data.zahlung.toFixed(2)} EUR</span></div>
        </div>
      </div>
    `,
  );
}

export function printTextDocument(title: string, bodyText: string) {
  openPrintWindow(
    title,
    `
      <div class="grid">
        <div>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="card pre">${escapeHtml(bodyText)}</div>
      </div>
    `,
  );
}
