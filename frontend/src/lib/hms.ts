"use client";

import api, { getJson, postJson, putJson } from "@/lib/api";
import { defaultHotelPropertyId } from "@/lib/hotel-room-types";

export type HotelCrmGuest = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  salutation: string | null;
  birthday: string | null;
  country_code: string | null;
  country_name: string | null;
  custom_fields_json: Record<string, unknown> | null;
  reservation_count: number;
  last_stay_date: string | null;
  created_at: string;
  updated_at: string;
};

export type HotelReportSummary = {
  property_id: number;
  currency: string;
  start_date: string;
  end_date: string;
  days: number;
  room_count: number;
  occupied_room_nights: number;
  available_room_nights: number;
  occupancy_pct: number;
  arrivals: number;
  departures: number;
  turnover_total: number;
};

export type HotelReportDailyPoint = {
  report_date: string;
  occupied_rooms: number;
  occupancy_pct: number;
  arrivals: number;
  departures: number;
  turnover: number;
};

export type HotelReportDaily = {
  property_id: number;
  currency: string;
  start_date: string;
  end_date: string;
  days: number;
  room_count: number;
  items: HotelReportDailyPoint[];
};

export type HotelDocument = {
  id: number;
  property_id: number;
  reservation_id: number | null;
  stay_id: number | null;
  folio_id: number | null;
  blueprint_id: number | null;
  template_id: number | null;
  document_kind: string;
  document_number: string;
  status: string;
  subject: string | null;
  title: string;
  body_text: string;
  payload_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  issued_at: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type HotelDocumentTemplate = {
  id: number;
  property_id: number | null;
  blueprint_id: number;
  code: string;
  name: string;
  language: string;
  subject_template: string | null;
  title_template: string;
  body_template: string;
  metadata_json: Record<string, unknown> | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HotelStay = {
  id: number;
  property_id: number;
  reservation_id: number;
  room_id: number | null;
  status: string;
  planned_check_in: string;
  planned_check_out: string;
  actual_check_in_at: string | null;
  actual_check_out_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type HotelFolioLine = {
  id: number;
  folio_id: number;
  charge_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  service_date: string | null;
  status: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type HotelFolioPayment = {
  id: number;
  folio_id: number;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  paid_at: string | null;
  processing_fee: number;
  gateway_reference: string | null;
  card_last_four: string | null;
  card_brand: string | null;
  wallet_type: string | null;
  refund_of_id: number | null;
  created_at: string;
  updated_at: string;
};

export type HotelFolio = {
  id: number;
  property_id: number;
  stay_id: number;
  reservation_id: number;
  folio_number: string;
  currency: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  balance_due: number;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  stay: HotelStay;
  lines: HotelFolioLine[];
  payments: HotelFolioPayment[];
};

export type HotelRoomBoardBlock = {
  kind: string;
  reservation_id: number | null;
  stay_id: number | null;
  booking_id: string | null;
  guest_name: string | null;
  status: string;
  room_id: number | null;
  room_number: string | null;
  room_type_name: string | null;
  check_in: string;
  check_out: string;
  board_start_date: string;
  board_end_date_exclusive: string;
  start_offset: number;
  span_days: number;
  adults: number;
  children: number;
  payment_status: string | null;
  zahlungs_status: string | null;
  booking_source: string | null;
  color_tag: string | null;
  starts_before_window: boolean;
  ends_after_window: boolean;
  blocking_id: number | null;
  reason: string | null;
};

export type HotelRoomBoardRow = {
  room_id: number | null;
  room_number: string;
  room_type_name: string | null;
  status: string | null;
  floor: number | null;
  is_virtual: boolean;
  blocks: HotelRoomBoardBlock[];
  blockings: HotelRoomBoardBlock[];
};

export type HotelRoomBoard = {
  property_id: number;
  start_date: string;
  end_date: string;
  end_date_exclusive: string;
  days: number;
  dates: string[];
  rooms: HotelRoomBoardRow[];
  unassigned_blocks: HotelRoomBoardBlock[];
};

export type HousekeepingTask = {
  id: number;
  property_id: number;
  room_id: number;
  room_number: string;
  room_type_name: string | null;
  task_type: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  assigned_user_id: number | null;
  assigned_to_name: string | null;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
  task_source: string;
  guest_booking_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type HousekeepingRoom = {
  room_id: number;
  room_number: string;
  room_type_name: string | null;
  operational_status: string;
  housekeeping_status: string;
  floor: number | null;
  last_status_changed_at: string | null;
  open_task_count: number;
};

export type HousekeepingOverview = {
  property_id: number;
  rooms: HousekeepingRoom[];
  tasks: HousekeepingTask[];
};

export type HousekeepingRoomNote = {
  id: number | null;
  property_id: number;
  room_id: number;
  room_number: string;
  room_type_name: string | null;
  note_date: string;
  housekeeping_note: string | null;
  maintenance_note: string | null;
  maintenance_required: boolean;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  created_at: string | null;
  updated_at: string | null;
};

function withProperty(propertyId: number = defaultHotelPropertyId) {
  return { params: { property_id: propertyId } };
}

export async function fetchHmsCrmGuests(propertyId: number = defaultHotelPropertyId, search = "") {
  return getJson<HotelCrmGuest[]>("/hms/crm/guests", {
    params: { property_id: propertyId, search: search || undefined },
  });
}

export async function updateHmsCrmGuest(
  guestId: number,
  payload: Record<string, unknown>,
  propertyId: number = defaultHotelPropertyId,
) {
  const response = await api.patch<HotelCrmGuest>(
    `/hms/crm/guests/${guestId}`,
    payload,
    withProperty(propertyId),
  );
  return response.data;
}

export async function fetchHmsReportingSummary(propertyId: number = defaultHotelPropertyId, days = 30) {
  return getJson<HotelReportSummary>("/hms/reports/summary", {
    params: { property_id: propertyId, days },
  });
}

export async function fetchHmsReportingDaily(propertyId: number = defaultHotelPropertyId, days = 14) {
  return getJson<HotelReportDaily>("/hms/reports/daily", {
    params: { property_id: propertyId, days },
  });
}

export async function fetchHmsHousekeepingOverview(propertyId: number = defaultHotelPropertyId) {
  return getJson<HousekeepingOverview>("/hms/housekeeping", withProperty(propertyId));
}

export async function updateHousekeepingTask(taskId: number, payload: Record<string, unknown>, propertyId: number = defaultHotelPropertyId) {
  const response = await api.patch<HousekeepingTask>(`/hms/housekeeping/tasks/${taskId}`, payload, withProperty(propertyId));
  return response.data;
}

export async function updateHousekeepingRoomStatus(roomId: number, payload: Record<string, unknown>, propertyId: number = defaultHotelPropertyId) {
  const response = await api.post<HousekeepingRoom>(`/hms/housekeeping/rooms/${roomId}/status`, payload, withProperty(propertyId));
  return response.data;
}

export async function createHousekeepingTask(payload: Record<string, unknown>, propertyId: number = defaultHotelPropertyId) {
  const response = await api.post<HousekeepingTask>("/hms/housekeeping/tasks", payload, withProperty(propertyId));
  return response.data;
}

export async function fetchHousekeepingRoomNote(
  roomId: number,
  noteDate: string,
  propertyId: number = defaultHotelPropertyId,
) {
  return getJson<HousekeepingRoomNote>(`/hms/housekeeping/rooms/${roomId}/notes`, {
    params: {
      property_id: propertyId,
      note_date: noteDate,
    },
  });
}

export async function updateHousekeepingRoomNote(
  roomId: number,
  payload: {
    note_date: string;
    housekeeping_note?: string | null;
    maintenance_note?: string | null;
    maintenance_required: boolean;
  },
  propertyId: number = defaultHotelPropertyId,
) {
  return putJson<HousekeepingRoomNote>(`/hms/housekeeping/rooms/${roomId}/notes`, payload, withProperty(propertyId));
}

export async function fetchHmsFolios(propertyId: number = defaultHotelPropertyId) {
  return getJson<HotelFolio[]>("/hms/folios", withProperty(propertyId));
}

export async function fetchHmsRoomBoard(propertyId: number = defaultHotelPropertyId, days = 14, startDate?: string) {
  return getJson<HotelRoomBoard>("/hms/room-board", {
    params: {
      property_id: propertyId,
      days,
      start_date: startDate,
    },
  });
}

export async function createRoomBlocking(payload: Record<string, unknown>, propertyId: number = defaultHotelPropertyId) {
  const response = await api.post("/hms/room-blockings", payload, withProperty(propertyId));
  return response.data;
}

export async function fetchHmsDocuments(propertyId: number = defaultHotelPropertyId) {
  return getJson<HotelDocument[]>("/hms/documents", withProperty(propertyId));
}

export async function fetchHmsDocumentTemplates(propertyId: number = defaultHotelPropertyId) {
  return getJson<HotelDocumentTemplate[]>("/hms/document-templates", withProperty(propertyId));
}

export async function generateHmsDocument(payload: Record<string, unknown>, propertyId: number = defaultHotelPropertyId) {
  return postJson<HotelDocument>("/hms/documents/generate", payload, withProperty(propertyId));
}
