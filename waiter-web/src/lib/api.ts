/**
 * Waiter-web API client.
 *
 * Every endpoint here is backed by the existing central backend:
 *   - /api/waiter/*      → backend/app/waiter/router.py
 *   - /api/billing/*     → backend/app/billing/router.py   (orders, KDS, bills)
 *   - /api/reservations  → backend/app/reservations/router.py
 *
 * Base URL comes from VITE_API_BASE_URL. In production this is
 *   https://gestronomy-api-5atv.onrender.com/api
 *
 * Auth: the waiter login returns a normal tenant JWT (via
 * authenticate_user), so the same Bearer token is valid for /billing/*
 * and /reservations as long as the user has restaurant_id set.
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

if (!API_BASE) {
  // eslint-disable-next-line no-console
  console.error(
    "[waiter-web] VITE_API_BASE_URL is not set. API calls will fail."
  );
}

const TOKEN_KEY = "waiter_access_token";
const REFRESH_KEY = "waiter_refresh_token";
const WAITER_ID_KEY = "waiter_id";
const WAITER_NAME_KEY = "waiter_name";

export const authStore = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  getRefresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  getWaiterId(): string | null {
    return localStorage.getItem(WAITER_ID_KEY);
  },
  getWaiterName(): string | null {
    return localStorage.getItem(WAITER_NAME_KEY);
  },
  set(access: string, refresh: string, waiterId: string, name?: string) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(WAITER_ID_KEY, waiterId);
    if (name) localStorage.setItem(WAITER_NAME_KEY, name);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(WAITER_ID_KEY);
    localStorage.removeItem(WAITER_NAME_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  url: string;
  body: unknown;
  constructor(status: number, url: string, body: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal } = opts;
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = authStore.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new ApiError(0, url, null, `Network error: ${(err as Error).message}`);
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const detail =
      (payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : null) ?? res.statusText;
    throw new ApiError(res.status, url, payload, detail);
  }

  return payload as T;
}

export const getJson = <T>(path: string, auth = true, signal?: AbortSignal) =>
  request<T>(path, { method: "GET", auth, signal });

export const postJson = <T>(
  path: string,
  body: unknown,
  auth = true,
  signal?: AbortSignal
) => request<T>(path, { method: "POST", body, auth, signal });

export const patchJson = <T>(
  path: string,
  body: unknown,
  auth = true,
  signal?: AbortSignal
) => request<T>(path, { method: "PATCH", body, auth, signal });

/* =================================================================== */
/*  Types — mirror backend Pydantic schemas                             */
/* =================================================================== */

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  waiter_id: string;
}

export interface WaiterTable {
  id: string;
  number: string;
  seats: number;
  status: "free" | "occupied" | "reserved" | string;
  current_order_id: string | null;
  occupied_since: string | null;
}

export interface WaiterMenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  emoji: string;
  is_available: boolean;
  is_popular: boolean;
  allergens: string[];
}

export interface WaiterMenuSubcategory {
  id: string;
  name: string;
  emoji: string;
  items: WaiterMenuItem[];
}

export interface WaiterMenuCategory {
  id: string;
  name: string;
  emoji: string;
  color_hex: string;
  subcategories: WaiterMenuSubcategory[];
}

export interface OrderCreatePayload {
  table_id: string;
  waiter_id?: string | null;
  items: { menu_item_id: string; quantity: number; notes?: string | null }[];
  notes?: string | null;
}

export interface OrderCreateResponse {
  order_id: string;
  status: string;
  created_at: string;
}

/* ---- Billing / order detail ---- */

export interface OrderItemRead {
  id: number;
  order_id: number;
  menu_item_id: number;
  menu_item_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  notes?: string | null;
  station?: string | null;
  course_number?: number | null;
  sent_to_kitchen_at?: string | null;
}

export interface TableOrderRead {
  id: number;
  restaurant_id: number;
  table_id: number | null;
  session_id?: number | null;
  status: string;
  order_type?: string | null;
  subtotal: number;
  tax_amount: number;
  total: number;
  notes?: string | null;
  guest_name?: string | null;
  created_at: string;
  items?: OrderItemRead[];
}

export interface LiveOrderSummary {
  id: number;
  table_id: number | null;
  table_number: string | null;
  order_type: string;
  status: string;
  item_count: number;
  total: number;
  created_at: string;
  elapsed_minutes: number;
}

export interface BillRead {
  id: number;
  order_id: number;
  bill_number: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  status: string;
  paid_at: string | null;
}

export interface PaymentRead {
  id: number;
  bill_id: number;
  amount: number;
  method: string;
  reference?: string | null;
  status: string;
  paid_at: string | null;
  card_last_four?: string | null;
  card_brand?: string | null;
}

