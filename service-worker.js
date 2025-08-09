// HTML = network-first; assets = cache-first; Gravatar = SWR.
// Now also serves 404.html on real 404s and when offline.
const CACHE = 'portfolio-v6';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './404.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 1) HTML navigations: network-first → 404 fallback → cached index → offline message
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh.status === 404) {
          const fourOhFour = await cache.match('./404.html');
          return fourOhFour || fresh;
        }
        // cache latest index for offline
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        // offline
        return (await cache.match('./index.html')) ||
               (await cache.match('./404.html')) ||
               new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  // 2) Same-origin static: cache-first with background refresh
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { cache.put(req, res.clone()); return res; });
      return cached || network;
    })());
    return;
  }

  // 3) Gravatar: stale-while-revalidate
  if (url.hostname.endsWith('gravatar.com')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    })());
  }
});
