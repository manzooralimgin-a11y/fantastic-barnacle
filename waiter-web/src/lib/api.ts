/**
 * Waiter-web API client.
 *
 * All endpoints are discovered from backend/app/waiter/router.py
 * mounted at `/api/waiter` by backend/app/main.py.
 *
 * Base URL comes from VITE_API_BASE_URL. In production that resolves to
 * https://gestronomy-api-5atv.onrender.com/api
 */

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

if (!API_BASE) {
  // Fail loud rather than silently calling the origin.
  // eslint-disable-next-line no-console
  console.error(
    "[waiter-web] VITE_API_BASE_URL is not set. API calls will fail."
  );
}

const TOKEN_KEY = "waiter_access_token";
const REFRESH_KEY = "waiter_refresh_token";
const WAITER_ID_KEY = "waiter_id";

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
  set(access: string, refresh: string, waiterId: string) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(WAITER_ID_KEY, waiterId);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(WAITER_ID_KEY);
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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal } = opts;
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = authStore.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const startedAt = performance.now();
  // eslint-disable-next-line no-console
  console.info(`[api] → ${method} ${url}`, body ?? "");

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[api] ✗ network error ${method} ${url}`, err);
    throw new ApiError(0, url, null, `Network error: ${(err as Error).message}`);
  }

  const elapsed = Math.round(performance.now() - startedAt);

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
    // eslint-disable-next-line no-console
    console.error(
      `[api] ✗ ${res.status} ${method} ${url} (${elapsed}ms)`,
      payload
    );
    const detail =
      (payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : null) ?? res.statusText;
    throw new ApiError(res.status, url, payload, detail);
  }

  // eslint-disable-next-line no-console
  console.info(`[api] ✓ ${res.status} ${method} ${url} (${elapsed}ms)`, payload);
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

/* ------------------------------------------------------------------ */
/* Types — mirror backend/app/waiter/router.py Pydantic models         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Endpoints                                                          */
/* ------------------------------------------------------------------ */

export const waiterApi = {
  login: (username: string, password: string, deviceId?: string) =>
    postJson<LoginResponse>(
      "/waiter/auth/login",
      { username, password, device_id: deviceId ?? null },
      false
    ),
  tables: (signal?: AbortSignal) =>
    getJson<WaiterTable[]>("/waiter/tables", true, signal),
  menu: (signal?: AbortSignal) =>
    getJson<WaiterMenuCategory[]>("/waiter/menu", true, signal),
  createOrder: (payload: OrderCreatePayload) =>
    postJson<OrderCreateResponse>("/waiter/orders", payload, true),
};
