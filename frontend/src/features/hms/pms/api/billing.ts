"use client";

import { getJson, postJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type {
  PmsCashMaster,
  PmsFolio,
  PmsInvoice,
  PmsInvoiceDetail,
  PmsInvoicePreview,
} from "@/features/hms/pms/schemas/payment";

export async function fetchPmsFolios(
  propertyId: number = defaultHotelPropertyId,
  status?: string,
) {
  return getJson<PmsFolio[]>("/hms/pms/billing/folios", {
    params: { property_id: propertyId, status },
  });
}

export async function fetchPmsCashMaster(params: {
  property_id?: number;
  search?: string;
  invoice_status?: string;
  payment_status?: string;
  payment_method?: string;
  room?: string;
  guest_company?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_dir?: string;
} = {}) {
  return getJson<PmsCashMaster>("/hms/pms/billing/cash-master", {
    params: {
      property_id: params.property_id ?? defaultHotelPropertyId,
      ...params,
    },
  });
}

export async function fetchPmsReservationFolios(
  reservationId: number | string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsFolio[]>(`/hms/pms/billing/reservations/${reservationId}/folios`, {
    params: { property_id: propertyId },
  });
}

export async function fetchPmsFolio(
  folioId: number | string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsFolio>(`/hms/pms/billing/folios/${folioId}`, {
    params: { property_id: propertyId },
  });
}

export async function createPmsReservationCharge(
  reservationId: number | string,
  payload: {
    description: string;
    quantity: number;
    unit_price: number;
    service_date?: string | null;
    charge_type?: string;
    metadata_json?: Record<string, unknown> | null;
  },
) {
  return postJson<PmsFolio>(`/hms/pms/reservations/${reservationId}/charges`, payload);
}

export async function voidPmsFolioLine(
  folioId: number | string,
  lineId: number | string,
) {
  return postJson<PmsFolio>(`/hms/folios/${folioId}/lines/${lineId}/void`);
}

export async function createPmsFolioPayment(
  folioId: number | string,
  payload: {
    amount: number;
    method: string;
    reference?: string | null;
    processing_fee?: number;
    gateway_reference?: string | null;
    card_last_four?: string | null;
    card_brand?: string | null;
    wallet_type?: string | null;
  },
) {
  return postJson<PmsFolio>(`/hms/folios/${folioId}/payments`, payload);
}

export async function fetchPmsReservationInvoices(
  reservationId: number | string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsInvoice[]>(`/hms/pms/billing/reservations/${reservationId}/invoices`, {
    params: { property_id: propertyId },
  });
}

export async function ensurePmsReservationInvoice(
  reservationId: number | string,
) {
  return postJson<PmsInvoice>(`/hms/pms/billing/reservations/${reservationId}/invoices/ensure`);
}

export async function fetchPmsInvoice(
  invoiceId: number | string,
) {
  return getJson<PmsInvoice>(`/hms/pms/billing/invoices/${invoiceId}`);
}

export async function fetchPmsInvoiceDetail(
  invoiceId: number | string,
) {
  return getJson<PmsInvoiceDetail>(`/hms/pms/billing/invoices/${invoiceId}/detail`);
}

export async function fetchPmsInvoicePreview(
  invoiceId: number | string,
) {
  return getJson<PmsInvoicePreview>(`/hms/pms/billing/invoices/${invoiceId}/preview`);
}

export async function sendPmsInvoice(
  invoiceId: number | string,
  payload: {
    channel: "email" | "pdf";
    recipient_email?: string | null;
    subject?: string | null;
    message?: string | null;
  },
) {
  return postJson<PmsInvoice>(`/hms/pms/billing/invoices/${invoiceId}/send`, payload);
}

export async function finalizePmsInvoice(
  invoiceId: number | string,
) {
  return postJson<PmsInvoiceDetail>(`/hms/pms/billing/invoices/${invoiceId}/finalize`);
}

export async function createPmsInvoicePayment(
  invoiceId: number | string,
  payload: {
    amount: number;
    method: string;
    reference?: string | null;
    processing_fee?: number;
    gateway_reference?: string | null;
    card_last_four?: string | null;
    card_brand?: string | null;
    wallet_type?: string | null;
  },
) {
  return postJson<PmsInvoiceDetail>(`/hms/pms/billing/invoices/${invoiceId}/payments`, payload);
}

export async function createPmsInvoiceLineItem(
  invoiceId: number | string,
  payload: {
    charge_type?: string;
    description: string;
    quantity: number;
    unit_price: number;
    service_date?: string | null;
    metadata_json?: Record<string, unknown> | null;
  },
) {
  return postJson<PmsInvoiceDetail>(`/hms/pms/billing/invoices/${invoiceId}/line-items`, payload);
}

export async function voidPmsInvoiceLineItem(
  invoiceId: number | string,
  lineId: number | string,
) {
  return postJson<PmsInvoiceDetail>(`/hms/pms/billing/invoices/${invoiceId}/line-items/${lineId}/void`);
}

export async function createPmsInvoiceDocument(
  invoiceId: number | string,
  documentKind: "invoice" | "receipt" | "debit_note" | "storno",
) {
  return postJson<{
    id: number;
    document_kind: string;
    document_number: string;
    status: string;
    subject: string | null;
    title: string;
    body_text: string;
  }>(`/hms/pms/billing/invoices/${invoiceId}/documents`, {
    document_kind: documentKind,
  });
}
