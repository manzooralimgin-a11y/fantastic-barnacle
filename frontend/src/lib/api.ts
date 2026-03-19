import axios from "axios";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Resolve API base URL with runtime override support.
 * Priority: localStorage override > build-time env > relative path (Replit/dev).
 * This allows the desktop app to switch API endpoints without rebuilding.
 */
function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const override = localStorage.getItem("gestronomy_api_url");
    if (override) return override.replace(/\/+$/, "") + "/api";
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return `${process.env.NEXT_PUBLIC_API_URL}/api`;
  }
  // On Replit, the frontend is proxied — use relative /api path so requests
  // route correctly through Next.js rewrites to the backend on port 8000.
  return "/api";
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
  headers: { "Content-Type": "application/json" },
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

// On a 401 response, clear auth state via the Zustand store.
// The protected layouts watch token; when it becomes null they call
// router.replace("/login") — one clean client-side navigation, no hard reload.
// Using window.location.href here caused a race between the hard reload and
// the layout's router.replace, which could crash Next.js's navigation stack.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
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
