/**
 * Waiter-web API client.
 *
 * All restaurant data comes from the shared backend:
 *   - /api/waiter/*      -> waiter tablet contracts
 *   - /api/billing/*     -> canonical order / KDS / billing state
 *   - /api/reservations  -> canonical table + reservation state
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

if (!API_BASE) {
  // eslint-disable-next-line no-console
  console.error("[waiter-web] VITE_API_BASE_URL is not set. API calls will fail.");
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
    if (name) {
      localStorage.setItem(WAITER_NAME_KEY, name);
    }
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
  headers?: Record<string, string>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal, headers: extraHeaders } = opts;
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = authStore.getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
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
  signal?: AbortSignal,
  headers?: Record<string, string>
) => request<T>(path, { method: "POST", body, auth, signal, headers });

export const patchJson = <T>(
  path: string,
  body: unknown,
  auth = true,
  signal?: AbortSignal
) => request<T>(path, { method: "PATCH", body, auth, signal });

export const putJson = <T>(
  path: string,
  body: unknown,
  auth = true,
  signal?: AbortSignal
) => request<T>(path, { method: "PUT", body, auth, signal });

/* =================================================================== */
/* Types                                                                */
/* =================================================================== */

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  waiter_id: string;
}

export interface WaiterTableReservation {
  id: string;
  guest_name: string;
  party_size: number;
  start_time: string;
  status: string;
}

export interface WaiterTable {
  id: string;
  number: string;
  seats: number;
  minimum_party_size: number;
  status: "free" | "occupied" | "reserved" | "billing" | string;
  section_id: string;
  section_name: string;
  shape: string;
  position_x: number;
  position_y: number;
  rotation: number;
  width: number;
  height: number;
  current_order_id: string | null;
  occupied_since: string | null;
  current_total: number;
  guest_count: number;
  item_count: number;
  elapsed_minutes: number;
  item_status_counts: {
    preparing: number;
    ready: number;
    served: number;
  };
  reservation?: WaiterTableReservation | null;
}

export interface WaiterMenuModifier {
  id: string;
  name: string;
  group_name: string;
  price_adjustment: number;
  is_default: boolean;
}

export interface WaiterMenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  available: boolean;
  is_available: boolean;
  featured: boolean;
  is_featured: boolean;
  is_popular: boolean;
  image_url: string | null;
  prep_time_min: number;
  allergens: string[];
  dietary_tags: string[];
  modifiers: WaiterMenuModifier[];
  emoji?: string | null;
}

export interface WaiterMenuSubcategory {
  id: string;
  name: string;
  emoji?: string | null;
  items: WaiterMenuItem[];
}

export interface WaiterMenuCategory {
  id: string;
  name: string;
  sort_order: number;
  icon?: string | null;
  emoji?: string | null;
  color?: string | null;
  color_hex?: string | null;
  items: WaiterMenuItem[];
  subcategories: WaiterMenuSubcategory[];
}

export interface WaiterMenuCatalog {
  categories: WaiterMenuCategory[];
  items: WaiterMenuItem[];
}

export interface OrderCreatePayload {
  table_id: string;
  waiter_id?: string | null;
  guest_count?: number | null;
  items: Array<{
    menu_item_id: string;
    quantity: number;
    notes?: string | null;
    modifier_ids?: string[];
  }>;
  notes?: string | null;
}

export interface OrderCreateResponse {
  order_id: string;
  status: string;
  created_at: string;
}

export interface WaiterRepeatOrderItem {
  menu_item_id: string;
  item_name: string;
  quantity: number;
  notes?: string | null;
  modifier_ids: string[];
}

export interface WaiterTableLastOrder {
  order_id: string;
  status: string;
  created_at: string;
  notes?: string | null;
  items: WaiterRepeatOrderItem[];
}

export interface OrderItemRead {
  id: number;
  order_id: number;
  menu_item_id: number;
  item_name?: string | null;
  menu_item_name?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  modifiers_json?: Record<string, unknown> | null;
  notes?: string | null;
  station?: string | null;
  course_number?: number | null;
  sent_to_kitchen_at?: string | null;
}

