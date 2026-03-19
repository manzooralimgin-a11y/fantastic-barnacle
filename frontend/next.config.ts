import type { NextConfig } from "next";

// Allow Replit's proxied preview domains so /_next/* assets and HMR load
// correctly. Without this Next.js 16 blocks cross-origin requests from the
// picard.replit.dev preview iframe, causing a blank page / runtime crash.
function buildAllowedDevOrigins(): string[] {
  const origins: string[] = [];
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;

  if (replitDomain) {
    // Exact domain (with and without the preview port)
    origins.push(replitDomain);
    origins.push(`${replitDomain}:5000`);
    // Wildcard for all subdomains under the same TLD
    const parts = replitDomain.split(".");
    if (parts.length > 2) {
      origins.push(`*.${parts.slice(1).join(".")}`);
    }
  }

  // Broad fallback covering all Replit dev domains
  origins.push("*.picard.replit.dev");
  origins.push("*.replit.dev");

  return origins;
}

const nextConfig: NextConfig = {
  // Static export disabled — Replit preview requires the Next.js dev server
  // (static export breaks routing and returns 404 for all pages in dev mode)
  allowedDevOrigins: buildAllowedDevOrigins(),

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
