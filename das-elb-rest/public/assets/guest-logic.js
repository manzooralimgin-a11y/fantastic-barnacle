export const DEFAULT_API_BASE_URL = "http://localhost:8000/api";
export const DEFAULT_RESERVATION_SOURCE = "restaurant_guest_web";

export function normalizeApiBaseUrl(input) {
  const value = String(input || "").trim();
  const candidate = value || DEFAULT_API_BASE_URL;
  const withoutTrailing = candidate.replace(/\/+$/, "");
  if (withoutTrailing.endsWith("/api")) {
    return withoutTrailing;
  }
  return `${withoutTrailing}/api`;
}

export function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeTimeInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^\d{2}:\d{2}$/.test(raw)) {
    return `${raw}:00`;
  }
  return raw;
}

export function readRuntimeConfig(runtimeWindow = globalThis.window ?? {}) {
  const params = new URLSearchParams(runtimeWindow.location?.search || "");
  const apiBaseUrl = normalizeApiBaseUrl(
    runtimeWindow.API_BASE_URL ||
      runtimeWindow.DAS_ELB_REST_CONFIG?.apiBaseUrl ||
      params.get("api_base"),
  );
  const restaurantId = parsePositiveInt(
    params.get("restaurant_id") ||
      runtimeWindow.RESTAURANT_ID ||
      runtimeWindow.DAS_ELB_REST_CONFIG?.restaurantId,
  );
  return {
    apiBaseUrl,
    restaurantId,
    defaultTableCode: params.get("table") || params.get("code") || "",
    reservationSource:
      runtimeWindow.DAS_ELB_REST_CONFIG?.reservationSource ||
      DEFAULT_RESERVATION_SOURCE,
  };
}

export function buildAvailabilityPath({ restaurantId, reservationDate, partySize }) {
  const parsedRestaurantId = parsePositiveInt(restaurantId);
  const parsedPartySize = parsePositiveInt(partySize);
  if (!parsedRestaurantId || !reservationDate || !parsedPartySize) {
    throw new Error("restaurantId, reservationDate, and partySize are required");
  }
  const params = new URLSearchParams({
    restaurant_id: String(parsedRestaurantId),
    date: reservationDate,
    party_size: String(parsedPartySize),
  });
  return `/availability?${params.toString()}`;
}

export function buildRestaurantReservationPayload(formValues, config) {
  const restaurantId = parsePositiveInt(formValues.restaurantId ?? config.restaurantId);
  const partySize = parsePositiveInt(formValues.partySize);
  const reservationDate = String(formValues.reservationDate || "").trim();
  const startTime = normalizeTimeInput(formValues.startTime);
  const guestName = String(formValues.guestName || "").trim();

  if (!restaurantId) {
    throw new Error("restaurant_id is required");
  }
  if (!guestName) {
    throw new Error("guest_name is required");
  }
  if (!partySize) {
    throw new Error("party_size is required");
  }
  if (!reservationDate) {
    throw new Error("reservation_date is required");
  }
  if (!startTime) {
    throw new Error("start_time is required");
  }

  return {
    kind: "restaurant",
    restaurant_id: restaurantId,
    guest_name: guestName,
    guest_email: String(formValues.email || "").trim() || undefined,
    guest_phone: String(formValues.phone || "").trim() || undefined,
    party_size: partySize,
    reservation_date: reservationDate,
    start_time: startTime,
    special_requests: String(formValues.specialRequests || "").trim() || undefined,
    source: config.reservationSource || DEFAULT_RESERVATION_SOURCE,
  };
}

export function buildRestaurantOrderPayload(formValues) {
  const tableCode = String(formValues.tableCode || "").trim();
  const guestName = String(formValues.guestName || "").trim() || "Restaurant Guest";
  const notes = String(formValues.notes || "").trim() || null;
  const items = Array.isArray(formValues.items) ? formValues.items : [];

  if (!tableCode) {
    throw new Error("table_code is required");
  }
  if (items.length === 0) {
    throw new Error("items are required");
  }

  return {
    table_code: tableCode,
    guest_name: guestName,
    notes,
    items: items.map((item) => ({
      menu_item_id: Number(item.menu_item_id),
      quantity: Math.max(1, Number(item.quantity || 1)),
      notes: item.notes ? String(item.notes) : null,
    })),
  };
}

export function summarizeOrderStatus(orderStatus) {
  const summary = {
    pending: 0,
    preparing: 0,
    ready: 0,
    served: 0,
    cancelled: 0,
    total: 0,
  };

  for (const item of orderStatus?.items || []) {
    const key = String(item.status || "pending");
    if (key in summary) {
      summary[key] += Number(item.quantity || 1);
    }
    summary.total += Number(item.quantity || 1);
  }

  return summary;
}
