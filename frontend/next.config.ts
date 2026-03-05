import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

const nextConfig: NextConfig = {
  // Only enable static export for production builds (Tauri desktop + Docker).
  // The dev server (npm run dev) must NOT use "export" or all pages return 404.
  ...(process.env.NODE_ENV === "production" ? { output: "export" } : {}),
};

export default nextConfig;
