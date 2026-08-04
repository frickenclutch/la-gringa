/* The Dirty Gringo — service worker.
   Menu-safe by design:
   - HTML pages use NETWORK-FIRST, so an online visitor always gets fresh prices;
     the cache is only a fallback when the device is offline.
   - Static assets (CSS, fonts, icons, JS, data) use STALE-WHILE-REVALIDATE.
   Bump VERSION to force every client onto a clean cache after a deploy. */
const VERSION = 'dg-v18';
const CACHE = VERSION + '-cache';
const PRECACHE = [
  '/', '/hub', '/menu',
  '/styles.css', '/fonts.css',
  '/manifest.webmanifest', '/manifest-menu.webmanifest',
  '/icons/icon-192.png',
  '/js/sw-register.js', '/js/menu-install.js', '/js/haptics.js', '/js/i18n.js',
  '/js/gate-game.js', '/js/menu-book.js', '/js/menu-board-ui.js', '/js/menu-live.js',
  '/data/site.json',
  '/data/recipes.json',
  '/data/menu-board.json',
  '/data/i18n.json'
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
  if (url.origin !== self.location.origin) return;

  // Never cache the reward API
  if (url.pathname.startsWith('/api/')) return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
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
