/* The Dirty Gringo — service worker.
   Menu-safe by design:
   - HTML pages use NETWORK-FIRST, so an online visitor always gets fresh prices;
     the cache is only a fallback when the device is offline.
   - Static assets (CSS, fonts, icons) use STALE-WHILE-REVALIDATE: served instantly
     from cache, then refreshed in the background for next time.
   Bump VERSION to force every client onto a clean cache after a deploy. */
const VERSION = 'dg-v1';
const CACHE = VERSION + '-cache';
const PRECACHE = [
  '/', '/hub', '/menu',
  '/styles.css', '/fonts.css', '/manifest.webmanifest',
  '/icons/icon-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // same-origin only (no third-party deps anyway)

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // NETWORK-FIRST — fresh prices online, cached copy only when offline.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match(req)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  // STALE-WHILE-REVALIDATE for assets.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});
