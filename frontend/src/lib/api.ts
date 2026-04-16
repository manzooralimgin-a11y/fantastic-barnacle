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

function resolveApiBaseUrl(baseURL: string, env: NodeJS.ProcessEnv = process.env): string {
  if (/^https?:\/\//i.test(baseURL)) {
    return baseURL.replace(/\/+$/, "");
  }
  const normalized = baseURL.startsWith("/") ? baseURL : `/${baseURL}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalized}`.replace(/\/+$/, "");
  }
  const fallbackOrigin = env.NEXT_PUBLIC_SAAS_BASE_URL?.trim();
  if (fallbackOrigin) {
    return `${fallbackOrigin.replace(/\/+$/, "")}${normalized}`.replace(/\/+$/, "");
  }
  return normalized.replace(/\/+$/, "");
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

export function resolveApiRequestUrl(
  config: Pick<AxiosRequestConfig, "baseURL" | "url">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const baseURL = resolveApiBaseUrl(config.baseURL || getApiBaseUrl(env), env);
  const url = String(config.url || "").trim();
  if (!url) {
    return baseURL;
  }
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `${baseURL}/${url.replace(/^\/+/, "")}`;
}

export interface ApiClientLike {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
  post<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }>;
  put<T = unknown>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<{ data: T }>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getApiErrorData(error: unknown): unknown | null {
  return axios.isAxiosError(error) ? error.response?.data ?? null : null;
}

export function summarizeApiError(
  error: unknown,
  config?: Pick<AxiosRequestConfig, "baseURL" | "url" | "method">,
) {
  const axiosError = axios.isAxiosError(error) ? error : null;
  const requestConfig = config ?? axiosError?.config;

  return {
    method: requestConfig?.method?.toUpperCase() || "GET",
    url: requestConfig?.url ?? null,
    requestUrl: requestConfig ? resolveApiRequestUrl(requestConfig) : null,
    baseURL: requestConfig?.baseURL || getApiBaseUrl(),
    origin: typeof window !== "undefined" ? window.location.origin : null,
    status: axiosError?.response?.status ?? null,
    code: axiosError?.code ?? null,
    message:
      axiosError?.message ??
      (error instanceof Error && error.message ? error.message : null),
    detail: getApiErrorData(error),
  };
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
  if (typeof window !== "undefined" && config.url?.includes("/auth/")) {
    console.info("API request", {
      method: config.method?.toUpperCase() || "GET",
      url: resolveApiRequestUrl(config),
      baseURL: config.baseURL || getApiBaseUrl(),
      origin: window.location.origin,
    });
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

    // Do not log cancelled / aborted requests as errors. React Query cancels
    // in-flight requests when components unmount or the user closes a panel;
    // these are benign and show up here with no response and a cancel code.
    const isCanceled =
      axios.isCancel?.(error) ||
      error.code === "ERR_CANCELED" ||
      error.name === "CanceledError" ||
      error.message === "canceled";

    const status = error.response?.status;
    const isAuthRequest = Boolean(config.url?.includes("/auth/"));
    if (!isCanceled && (!status || status >= 500 || isAuthRequest)) {
      const summary = summarizeApiError(error, config);
      if (isAuthRequest && status && status < 500) {
        console.warn("API auth rejected", summary);
      } else {
        console.error("API request failed", summary);
      }
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

export function getApiErrorMessage(error: unknown, fallback = "Request failed.") {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    if (typeof responseData === "string" && responseData.trim()) {
      return responseData;
    }
    if (isRecord(responseData)) {
      if (typeof responseData.error === "string" && responseData.error.trim()) {
        return responseData.error;
      }
      const detail = "detail" in responseData ? responseData.detail : null;
      if (typeof detail === "string" && detail.trim()) {
        return detail;
      }
      if (Array.isArray(detail) && detail.length > 0) {
        const firstIssue = detail[0];
        if (typeof firstIssue === "string" && firstIssue.trim()) {
          return firstIssue;
        }
        if (
          firstIssue &&
          typeof firstIssue === "object" &&
          "msg" in firstIssue &&
          typeof firstIssue.msg === "string" &&
          firstIssue.msg.trim()
        ) {
          return firstIssue.msg;
        }
      }
      if ("message" in responseData && typeof responseData.message === "string" && responseData.message.trim()) {
        return responseData.message;
      }
    }
    if (error.message?.trim()) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export default api;
