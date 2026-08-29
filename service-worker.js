// ---------------------------------------------------------------------------
// App-shell service worker. Scope is deliberately narrow: it makes the app
// itself (HTML/CSS/JS + its CDN module dependencies) available offline so a
// citizen can open Zen with no signal and draft a report — the report photo
// + data queue in IndexedDB (see js/offlineQueue.js) and sync automatically
// once connectivity returns. It does NOT cache Supabase API responses or
// map tiles: report data and the map itself still need a live connection,
// this only keeps the app from being a blank white screen when offline.
//
// Bump SHELL_CACHE's version suffix whenever the precache list below
// changes, so returning visitors pick up the new file set instead of a
// stale one.
// ---------------------------------------------------------------------------
const SHELL_CACHE = "zen-shell-v2";
const RUNTIME_CACHE = "zen-runtime-v1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/css/styles.css",
  "/js/main.js",
  "/js/router.js",
  "/js/state.js",
  "/js/config.js",
  "/js/auth.js",
  "/js/api.js",
  "/js/toast.js",
  "/js/timeAgo.js",
  "/js/animations.js",
  "/js/confirmDialog.js",
  "/js/imageRecognition.js",
  "/js/offlineQueue.js",
  "/js/views/shell.js",
  "/js/views/authView.js",
  "/js/views/landingView.js",
  "/js/views/mapView.js",
  "/js/views/myReportsView.js",
  "/js/views/feedbackView.js",
  "/js/views/reportModal.js",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

const RUNTIME_HOSTS = ["esm.sh", "unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Live data only, never cached: the API, storage uploads, and map tiles.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("tile.openstreetmap.org")) {
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  const isRuntimeCdn = RUNTIME_HOSTS.some((host) => url.hostname.endsWith(host));
  if (!isSameOrigin && !isRuntimeCdn) return;

  event.respondWith(cacheFirst(request, isRuntimeCdn ? RUNTIME_CACHE : SHELL_CACHE));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === "navigate") {
      const shell = await caches.open(SHELL_CACHE);
      const fallback = await shell.match("/index.html");
      if (fallback) return fallback;
    }
    throw err;
  }
}
