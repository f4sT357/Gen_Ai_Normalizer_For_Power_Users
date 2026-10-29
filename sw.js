// Offline assets for the six supported languages.
// Keep template file names in sync with data/templates.json.
const CACHE_NAME = 'ganfpu-v3';
const TEMPLATE_FILES = [
  "web-research.md",
  "business-email.md",
  "minutes.md",
  "decision-making.md",
  "blog-post.md",
  "rewrite.md",
  "sns-post.md",
  "translation.md",
  "explanation.md",
  "brainstorming.md",
  "analysis.md",
  "faq.md"
];
const TEMPLATE_LANGUAGES = ["ja","en","zh","ko","es","fr"];
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './ganfpu.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './data/i18n.json',
  './data/templates.json',
  ...TEMPLATE_LANGUAGES.flatMap(lang =>
    TEMPLATE_FILES.map(file => `./data/templates/${lang}/${file}`)
  ),
];
const cacheablePaths = new Set(
  ASSETS_TO_CACHE.map(path => new URL(path, self.registration.scope).pathname)
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        // Cache Storage is shared by all apps on this origin.
        .filter(key => key.startsWith('ganfpu-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);

  // Do not intercept CDN, font, or unrelated GitHub Pages requests.
  if (requestUrl.origin !== scopeUrl.origin ||
      !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  // Navigation is network-first to avoid serving a stale security patch.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok && cacheablePaths.has(requestUrl.pathname) && !requestUrl.search) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(event.request)) || cache.match('./index.html');
      })
    );
    return;
  }

  // Only cache known application files. Never cache arbitrary same-origin GETs.
  if (!cacheablePaths.has(requestUrl.pathname) || requestUrl.search) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        if (response.ok && response.type !== 'opaque') {
          const copy = response.clone();
          event.waitUntil(cache.put(event.request, copy));
        }
        return response;
      }))
    )
  );
});
