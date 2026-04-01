import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const outDir = path.join(projectRoot, "out");
const assetVersion =
  process.env.DAS_ELB_ASSET_VERSION ||
  Math.max(
    fs.statSync(path.join(publicDir, "overrides.css")).mtimeMs,
    fs.statSync(path.join(publicDir, "assets", "landing-performance.js")).mtimeMs,
    fs.statSync(path.join(publicDir, "assets", "sw-register.js")).mtimeMs,
    fs.statSync(path.join(publicDir, "sw.js")).mtimeMs,
  )
    .toString(36)
    .replace(/\./g, "");

const apiBaseUrl = process.env.PUBLIC_API_BASE_URL || "https://gestronomy-api.onrender.com/api";
const hotelPropertyId = Number.parseInt(process.env.PUBLIC_HOTEL_PROPERTY_ID || "546", 10) || 546;
const restaurantId = Number.parseInt(process.env.PUBLIC_RESTAURANT_ID || "4240", 10) || 4240;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(sourceDir, targetDir) {
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function buildInjectedScripts() {
  return [
    "<script id=\"das-elb-runtime-config\">",
    `window.API_BASE_URL=${JSON.stringify(apiBaseUrl)};`,
    `window.HOTEL_PROPERTY_ID=${JSON.stringify(hotelPropertyId)};`,
    `window.RESTAURANT_ID=${JSON.stringify(restaurantId)};`,
    `window.DAS_ELB_ASSET_VERSION=${JSON.stringify(assetVersion)};`,
    "</script>",
    `<script src="/assets/api-integration.js?v=${assetVersion}"></script>`,
    `<script src="/assets/landing-performance.js?v=${assetVersion}" defer></script>`,
    `<script src="/assets/sw-register.js?v=${assetVersion}" defer></script>`,
  ].join("");
}

function stripNextFontAssetReferences(html) {
  if (!html) {
    return html;
  }

  return html
    .replace(/<link rel="preload" as="font"[^>]+href="\/_next\/static\/media\/[^"]+"[^>]*>/g, "")
    .replace(/:HL\[[^\]]+\](?:\\n|\n)?/g, "");
}

function stripNextFontFaceBlocks(css) {
  if (!css) {
    return css;
  }

  return css.replace(/@font-face\{[^}]*src:url\(\/_next\/static\/media\/[^)]+\)[^}]*\}/g, "");
}

function injectScriptsIntoHtml(html) {
  let result = stripNextFontAssetReferences(html);
  const criticalStyleId = "das-elb-critical-hotfix";

  result = result
    .replace(/href="\/overrides\.css(?:\?v=[^"]*)?"/g, `href="/overrides.css?v=${assetVersion}"`)
    .replace(/src="\/assets\/api-integration\.js(?:\?v=[^"]*)?"/g, `src="/assets/api-integration.js?v=${assetVersion}"`)
    .replace(/src="\/assets\/landing-performance\.js(?:\?v=[^"]*)?"/g, `src="/assets/landing-performance.js?v=${assetVersion}"`)
    .replace(/src="\/assets\/sw-register\.js(?:\?v=[^"]*)?"/g, `src="/assets/sw-register.js?v=${assetVersion}"`);

  if (!result.includes("das-elb-runtime-config")) {
    result = result.replace(
      "</head>",
      [
        "<script id=\"das-elb-runtime-config\">",
        `window.API_BASE_URL=${JSON.stringify(apiBaseUrl)};`,
        `window.HOTEL_PROPERTY_ID=${JSON.stringify(hotelPropertyId)};`,
        `window.RESTAURANT_ID=${JSON.stringify(restaurantId)};`,
        `window.DAS_ELB_ASSET_VERSION=${JSON.stringify(assetVersion)};`,
        "</script>",
        "</head>",
      ].join(""),
    );
  }

  const scripts = [
    `<script src="/assets/api-integration.js?v=${assetVersion}"></script>`,
    `<script src="/assets/landing-performance.js?v=${assetVersion}" defer></script>`,
    `<script src="/assets/sw-register.js?v=${assetVersion}" defer></script>`,
  ];

  for (const tag of scripts) {
    const srcMatch = tag.match(/src="([^"]+)"/);
    const src = srcMatch ? srcMatch[1] : "";
    if (src && result.includes(src)) {
      continue;
    }
    if (result.includes("</head>")) {
      result = result.replace("</head>", `${tag}</head>`);
    } else if (result.includes("</body>")) {
      result = result.replace("</body>", `${tag}</body>`);
    } else {
      result += tag;
    }
  }

  if (!result.includes(criticalStyleId)) {
    result = result.replace(
      "</head>",
      [
        `<style id="${criticalStyleId}">`,
        "#tagungen{background:var(--color-bg-alt)!important;}",
        "#tagungen>.absolute.inset-0{background:none!important;opacity:0!important;}",
        "#events{background:var(--color-bg-alt)!important;}",
        "#events>.absolute,#events::before,#events::after{background:none!important;opacity:0!important;}",
        "#events div.rounded-3xl.overflow-hidden.border.border-earth-300\\/20.shadow-xl.shadow-black\\/10,#events div.relative.rounded-3xl.overflow-hidden.border.border-base-950\\/20.shadow-2xl.shadow-black\\/5{background:rgb(26,47,36)!important;background-image:none!important;}",
        "#events div.rounded-3xl.overflow-hidden.border.border-earth-300\\/20.shadow-xl.shadow-black\\/10 *,#events div.relative.rounded-3xl.overflow-hidden.border.border-base-950\\/20.shadow-2xl.shadow-black\\/5 *{color:var(--color-text-light)!important;}",
        "</style>",
        "</head>",
      ].join(""),
    );
  }

  return result;
}

function processHtmlFiles(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      processHtmlFiles(entryPath);
      continue;
    }
    if (path.extname(entry.name).toLowerCase() !== ".html") {
      continue;
    }
    const html = fs.readFileSync(entryPath, "utf8");
    fs.writeFileSync(entryPath, injectScriptsIntoHtml(html), "utf8");
  }
}

function processCssFiles(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      processCssFiles(entryPath);
      continue;
    }
    if (path.extname(entry.name).toLowerCase() !== ".css") {
      continue;
    }
    const css = fs.readFileSync(entryPath, "utf8");
    fs.writeFileSync(entryPath, stripNextFontFaceBlocks(css), "utf8");
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
copyDir(publicDir, outDir);
processHtmlFiles(outDir);
processCssFiles(outDir);

console.log(`Built static site in ${outDir}`);
