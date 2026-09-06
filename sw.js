const CACHE_NAME = 'ganfpu-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './ganfpu.html',
  './style.css',
  './app.js',
  './normal-mode.js',
  './grill-controller.js',
  './free-api.js',
  './history.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './data/i18n.json',
  './data/templates.json',
];

// Install: pre-cache only known, existing static assets.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: remove every cache belonging to an older GANFPU version.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

// Fetch: network-first for same-origin resources.
// This prevents stale JS/CSS/HTML from silently surviving a deployment while
// retaining an offline fallback when the network is unavailable.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const cloned = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned))
          );
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        })
      )
  );
});
