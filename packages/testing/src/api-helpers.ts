/**
 * @das-elb/testing — API request helpers
 *
 * Thin wrappers around fetch for use in test scripts and contract validation.
 * These are NOT mocks — they make real HTTP requests to the backend.
 */

export interface ApiClientOptions {
  baseUrl: string;
  token?: string;
  timeout?: number;
}

export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  ok: boolean;
}

/**
 * Make a JSON request to the API. Returns the parsed body and status.
 * Never throws on HTTP errors — always returns the body for assertion.
 */
export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  url: string,
  options: {
    body?: unknown;
    token?: string;
    timeout?: number;
  } = {}
): Promise<ApiResponse<T>> {
  const { body, token, timeout = 10_000 } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    let data: T;
    try {
      data = await res.json();
    } catch {
      data = {} as T;
    }

    return {
      status: res.status,
      data,
      ok: res.ok,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience wrappers
 */
export const api = {
  get: <T>(url: string, options?: { token?: string }) =>
    apiRequest<T>("GET", url, options),

  post: <T>(url: string, body: unknown, options?: { token?: string }) =>
    apiRequest<T>("POST", url, { ...options, body }),

  put: <T>(url: string, body: unknown, options?: { token?: string }) =>
    apiRequest<T>("PUT", url, { ...options, body }),

  delete: <T>(url: string, options?: { token?: string }) =>
    apiRequest<T>("DELETE", url, options),
};

/**
 * Build a full API URL from a base URL and path.
 * Handles trailing slashes and leading slashes correctly.
 */
export function apiUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

/**
 * Wait for the API health endpoint to return healthy.
 * Useful in CI before running tests against a just-started server.
 */
export async function waitForApi(
  baseUrl: string,
  options: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<void> {
  const { maxAttempts = 30, intervalMs = 1000 } = options;
  const healthUrl = apiUrl(baseUrl, "/health");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await apiRequest("GET", healthUrl, { timeout: 2000 });
      if (res.ok) return;
    } catch {
      // Ignore connection errors — server not up yet
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `API at ${baseUrl} did not become healthy within ${maxAttempts * intervalMs}ms`
  );
}
