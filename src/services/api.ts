const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

const DEBUG = process.env.NEXT_PUBLIC_API_DEBUG === "1";

export class ApiError extends Error {
  status: number;
  endpoint: string;
  body: unknown;
  constructor(status: number, endpoint: string, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.body = body;
  }
}

// Module-level token cache — survives re-renders, cleared on 401
let _cachedToken: string | null = null;
let _tokenPromise: Promise<string> | null = null;

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    // FastAPI shapes: { detail: "..." } or { detail: [{ msg: "..." }] }
    const detail = obj.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .map((d) => (d && typeof d === "object" && typeof (d as Record<string, unknown>).msg === "string" ? (d as Record<string, unknown>).msg as string : null))
        .filter((s): s is string => !!s);
      if (parts.length) return parts.join("; ");
    }
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message;
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error;
  }
  if (typeof body === "string" && body.trim()) return body;
  return `HTTP ${status}`;
}

async function toApiError(endpoint: string, res: Response): Promise<ApiError> {
  const body = await parseResponseBody(res);
  const message = extractErrorMessage(body, res.status);
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.error("[api] request failed", { endpoint, status: res.status, body });
  }
  return new ApiError(res.status, endpoint, message, body);
}

async function acquireToken(): Promise<string> {
  if (_cachedToken) return _cachedToken;
  if (_tokenPromise) return _tokenPromise;

  _tokenPromise = (async () => {
    const email = process.env.NEXT_PUBLIC_OWNER_EMAIL;
    const password = process.env.NEXT_PUBLIC_OWNER_PASSWORD;
    if (!email || !password) {
      throw new Error("Owner credentials not configured (NEXT_PUBLIC_OWNER_EMAIL / NEXT_PUBLIC_OWNER_PASSWORD)");
    }
    const endpoint = "/api/auth/login";
    const res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      _tokenPromise = null;
      throw await toApiError(endpoint, res);
    }
    const data = (await res.json()) as { access_token?: string };
    if (!data?.access_token) {
      _tokenPromise = null;
      throw new ApiError(500, endpoint, "Login response did not include access_token", data);
    }
    _cachedToken = data.access_token;
    _tokenPromise = null;
    return _cachedToken;
  })();

  return _tokenPromise;
}

async function doFetch(endpoint: string, init: RequestInit): Promise<Response> {
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug("[api] →", init.method || "GET", endpoint);
  }
  const res = await fetch(`${API_BASE_URL}${endpoint}`, init);
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug("[api] ←", res.status, endpoint);
  }
  return res;
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await doFetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) throw await toApiError(endpoint, res);
  return (await res.json()) as T;
}

async function fetchApiAuth<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = await acquireToken();
  const buildInit = (t: string): RequestInit => ({
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
      ...options?.headers,
    },
  });

  const res = await doFetch(endpoint, buildInit(token));

  if (res.status === 401) {
    _cachedToken = null;
    _tokenPromise = null;
    const freshToken = await acquireToken();
    const retry = await doFetch(endpoint, buildInit(freshToken));
    if (!retry.ok) throw await toApiError(endpoint, retry);
    return (await retry.json()) as T;
  }

  if (!res.ok) throw await toApiError(endpoint, res);
  return (await res.json()) as T;
}

export const api = {
  get: <T>(endpoint: string) => fetchApi<T>(endpoint),
  post: <T>(endpoint: string, data: unknown) =>
    fetchApi<T>(endpoint, { method: "POST", body: JSON.stringify(data) }),
  put: <T>(endpoint: string, data: unknown) =>
    fetchApi<T>(endpoint, { method: "PUT", body: JSON.stringify(data) }),
  delete: <T>(endpoint: string) =>
    fetchApi<T>(endpoint, { method: "DELETE" }),
  authGet: <T>(endpoint: string) => fetchApiAuth<T>(endpoint),
  authPost: <T>(endpoint: string, data: unknown) =>
    fetchApiAuth<T>(endpoint, { method: "POST", body: JSON.stringify(data) }),
};
