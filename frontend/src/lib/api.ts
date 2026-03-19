import axios from "axios";

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

// Guard against multiple simultaneous 401 responses all triggering a redirect.
// When the dashboard fires 8+ parallel API calls and all return 401, the
// interceptor fires 8 times. Without this flag every call races to set
// window.location.href, which can crash Next.js's navigation stack.
let _redirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        if (!currentPath.includes("login") && !_redirectingToLogin) {
          _redirectingToLogin = true;
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
