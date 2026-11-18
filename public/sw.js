/* Souq Catalogue service worker.
 * - Static build files: cache first (they are content-hashed).
 * - Pages: network first, falling back to the last copy, so the capture screen opens offline.
 * - Catalogue images (Supabase Storage signed URLs): cache first, keyed by the file path
 *   without the signature. Files never change at a path (each has its own id), and the
 *   signature changes on every page load, so this is what makes images load once.
 * - Everything else (server actions, Supabase API, uploads) goes straight to the network.
 * Cached pages and images are deleted on sign-out. */
const VERSION = "v1";
const STATIC = "static-" + VERSION;
const PAGES = "pages-" + VERSION;
const MEDIA = "media-" + VERSION;
const MEDIA_MAX = 800; // about 30-60 MB of thumbnails and sprites
const OFFLINE_PAGES = ["/", "/add", "/rates", "/team"];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== STATIC && key !== PAGES && key !== MEDIA) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(Promise.all([caches.delete(PAGES), caches.delete(MEDIA)]));
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.pathname.includes("/storage/v1/object/sign/media/")) {
    event.respondWith(mediaFirst(req, url));
    return;
  }
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

async function mediaFirst(req, url) {
  const key = url.origin + url.pathname; // signature (?token=) left out on purpose
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(key);
  if (hit) return hit;
  // CORS mode, so the cached response isn't opaque (opaque ones count ~7 MB each against quota).
  const res = await fetch(url.href, { mode: "cors", credentials: "omit" });
  if (res.ok && (res.headers.get("content-type") || "").startsWith("image/")) {
    await cache.put(key, res.clone());
    trim(cache);
  }
  return res;
}

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys(); // oldest first
    for (let i = 0; i < keys.length - MEDIA_MAX; i++) await cache.delete(keys[i]);
  } finally {
    trimming = false;
  }
}
