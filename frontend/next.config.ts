import type { NextConfig } from "next";

// Allow Replit's proxied preview domain so /_next/* assets load correctly.
// Without this, Next.js 16 blocks cross-origin HMR/asset requests from the
// picard.replit.dev preview iframe, causing a blank page / runtime crash.
const replitDomain = process.env.REPLIT_DEV_DOMAIN;
const allowedDevOrigins = replitDomain
  ? [replitDomain, `*.${replitDomain.split(".").slice(1).join(".")}`]
  : [];

const nextConfig: NextConfig = {
  // Static export disabled — Replit preview requires the Next.js dev server
  // (static export breaks routing and returns 404 for all pages in dev mode)
  allowedDevOrigins,
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