export interface TableOrderRead {
  id: number;
  restaurant_id?: number;
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

export interface ReservationRead {
  id: number;
  kind?: string;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  table_id: number | null;
  party_size: number;
  reservation_date: string;
  start_time: string;
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
  reservation_date: string;
  start_time: string;
  duration_min?: number;
  table_id?: number | null;
  special_requests?: string | null;
  source?: string;
}

export interface ReservationUpdatePayload {
  table_id?: number | null;
  status?: string;
  special_requests?: string | null;
  notes?: string | null;
}

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
/* Menu normalization                                                   */
/* =================================================================== */

type RawMenuModifier = Partial<WaiterMenuModifier> & {
  id?: string | number;
  name?: string;
  group_name?: string;
  price_adjustment?: number;
  is_default?: boolean;
};

type RawMenuItem = Partial<WaiterMenuItem> & {
  id?: string | number;
  category_id?: string | number;
  name?: string;
  description?: string;
  price?: number;
  available?: boolean;
  is_available?: boolean;
  featured?: boolean;
  is_featured?: boolean;
  is_popular?: boolean;
  image_url?: string | null;
  prep_time_min?: number;
  allergens?: string[];
  dietary_tags?: string[];
  modifiers?: RawMenuModifier[];
};

type RawMenuSubcategory = {
  id?: string | number;
  name?: string;
  emoji?: string | null;
  items?: RawMenuItem[];
};

type RawMenuCategory = {
  id?: string | number;
  name?: string;
  sort_order?: number;
  icon?: string | null;
  emoji?: string | null;
  color?: string | null;
  color_hex?: string | null;
  items?: RawMenuItem[];
  subcategories?: RawMenuSubcategory[];
};

type RawMenuPayload =
  | RawMenuCategory[]
  | {
      categories?: RawMenuCategory[];
      items?: RawMenuItem[];
    };

function normalizeModifier(raw: RawMenuModifier): WaiterMenuModifier {
  return {
    id: String(raw.id ?? ""),
    name: raw.name ?? "",
    group_name: raw.group_name ?? "Options",
    price_adjustment: Number(raw.price_adjustment ?? 0),
    is_default: Boolean(raw.is_default),
  };
}

function normalizeMenuItem(raw: RawMenuItem, fallbackCategoryId = ""): WaiterMenuItem {
  const available = Boolean(raw.available ?? raw.is_available ?? true);
  const featured = Boolean(
    raw.featured ?? raw.is_featured ?? raw.is_popular ?? false
  );

  return {
    id: String(raw.id ?? ""),
    category_id: String(raw.category_id ?? fallbackCategoryId),
    name: raw.name ?? "",
    description: raw.description ?? "",
    price: Number(raw.price ?? 0),
    available,
    is_available: available,
    featured,
    is_featured: featured,
    is_popular: featured,
    image_url: raw.image_url ?? null,
    prep_time_min: Number(raw.prep_time_min ?? 0),
    allergens: Array.isArray(raw.allergens) ? raw.allergens : [],
    dietary_tags: Array.isArray(raw.dietary_tags) ? raw.dietary_tags : [],
    modifiers: Array.isArray(raw.modifiers)
      ? raw.modifiers.map(normalizeModifier)
      : [],
    emoji: raw.emoji ?? null,
  };
}

function normalizeCategory(raw: RawMenuCategory): WaiterMenuCategory {
  const rawSubcategories = Array.isArray(raw.subcategories) ? raw.subcategories : [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  const subcategories: WaiterMenuSubcategory[] =
    rawSubcategories.length > 0
      ? rawSubcategories.map((subcategory) => ({
          id: String(subcategory.id ?? `${raw.id ?? "category"}-default`),
          name: subcategory.name ?? raw.name ?? "Category",
          emoji: subcategory.emoji ?? raw.emoji ?? null,
          items: Array.isArray(subcategory.items)
            ? subcategory.items.map((item) =>
                normalizeMenuItem(item, String(raw.id ?? ""))
              )
            : [],
        }))
      : [
          {
            id: `sub-${String(raw.id ?? "")}`,
            name: raw.name ?? "Category",
            emoji: raw.emoji ?? null,
            items: rawItems.map((item) =>
              normalizeMenuItem(item, String(raw.id ?? ""))
            ),
          },
        ];

  return {
    id: String(raw.id ?? ""),
    name: raw.name ?? "Category",
    sort_order: Number(raw.sort_order ?? 0),
    icon: raw.icon ?? raw.emoji ?? null,
    emoji: raw.emoji ?? raw.icon ?? null,
    color: raw.color ?? raw.color_hex ?? null,
    color_hex: raw.color_hex ?? raw.color ?? null,
    items: subcategories.flatMap((subcategory) => subcategory.items),
    subcategories,
  };
}

function normalizeMenuCatalog(payload: RawMenuPayload): WaiterMenuCatalog {
  const categories = (Array.isArray(payload) ? payload : payload.categories ?? []).map(
    normalizeCategory
  );

  return {
    categories,
    items: categories.flatMap((category) => category.items),
  };
}

/* =================================================================== */
/* Endpoints                                                            */
/* =================================================================== */

const menuCatalog = async (signal?: AbortSignal): Promise<WaiterMenuCatalog> =>
  normalizeMenuCatalog(await getJson<RawMenuPayload>("/waiter/menu", true, signal));

export const waiterApi = {
  login: (username: string, password: string, deviceId?: string) =>
    postJson<LoginResponse>(
      "/waiter/auth/login",
      { username, password, device_id: deviceId ?? null },
      false
    ),

  logout: () => postJson<{ status: string }>("/waiter/auth/logout", {}),

  tables: (signal?: AbortSignal) =>
    getJson<WaiterTable[]>("/waiter/tables", true, signal),

  updateTableStatus: (tableId: string, status: string) =>
    patchJson<WaiterTable>(`/waiter/tables/${tableId}/status`, { status }),

  menuCatalog,

  menu: async (signal?: AbortSignal) => (await menuCatalog(signal)).categories,

  quickItems: (signal?: AbortSignal) =>
    getJson<WaiterMenuItem[]>("/waiter/quick-items", true, signal),

  tableLastOrder: (tableId: string, signal?: AbortSignal) =>
    getJson<WaiterTableLastOrder>(`/waiter/tables/${tableId}/last-order`, true, signal),

  createOrder: (
    payload: OrderCreatePayload,
    options?: { signal?: AbortSignal; idempotencyKey?: string }
  ) =>
    postJson<OrderCreateResponse>(
      "/waiter/orders",
      payload,
      true,
      options?.signal,
      options?.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : undefined
    ),

  liveOrders: (signal?: AbortSignal) =>
    getJson<LiveOrderSummary[]>("/billing/orders/live", true, signal),

  orderDetail: (orderId: number | string, signal?: AbortSignal) =>
    getJson<TableOrderRead>(`/billing/orders/${orderId}`, true, signal),

  orderItems: (orderId: number | string, signal?: AbortSignal) =>
    getJson<OrderItemRead[]>(`/billing/orders/${orderId}/items`, true, signal),

  billByOrder: (orderId: number | string, signal?: AbortSignal) =>
    getJson<BillRead>(`/billing/bills/by-order/${orderId}`, true, signal),

  receipt: (billId: number | string, signal?: AbortSignal) =>
    getJson<ReceiptData>(`/billing/bills/${billId}/receipt`, true, signal),

  payOrder: (payload: WaiterPaymentRequest) =>
    postJson<WaiterPaymentResponse>(
      `/waiter/orders/${payload.order_id}/payment`,
      payload,
      true
    ),

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

  updateReservation: (reservationId: number, payload: ReservationUpdatePayload) =>
    putJson<ReservationRead>(`/reservations/${reservationId}`, payload, true),

  cancelReservation: (reservationId: number) =>
    postJson<ReservationRead>(`/reservations/${reservationId}/cancel`, {}),

  seatReservation: (reservationId: number) =>
    postJson<ReservationRead>(`/reservations/${reservationId}/seat`, {}),
};

/* =================================================================== */
/* Realtime                                                             */
/* =================================================================== */

export function openWaiterWebSocket(
  onEvent: (event: { type: string; [key: string]: unknown }) => void,
  onError?: (err: Event) => void
): () => void {
  const token = authStore.getToken();
  if (!token || !API_BASE) {
    return () => {};
  }

  const httpUrl = new URL(API_BASE);
  const wsProto = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  const claims = readTokenClaims(token);
  const channelId = claims?.restaurant_id ?? claims?.active_property_id;
  if (channelId == null) {
    // eslint-disable-next-line no-console
    console.warn("[waiter-web] websocket disabled, token does not expose a channel id");
    return () => {};
  }
  const wsUrl = `${wsProto}//${httpUrl.host}/ws/${encodeURIComponent(String(channelId))}?token=${encodeURIComponent(token)}`;

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
      if (data && typeof data === "object") {
        onEvent(data as { type: string; [key: string]: unknown });
      }
    } catch {
      // Ignore non-JSON heartbeat messages.
    }
  };

  ws.onerror = (e) => {
    if (onError) {
      onError(e);
    }
  };

  return () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  };
}

interface TokenClaims {
  restaurant_id?: number | string | null;
  active_property_id?: number | string | null;
}

function readTokenClaims(token: string): TokenClaims | null {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = atob(padded);
    return JSON.parse(decoded) as TokenClaims;
  } catch {
    return null;
  }
}
