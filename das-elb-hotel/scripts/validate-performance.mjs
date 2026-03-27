import { createRequire } from "node:module";

const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { chromium } = require("playwright");

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
}

const targetUrl = getArg("url", "http://127.0.0.1:3000/");
const viewportWidth = Number.parseInt(getArg("width", "1440"), 10) || 1440;
const viewportHeight = Number.parseInt(getArg("height", "1200"), 10) || 1200;

const consoleErrors = [];
const pageErrors = [];
const responses = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: viewportWidth, height: viewportHeight },
});

await page.addInitScript(() => {
  window.__landingMetrics = {
    lcp: 0,
    cls: 0,
  };

  new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
      window.__landingMetrics.lcp = Math.max(window.__landingMetrics.lcp, entry.startTime || 0);
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });

  new PerformanceObserver((entryList) => {
    for (const entry of entryList.getEntries()) {
      if (!entry.hadRecentInput) {
        window.__landingMetrics.cls += entry.value || 0;
      }
    }
  }).observe({ type: "layout-shift", buffered: true });
});

page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

page.on("pageerror", (error) => {
  pageErrors.push(String(error));
});

page.on("response", async (response) => {
  responses.push({
    url: response.url(),
    status: response.status(),
    contentType: response.headers()["content-type"] || "",
    contentLength: Number(response.headers()["content-length"] || "0") || 0,
  });
});

await page.goto(targetUrl, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const initialMetrics = await page.evaluate(() => {
  const navigation = performance.getEntriesByType("navigation")[0];
  const videos = Array.from(document.querySelectorAll("video")).map((video) => ({
    currentSrc: video.currentSrc,
    poster: video.getAttribute("poster"),
    controls: video.controls || video.hasAttribute("controls"),
    autoplay: video.autoplay,
    muted: video.muted,
    loop: video.loop,
    playsInline: video.playsInline || video.hasAttribute("playsinline"),
    preload: video.preload,
    paused: video.paused,
    managedVideo: video.dataset.managedVideo || "",
  }));
  const images = Array.from(document.querySelectorAll("img")).map((image) => ({
    src: image.currentSrc || image.getAttribute("src") || "",
    loading: image.getAttribute("loading") || "",
    fetchpriority: image.getAttribute("fetchpriority") || "",
    width: image.getAttribute("width") || "",
    height: image.getAttribute("height") || "",
  }));

  return {
    title: document.title,
    navCount: document.querySelectorAll("nav a").length,
    sectionCount: document.querySelectorAll("section").length,
    roomCardCount: document.querySelectorAll("[data-room-card]").length,
    videos,
    images,
    metrics: {
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd : 0,
      loadEvent: navigation ? navigation.loadEventEnd : 0,
      lcp: window.__landingMetrics ? window.__landingMetrics.lcp : 0,
      cls: window.__landingMetrics ? window.__landingMetrics.cls : 0,
    },
  };
});

const postScrollVideoState = [];
const videoCount = await page.locator("video").count();
for (let index = 0; index < videoCount; index += 1) {
  const locator = page.locator("video").nth(index);
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const state = await locator.evaluate((video) => ({
    currentSrc: video.currentSrc,
    paused: video.paused,
    managedVideo: video.dataset.managedVideo || "",
    currentTime: Number(video.currentTime.toFixed(2)),
  }));
  postScrollVideoState.push(state);
}

let serviceWorkerState = "unsupported";
try {
  serviceWorkerState = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) {
      return "unsupported";
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      return registration ? "registered" : "not-registered";
    } catch {
      return "error";
    }
  });
} catch {
  serviceWorkerState = "error";
}

await browser.close();

const summary = {
  url: targetUrl,
  viewport: {
    width: viewportWidth,
    height: viewportHeight,
  },
  consoleErrors,
  pageErrors,
  serviceWorkerState,
  initialMetrics,
  postScrollVideoState,
  network: {
    htmlStatus: responses.find((entry) => entry.contentType.includes("text/html"))?.status || 0,
    responses: responses.length,
    failed: responses.filter((entry) => entry.status >= 400).map((entry) => ({ url: entry.url, status: entry.status })),
    videoRequests: responses
      .filter((entry) => entry.contentType.includes("video/"))
      .map((entry) => ({
        url: entry.url,
        status: entry.status,
        contentLength: entry.contentLength,
      })),
  },
};

console.log(JSON.stringify(summary, null, 2));
