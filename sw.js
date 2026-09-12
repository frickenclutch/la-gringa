/* The Dirty Gringo — service worker.
   Menu-safe by design:
   - HTML pages use NETWORK-FIRST, so an online visitor always gets fresh prices;
     the cache is only a fallback when the device is offline.
   - Static assets (CSS, fonts, icons, JS, data) use STALE-WHILE-REVALIDATE.
   Bump VERSION to force every client onto a clean cache after a deploy. */
const VERSION = 'dg-v21';
const CACHE = VERSION + '-cache';
const PRECACHE = [
  '/', '/hub', '/menu',
  '/styles.css', '/fonts.css',
  '/manifest.webmanifest', '/manifest-menu.webmanifest',
  '/icons/icon-192.png',
  '/js/sw-register.js', '/js/menu-install.js', '/js/haptics.js', '/js/i18n.js',
  '/js/gate-game.js', '/js/menu-book.js', '/js/menu-board-ui.js', '/js/menu-live.js', '/js/menu-ambience.js',
  '/data/site.json',
  '/data/recipes.json',
  '/data/menu-board.json',
  '/data/i18n.json',
  '/art/riverfront.svg'
];

// https://dirtygringonny.com is the only public address. A copy of this worker
// that finds itself installed on one of the old addresses (www., new., the
// workers.dev or pages.dev host) retires: it clears its caches, unregisters,
// and lets every request reach the network, so the site's 301 carries the
// visitor to the real domain instead of a stale cached page.
const CANONICAL_HOST = 'dirtygringonny.com';
const RETIRED = (function (host) {
  return host !== CANONICAL_HOST && (
    host.endsWith('.' + CANONICAL_HOST) ||
    host === 'la-gringas.the-dirty-gringo.workers.dev' ||
    host === 'la-gringa.pages.dev'
  );
})(self.location.hostname);

self.addEventListener('install', (event) => {
  self.skipWaiting();
  if (RETIRED) return;
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => RETIRED || k !== CACHE).map((k) => caches.delete(k)));
    if (RETIRED) {
      await self.registration.unregister();
      return;
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (RETIRED) return;
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
        // Only a real page becomes the offline copy — never a redirect or an error.
        if (fresh.ok && fresh.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
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
