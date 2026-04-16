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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveBackendApiUrl(): string {
  const configuredUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "https://gestronomy-api-5atv.onrender.com/api";
  const normalized = trimTrailingSlash(configuredUrl);
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

const nextConfig: NextConfig = {
  // Static export disabled — Replit preview requires the Next.js dev server
  // (static export breaks routing and returns 404 for all pages in dev mode)
  allowedDevOrigins: buildAllowedDevOrigins(),

  async rewrites() {
    const backendApiUrl = resolveBackendApiUrl();
    const backendOrigin = backendApiUrl.replace(/\/api$/, "");
    return [
      {
        source: "/api/:path*",
        destination: `${backendApiUrl}/:path*`,
      },
      {
        source: "/ws/:path*",
        destination: `${backendOrigin}/ws/:path*`,
      },
    ];
  },
};

export default nextConfig;
