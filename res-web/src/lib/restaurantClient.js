const DEFAULT_API_BASE_URL = "http://localhost:8000/api";
const DEFAULT_RESERVATION_SOURCE = "restaurant_guest_web";

export function normalizeApiBaseUrl(input) {
  const value = String(input || "").trim();
  const candidate = value || DEFAULT_API_BASE_URL;
  const normalized = candidate.replace(/\/+$/, "");
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
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

export function splitDateTimeInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { reservationDate: "", startTime: "" };
  }
  if (raw.includes("T")) {
    const [reservationDate, startTime] = raw.split("T");
    return {
      reservationDate: reservationDate || "",
      startTime: normalizeTimeInput((startTime || "").slice(0, 5)),
    };
  }
  return {
    reservationDate: raw.slice(0, 10),
    startTime: normalizeTimeInput(raw.slice(11, 16)),
  };
}

export function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `res-web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function readRuntimeConfig(runtimeWindow = globalThis.window ?? {}, env = import.meta.env ?? {}) {
  const params = new URLSearchParams(runtimeWindow.location?.search || "");
  const apiBaseUrl = normalizeApiBaseUrl(
    runtimeWindow.API_BASE_URL ||
      runtimeWindow.RES_WEB_CONFIG?.apiBaseUrl ||
      env.VITE_PUBLIC_API_BASE_URL ||
      params.get("api_base"),
  );
  const restaurantId = parsePositiveInt(
    runtimeWindow.RESTAURANT_ID ||
      runtimeWindow.RES_WEB_CONFIG?.restaurantId ||
      env.VITE_RESTAURANT_ID ||
      params.get("restaurant_id"),
  );

  return {
    apiBaseUrl,
    restaurantId,
    defaultTableCode:
      String(
        runtimeWindow.RES_WEB_CONFIG?.tableCode ||
          params.get("table") ||
          params.get("code") ||
          "",
      ).trim(),
    reservationSource:
      String(
        runtimeWindow.RES_WEB_CONFIG?.reservationSource ||
          env.VITE_RESERVATION_SOURCE ||
          DEFAULT_RESERVATION_SOURCE,
      ).trim() || DEFAULT_RESERVATION_SOURCE,
  };
}

export async function apiRequest(config, path, options = {}) {
  const target = `${normalizeApiBaseUrl(config?.apiBaseUrl)}${path}`;
  const response = await fetch(target, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail =
      payload?.detail ||
      payload?.error ||
      payload?.message ||
      `Request failed with ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function buildRestaurantReservationPayload(formValues, config) {
  const restaurantId = parsePositiveInt(formValues.restaurantId ?? config.restaurantId);
  const partySize = parsePositiveInt(formValues.partySize);
  const guestName = String(formValues.guestName || "").trim();
  const { reservationDate, startTime } = splitDateTimeInput(formValues.dateTime);
  const directReservationDate = String(formValues.reservationDate || "").trim();
  const directStartTime = normalizeTimeInput(formValues.startTime);
  const safeReservationDate = directReservationDate || reservationDate;
  const safeStartTime = directStartTime || startTime;
  const specialRequests = String(formValues.specialRequests || "").trim();

  if (!restaurantId) {
    throw new Error("restaurant_id is required");
  }
  if (!guestName) {
    throw new Error("guest_name is required");
  }
  if (!partySize) {
    throw new Error("party_size is required");
  }
  if (!safeReservationDate) {
    throw new Error("reservation_date is required");
  }
  if (!safeStartTime) {
    throw new Error("start_time is required");
  }

  return {
    kind: "restaurant",
    restaurant_id: restaurantId,
    guest_name: guestName,
    guest_email: String(formValues.email || "").trim() || undefined,
    guest_phone: String(formValues.phone || "").trim() || undefined,
    party_size: partySize,
    reservation_date: safeReservationDate,
    start_time: safeStartTime,
    special_requests: specialRequests || undefined,
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
  if (!items.length) {
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
    const statusKey = String(item.status || "pending");
    const quantity = Number(item.quantity || 1);
    if (statusKey in summary) {
      summary[statusKey] += quantity;
    }
    summary.total += quantity;
  }

  return summary;
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

export function buildPublicMenuPath(config) {
  const restaurantId = parsePositiveInt(config?.restaurantId);
  if (!restaurantId) {
    return '/public/restaurant/menu';
  }
  const params = new URLSearchParams({
    restaurant_id: String(restaurantId),
  });
  return `/public/restaurant/menu?${params.toString()}`;
}

export function normalizeMenuCategories(rawCategories) {
  return Array.isArray(rawCategories)
    ? rawCategories
        .map((category) => ({
          ...category,
          items: Array.isArray(category.items)
            ? category.items
                .map((item) => {
                  const numericPrice = Number(item?.price);
                  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
                    return null;
                  }

                  return {
                    ...item,
                    price: numericPrice,
                    img: item.image_url || '/daselb-logo.png',
                    desc:
                      item.description ||
                      'Live menu item from the gastronomy backend.',
                  };
                })
                .filter(Boolean)
            : [],
        }))
        .filter((category) => category.items.length > 0)
    : [];
}
