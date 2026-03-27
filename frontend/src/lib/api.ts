import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Resolve API base URL with runtime override support.
 * Priority: localStorage override > build-time env > relative path (Replit/dev).
 */
function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

export function getApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (typeof window !== "undefined" && env.NODE_ENV === "development") {
    const override = localStorage.getItem("gestronomy_api_url");
    if (override) return normalizeApiBaseUrl(override);
  }
  if (env.NEXT_PUBLIC_API_URL) {
    return normalizeApiBaseUrl(env.NEXT_PUBLIC_API_URL);
  }
  return "/api";
}

export interface ApiClientLike {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
  post<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }>;
  put<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token =
    useAuthStore.getState().token ||
    (typeof window !== "undefined" ? localStorage.getItem("access_token") : null);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Retry helper — retries idempotent GET requests on network errors and 5xx
 * responses. Uses exponential backoff: 400 ms, 800 ms.
 */
const RETRY_DELAYS = [400, 800];

function shouldRetry(error: AxiosError, attempt: number): boolean {
  if (attempt >= RETRY_DELAYS.length) return false;
  const method = (error.config as AxiosRequestConfig)?.method?.toUpperCase();
  if (method !== "GET") return false;
  const status = error.response?.status;
  if (status && status >= 400 && status < 500) return false;
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as AxiosRequestConfig & { _retryCount?: number };
    if (!config) return Promise.reject(error);

    const attempt = config._retryCount ?? 0;
    if (shouldRetry(error, attempt)) {
      config._retryCount = attempt + 1;
      await sleep(RETRY_DELAYS[attempt]);
      return api(config);
    }

    if (error.response?.status === 401 && typeof window !== "undefined") {
      const currentPath = window.location.pathname;
      if (!currentPath.includes("/login")) {
        useAuthStore.getState().clear();
      }
    }

    const status = error.response?.status;
    if (!status || status >= 500) {
      console.error("API request failed", {
        method: config.method?.toUpperCase() || "GET",
        url: config.url,
        baseURL: config.baseURL,
        status: status ?? "network_error",
        detail: error.response?.data ?? error.message,
      });
    }

    return Promise.reject(error);
  }
);

export async function getJson<T>(
  url: string,
  config?: AxiosRequestConfig,
  client: ApiClientLike = api,
): Promise<T> {
  const response = await client.get<T>(url, config);
  return response.data;
}

export async function postJson<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
  client: ApiClientLike = api,
): Promise<T> {
  const response = await client.post<T>(url, body, config);
  return response.data;
}

export async function putJson<T>(
  url: string,
  body?: unknown,
  config?: AxiosRequestConfig,
  client: ApiClientLike = api,
): Promise<T> {
  const response = await client.put<T>(url, body, config);
  return response.data;
}

export async function deleteJson<T>(
  url: string,
  config?: AxiosRequestConfig,
  client: ApiClientLike = api,
): Promise<T> {
  const response = await client.delete<T>(url, config);
  return response.data;
}

export default api;
