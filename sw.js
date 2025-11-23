// Service Worker per PWA OtterCare
const CACHE_NAME = 'ottercare-v7';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon.svg',
  './dist/index.js',
  './dist/ui.js',
  './dist/state.js',
  './dist/audio.js',
  './dist/minigame.js',
  './dist/gameActions.js',
  './dist/analytics.js',
  './dist/types.js',
  './src/assets/otter/otter_neutral.png',
  './src/assets/otter/otter_happy.png',
  './src/assets/otter/otter_sad.png',
  './src/assets/otter/otter_sleepy.png',
  './src/assets/otter/otter_eat.png',
  './src/assets/otter/otter_bath.png',
  './src/assets/otter/otter_neutral-hat.png',
  './src/assets/otter/otter_neutral-hatScarf.png',
  './src/assets/otter/otter_neutral-hatScarfSunglasses.png',
  './src/assets/otter/otter_happy-hat.png',
  './src/assets/otter/otter_happy-hatScarf.png',
  './src/assets/otter/otter_happy-hatScarfSunglasses.png',
  './src/assets/otter/otter_sad-hat.png',
  './src/assets/otter/otter_sad-hatScarf.png',
  './src/assets/otter/otter_sad-hatScarfSunglasses.png',
  './src/assets/otter/otter_sleepy-hat.png',
  './src/assets/otter/otter_sleepy-hatScarf.png',
  './src/assets/otter/otter_sleepy-hatScarfSunglasses.png',
  './src/assets/otter/otter_eat-hat.png',
  './src/assets/otter/otter_eat-hatScarf.png',
  './src/assets/otter/otter_eat-hatScarfSunglasses.png',
  './src/assets/otter/otter_bath-hat.png',
  './src/assets/otter/otter_bath-hatScarf.png',
  './src/assets/otter/otter_bath-hatScarfSunglasses.png'
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