export interface ReceiptData {
  bill_number: string;
  order_id: number;
  items: OrderItemRead[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  service_charge: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  payments: PaymentRead[];
  paid_at: string | null;
}

/* ---- Reservations (restaurant seating) ---- */

export interface ReservationRead {
  id: number;
  kind?: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  table_id: number | null;
  party_size: number;
  reservation_date: string; // ISO date
  start_time: string; // HH:MM:SS
  duration_min: number;
  status: string;
  special_requests: string | null;
  source: string;
}

export interface ReservationCreatePayload {
  kind?: "restaurant";
  guest_name: string;
  guest_phone?: string | null;
  party_size: number;
  reservation_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  duration_min?: number;
  table_id?: number | null;
  special_requests?: string | null;
  source?: string;
}

/* ---- Payments ---- */

export interface WaiterPaymentRequest {
  order_id: string;
  amount: number;
  payment_method: string;
  waiter_id?: string | null;
}

export interface WaiterPaymentResponse {
  receipt_id: string;
  status: string;
  amount: number;
  paid_at: string;
}

/* =================================================================== */
/*  Endpoints                                                           */
/* =================================================================== */

export const waiterApi = {
  login: (username: string, password: string, deviceId?: string) =>
    postJson<LoginResponse>(
      "/waiter/auth/login",
      { username, password, device_id: deviceId ?? null },
      false
    ),

  logout: () => postJson<{ status: string }>("/waiter/auth/logout", {}),

  /* --- reference data --- */
  tables: (signal?: AbortSignal) =>
    getJson<WaiterTable[]>("/waiter/tables", true, signal),

  updateTableStatus: (tableId: string, status: string) =>
    patchJson<WaiterTable>(`/waiter/tables/${tableId}/status`, { status }),

  menu: (signal?: AbortSignal) =>
    getJson<WaiterMenuCategory[]>("/waiter/menu", true, signal),

  /* --- orders --- */
  createOrder: (payload: OrderCreatePayload) =>
    postJson<OrderCreateResponse>("/waiter/orders", payload, true),

  liveOrders: (signal?: AbortSignal) =>
    getJson<LiveOrderSummary[]>("/billing/orders/live", true, signal),

  orderDetail: (orderId: number | string, signal?: AbortSignal) =>
    getJson<TableOrderRead>(`/billing/orders/${orderId}`, true, signal),

  orderItems: (orderId: number | string, signal?: AbortSignal) =>
    getJson<OrderItemRead[]>(`/billing/orders/${orderId}/items`, true, signal),

  /* --- bills / receipt --- */
  billByOrder: (orderId: number | string, signal?: AbortSignal) =>
    getJson<BillRead>(`/billing/bills/by-order/${orderId}`, true, signal),

  receipt: (billId: number | string, signal?: AbortSignal) =>
    getJson<ReceiptData>(`/billing/bills/${billId}/receipt`, true, signal),

  /* --- payment --- */
  payOrder: (payload: WaiterPaymentRequest) =>
    postJson<WaiterPaymentResponse>(
      `/waiter/orders/${payload.order_id}/payment`,
      payload,
      true
    ),

  /* --- reservations --- */
  reservations: (isoDate?: string, signal?: AbortSignal) => {
    const q = isoDate ? `?reservation_date=${isoDate}` : "";
    return getJson<ReservationRead[]>(`/reservations${q}`, true, signal);
  },

  createReservation: (payload: ReservationCreatePayload) =>
    postJson<ReservationRead>(
      "/reservations",
      { kind: "restaurant", ...payload },
      true
    ),

  cancelReservation: (reservationId: number) =>
    postJson<ReservationRead>(`/reservations/${reservationId}/cancel`, {}),

  seatReservation: (reservationId: number) =>
    postJson<ReservationRead>(`/reservations/${reservationId}/seat`, {}),
};

/* =================================================================== */
/*  Realtime — WebSocket subscription                                   */
/* =================================================================== */

/**
 * Connects to /ws/{restaurant_id}?token=<jwt>.
 *
 * The backend broadcasts on restaurant-scoped channels. We don't know
 * restaurant_id client-side (it's implicit in the JWT), so we try the
 * convention `/ws/current` — the backend ignores the path segment when
 * authenticated and scopes by the token's restaurant. If your backend
 * requires an explicit id, the server will reject and we fall back to
 * polling without blocking the UI.
 */
export function openWaiterWebSocket(
  onEvent: (event: { type: string; [k: string]: unknown }) => void,
  onError?: (err: Event) => void
): () => void {
  const token = authStore.getToken();
  if (!token || !API_BASE) return () => {};

  // Derive ws:// or wss:// from API_BASE
  const httpUrl = new URL(API_BASE);
  const wsProto = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  // API_BASE looks like https://host/api; WebSocket lives at host/ws/…
  const wsUrl = `${wsProto}//${httpUrl.host}/ws/current?token=${encodeURIComponent(token)}`;

  let closed = false;
  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[waiter-web] websocket open failed, using polling", err);
    return () => {};
  }

  ws.onmessage = (e) => {
    try {
      const data = JSON.parse(typeof e.data === "string" ? e.data : "");
      if (data && typeof data === "object") onEvent(data);
    } catch {
      /* ignore non-JSON pings */
    }
  };
  ws.onerror = (e) => {
    if (onError) onError(e);
  };

  return () => {
    closed = true;
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    void closed;
  };
}
