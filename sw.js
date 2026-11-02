/**
 * Service Worker for SafeRoute PWA
 * Network-First Strategy ensures updated authentication and safety scripts are always live
 */
const CACHE_NAME = 'saferoute-v5-live';
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
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate Event: Cleanup older caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Always prioritize Network for API, Supabase, and fresh code
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // 1. Bypass cache for Supabase, Backend API, Map tiles, and dynamic routing
  if (
    url.includes('supabase.co') ||
    url.includes('localhost:8080') ||
    url.includes('/api/') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('project-osrm.org') ||
    url.includes('komoot.io') ||
    url.includes('nominatim.openstreetmap.org')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Network-First strategy: fetch latest code, update cache, fall back to cache only when offline
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
