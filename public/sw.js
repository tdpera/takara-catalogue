/* Souq Catalogue service worker.
 * - Static build files: cache first (they are content-hashed).
 * - Pages: network first, falling back to the last copy, so the capture screen opens offline.
 * - Everything else (server actions, Supabase, uploads) goes straight to the network.
 * Cached pages are deleted on sign-out. */
const VERSION = "v1";
const STATIC = "static-" + VERSION;
const PAGES = "pages-" + VERSION;
const OFFLINE_PAGES = ["/", "/add", "/rates", "/team"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== STATIC && key !== PAGES) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGES));
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        try {
          const res = await Promise.race([fetch(req), timeout(6000)]);
          if (res.ok && !res.redirected && OFFLINE_PAGES.includes(url.pathname)) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          const hit = (await cache.match(url.pathname)) || (await cache.match("/add"));
          return hit || new Response("<h1>Offline</h1><p>Open the app again when you have a connection.</p>", { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
        }
      })(),
    );
  }
});
