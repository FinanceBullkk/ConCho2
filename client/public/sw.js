/* TMS offline service worker — app-shell + roster caching + Background Sync.
 * Hand-rolled (no Workbox) to avoid a build-plugin dependency. Registered only
 * in production (see main.jsx). Mutations (POST/PUT/…) are never cached; the
 * offline attendance queue lives in IndexedDB and is flushed by the page. */
const CACHE = 'tms-pwa-v1';
const APP_SHELL = '/index.html';

// Cache GET responses for these API prefixes so today's sessions + rosters are
// available offline. Everything else under /api stays network-only (no stale
// auth/user data on the device).
const CACHEABLE_API = ['/api/schedules', '/api/attendance'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.add(APP_SHELL).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.status === 200) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(APP_SHELL)));
    return;
  }

  const isApi = url.pathname.startsWith('/api/');
  if (isApi && !CACHEABLE_API.some((p) => url.pathname.startsWith(p))) return; // network-only

  event.respondWith(staleWhileRevalidate(request));
});

// Background Sync wakes the SW on reconnect; the CSRF-safe POST lives in the
// page, so we just tell open clients to flush the IndexedDB queue.
self.addEventListener('sync', (event) => {
  if (event.tag === 'flush-attendance') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true })
        .then((clients) => clients.forEach((c) => c.postMessage({ type: 'flush-attendance' }))),
    );
  }
});
