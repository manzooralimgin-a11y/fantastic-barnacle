import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const outDir = path.join(projectRoot, "out");

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
    "</script>",
    "<script src=\"/assets/api-integration.js\"></script>",
    "<script src=\"/assets/landing-performance.js\" defer></script>",
    "<script src=\"/assets/sw-register.js\" defer></script>",
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

  if (!result.includes("das-elb-runtime-config")) {
    result = result.replace(
      "</head>",
      [
        "<script id=\"das-elb-runtime-config\">",
        `window.API_BASE_URL=${JSON.stringify(apiBaseUrl)};`,
        `window.HOTEL_PROPERTY_ID=${JSON.stringify(hotelPropertyId)};`,
        `window.RESTAURANT_ID=${JSON.stringify(restaurantId)};`,
        "</script>",
        "</head>",
      ].join(""),
    );
  }

  const scripts = [
    "<script src=\"/assets/api-integration.js\"></script>",
    "<script src=\"/assets/landing-performance.js\" defer></script>",
    "<script src=\"/assets/sw-register.js\" defer></script>",
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
