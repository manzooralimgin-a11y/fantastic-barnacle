"use client";

import { getJson, postJson, putJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";
import type { PmsMessageTemplate, PmsMessageThread } from "@/features/hms/pms/schemas/comms";

export async function fetchPmsMessageTemplates(propertyId: number = defaultHotelPropertyId) {
  return getJson<PmsMessageTemplate[]>("/hms/pms/comms/templates", {
    params: { property_id: propertyId },
  });
}

export async function createPmsMessageTemplate(
  payload: {
    code: string;
    name: string;
    channel?: string;
    category?: string;
    subject_template?: string | null;
    body_template: string;
    is_default?: boolean;
    is_active?: boolean;
    metadata_json?: Record<string, unknown> | null;
  },
  propertyId: number = defaultHotelPropertyId,
) {
  return postJson<PmsMessageTemplate>("/hms/pms/comms/templates", payload, {
    params: { property_id: propertyId },
  });
}

export async function updatePmsMessageTemplate(
  templateId: number | string,
  payload: {
    name?: string;
    channel?: string;
    category?: string;
    subject_template?: string | null;
    body_template?: string;
    is_default?: boolean;
    is_active?: boolean;
    metadata_json?: Record<string, unknown> | null;
  },
) {
  return putJson<PmsMessageTemplate>(`/hms/pms/comms/templates/${templateId}`, payload);
}

export async function fetchPmsMessageThreads(
  propertyId: number = defaultHotelPropertyId,
  limit: number = 100,
) {
  return getJson<PmsMessageThread[]>("/hms/pms/comms/threads", {
    params: { property_id: propertyId, limit },
  });
}

export async function fetchPmsReservationThreads(
  reservationId: number | string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<PmsMessageThread[]>(`/hms/pms/comms/reservations/${reservationId}/threads`, {
    params: { property_id: propertyId },
  });
}

export async function createPmsReservationMessage(
  reservationId: number | string,
  payload: {
    thread_id?: number | null;
    template_id?: number | null;
    template_code?: string | null;
    recipient_email?: string | null;
    subject?: string | null;
    body_text?: string | null;
    metadata_json?: Record<string, unknown> | null;
  },
) {
  return postJson<PmsMessageThread>(`/hms/pms/comms/reservations/${reservationId}/messages`, payload);
}
