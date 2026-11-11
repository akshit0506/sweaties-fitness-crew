// SweaTies service worker.
//
// Scope, deliberately: cache the static app shell (JS/CSS bundles, fonts,
// icons, manifest) so the installed app launches instantly and survives
// being offline at all. Do NOT cache Supabase requests (cross-origin,
// skipped entirely below) or personalized page HTML (this app's pages are
// all force-dynamic and per-session; caching full navigation responses
// would risk one member's device serving a stale snapshot of
// another's data on a shared device — not worth it for what's explicitly
// out of scope anyway: "offline workout syncing is not required"). Writes
// while offline aren't queued — they fail immediately and surface through
// the existing rollback + error Toast in AppStateProvider, same as any
// other failed write.
//
// Bump this on any change to what's precached below — activate() uses it
// to evict every older cache in one pass.
const CACHE_VERSION = "sweaties-v3";

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icon.png",
  "/apple-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.png" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFallingBackToOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_VERSION);
    return (await cache.match("/offline")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever handle same-origin GET requests. Everything else (all
  // Supabase reads/writes, any cross-origin call, any non-GET request)
  // passes straight through untouched — this is what guarantees writes are
  // never silently queued or altered while offline; they just fail
  // naturally, exactly as they would with no service worker at all.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFallingBackToOffline(request));
  }
});
