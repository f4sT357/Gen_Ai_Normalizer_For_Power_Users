const CACHE_NAME = 'promptforge2-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/prompt-forge2.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/data/i18n.json',
  '/data/templates.json',
  '/data/templates/web-research.md',
  '/data/templates/business-email.md',
  '/data/templates/minutes.md',
  '/data/templates/decision-making.md',
  '/data/templates/blog-post.md',
  '/data/templates/rewrite.md',
  '/data/templates/sns-post.md',
  '/data/templates/translation.md',
  '/data/templates/explanation.md',
  '/data/templates/brainstorming.md',
  '/data/templates/analysis.md',
  '/data/templates/faq.md',
];

// Install: Pre-cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch: Cache-first strategy
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      // If not in cache, fetch from network and cache the response
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const cloned = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        return response;
      });
    }).catch(() => {
      // Fallback for navigation requests if offline
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
    })
  );
});
