import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(rootDir, "public");
const distDir = join(rootDir, "dist");

function normalizeApiBaseUrl(value) {
  const raw = String(value || "").trim();
  const fallback = "http://localhost:8000/api";
  const base = raw || fallback;
  const withoutTrailing = base.replace(/\/+$/, "");
  if (withoutTrailing.endsWith("/api")) {
    return withoutTrailing;
  }
  return `${withoutTrailing}/api`;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const apiBaseUrl = normalizeApiBaseUrl(
  process.env.PUBLIC_API_BASE_URL ||
    process.env.DAS_ELB_REST_API_URL ||
    process.env.VITE_API_URL,
);

const restaurantId = parsePositiveInt(
  process.env.PUBLIC_RESTAURANT_ID ||
    process.env.DAS_ELB_REST_RESTAURANT_ID ||
    process.env.VITE_RESTAURANT_ID,
);

const runtimeConfig = `window.API_BASE_URL=${JSON.stringify(apiBaseUrl)};
window.RESTAURANT_ID=${restaurantId === null ? "null" : restaurantId};
window.DAS_ELB_REST_CONFIG=${JSON.stringify({
  apiBaseUrl,
  restaurantId,
})};
`;

rmSync(distDir, { recursive: true, force: true });
cpSync(publicDir, distDir, { recursive: true });
mkdirSync(join(distDir, "assets"), { recursive: true });
writeFileSync(join(distDir, "assets", "config.js"), runtimeConfig, "utf8");

if (!existsSync(join(distDir, "healthz"))) {
  writeFileSync(join(distDir, "healthz"), "ok\n", "utf8");
}

const packageJson = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
writeFileSync(
  join(distDir, "build-info.json"),
  JSON.stringify(
    {
      name: packageJson.name,
      apiBaseUrl,
      restaurantId,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
  "utf8",
);
