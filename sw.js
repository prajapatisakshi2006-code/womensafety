/**
 * Service Worker for SafeRoute PWA
 * Enables offline caching and app installation on Android, iOS, and PC
 */
const CACHE_NAME = 'saferoute-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './auth.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg'
];

// Install Event: Pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event: Cleanup older caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Network-first with cache fallback
self.addEventListener('fetch', (event) => {
  // Let map tiles and routing API fetch freely over network
  if (event.request.url.includes('tile.openstreetmap.org') || 
      event.request.url.includes('project-osrm.org') || 
      event.request.url.includes('komoot.io')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
