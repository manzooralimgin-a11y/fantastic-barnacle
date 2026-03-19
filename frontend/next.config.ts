import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export disabled — Replit preview requires the Next.js dev server
  // (static export breaks routing and returns 404 for all pages in dev mode)
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${backendUrl}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
