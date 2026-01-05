// Service Worker per PWA Pebble
const CACHE_NAME = 'pebble-v4';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-16x16.png',
  './icons/favicon-32x32.png',
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
  './src/assets/otter/otter_bath-hatScarfSunglasses.png',
  './src/assets/menu-icons/icon-food.png',
  './src/assets/menu-icons/icon-food@2x.png',
  './src/assets/menu-icons/icon-food@3x.png',
  './src/assets/menu-icons/icon-games.png',
  './src/assets/menu-icons/icon-games@2x.png',
  './src/assets/menu-icons/icon-games@3x.png',
  './src/assets/menu-icons/icon-health.png',
  './src/assets/menu-icons/icon-health@2x.png',
  './src/assets/menu-icons/icon-health@3x.png',
  './src/assets/menu-icons/icon-home.png',
  './src/assets/menu-icons/icon-home@2x.png',
  './src/assets/menu-icons/icon-home@3x.png',
  './src/assets/menu-icons/icon-hygiene.png',
  './src/assets/menu-icons/icon-hygiene@2x.png',
  './src/assets/menu-icons/icon-hygiene@3x.png',
  './src/assets/menu-icons/icon-shop.png',
  './src/assets/menu-icons/icon-shop@2x.png',
  './src/assets/menu-icons/icon-shop@3x.png',
  './src/assets/audio/ambient-birds.webm',
  './src/assets/audio/ambient-fireplace.webm',
  './src/assets/audio/ambient-river.webm',
  './src/assets/audio/feed.webm',
  './src/assets/audio/happy.webm',
  './src/assets/audio/splash.webm'
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
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Network-first per documenti e asset critici (html/js/css/config)
  const isDocument = request.mode === 'navigate';
  const isCriticalAsset = ['.html', '.js', '.css'].some(ext => url.pathname.endsWith(ext)) || url.pathname.endsWith('config.js');
  const isServiceWorker = url.pathname.endsWith('sw.js');

  if (isServiceWorker) {
    event.respondWith(fetch(request));
    return;
  }

  if (isDocument || isCriticalAsset) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response && response.status === 200) {
    cache.put(request, response.clone());
  }
  return response;
}

if (event.data && event.data.type === 'SKIP_WAITING') {
  self.skipWaiting();
}
});

// Gestione Push Notifications (Real System Notifications)
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Pebble ha bisogno di te!';
  const options = {
    body: data.body || 'C\'è qualcosa di nuovo da scoprire.',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    data: { url: data.url || './' }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      // Se c'è già una finestra aperta, focussala
      for (let client of windowClients) {
        if (client.url === '/' || client.url.includes('index.html')) {
          return client.focus();
        }
      }
      // Altrimenti aprine una nuova
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});
