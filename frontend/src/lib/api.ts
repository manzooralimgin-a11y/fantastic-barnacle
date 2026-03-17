import axios from "axios";

/**
 * Resolve API base URL with runtime override support.
 * Priority: localStorage override > build-time env > Render fallback.
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
  return "http://localhost:8000/api";
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

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        // Avoid redirect loop if already on login page
        if (!currentPath.includes("login")) {
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
