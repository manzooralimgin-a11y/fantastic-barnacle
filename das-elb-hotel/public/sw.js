const VERSION = "das-elb-v5";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMMUTABLE_CACHE = `${VERSION}-immutable`;

const SHELL_ASSETS = [
  "/",
  "/overrides.css",
  "/favicon.svg",
  "/manifest.json",
  "/assets/api-integration.js",
  "/assets/landing-performance.js",
  "/assets/sw-register.js",
  "/images/logo.webp",
  "/images/hero-poster.webp",
  "/video/hero-poster.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE, IMMUTABLE_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) {
      return cached;
    }
    return fetch(request).then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }
      const clone = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, clone));
      return response;
    });
  });
}

function networkFirst(request, cacheName) {
  return fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => caches.match(request));
}

function staleWhileRevalidate(request, cacheName) {
  return caches.match(request).then((cached) => {
    const networkFetch = fetch(request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => null);
    return cached || networkFetch;
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, IMMUTABLE_CACHE));
    return;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (["script", "style"].includes(request.destination)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  if (["font", "image"].includes(request.destination)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});
