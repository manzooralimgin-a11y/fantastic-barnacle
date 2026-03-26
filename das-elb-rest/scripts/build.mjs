import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const publicDir = path.join(appRoot, "public");
const distDir = path.join(appRoot, "dist");
const runtimeApiBaseUrl = String(
  process.env.DAS_ELB_REST_API_URL || process.env.VITE_API_URL || "",
).trim();

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });
await cp(publicDir, distDir, { recursive: true });

if (runtimeApiBaseUrl) {
  await writeFile(
    path.join(distDir, "config.js"),
    `window.__DAS_ELB_REST_CONFIG__ = Object.freeze({\n  API_BASE_URL: ${JSON.stringify(runtimeApiBaseUrl)}\n});\n`,
  );
}
