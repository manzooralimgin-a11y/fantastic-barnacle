import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Resolve API base URL with runtime override support.
 * Priority: localStorage override > build-time env > relative path (Replit/dev).
 */
function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const override = localStorage.getItem("gestronomy_api_url");
    if (override) return override.replace(/\/+$/, "") + "/api";
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}/api`;
  }
  return "/api";
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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

    return Promise.reject(error);
  }
);

export default api;
