// Service Worker per PWA OtterCare
const CACHE_NAME = 'ottercare-v4';
const urlsToCache = [
  '/OtterCare/',
  '/OtterCare/index.html',
  '/OtterCare/style.css',
  '/OtterCare/manifest.json',
  '/OtterCare/icon.svg',
  '/OtterCare/dist/index.js',
  '/OtterCare/dist/ui.js',
  '/OtterCare/dist/state.js',
  '/OtterCare/dist/audio.js',
  '/OtterCare/dist/minigame.js',
  '/OtterCare/dist/gameActions.js',
  '/OtterCare/dist/analytics.js',
  '/OtterCare/dist/types.js'
];

// Installazione - cache delle risorse
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Attivazione - pulizia cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch - serve da cache, fallback a network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
      )
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
