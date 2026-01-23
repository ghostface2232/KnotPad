const CACHE_VERSION = 'v15.6.2';
const CACHE_NAME = 'knotpad-' + CACHE_VERSION;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './fonts/SFKR-Regular.otf',
  './fonts/SFKR-Medium.otf',
  './fonts/SFKR-Bold.otf',
  './js/app.js',
  './js/connections.js',
  './js/constants.js',
  './js/events-bus.js',
  './js/events.js',
  './js/items.js',
  './js/state.js',
  './js/storage.js',
  './js/ui.js',
  './js/utils.js',
  './js/viewport.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keyList) => Promise.all(
        keyList.filter((key) => key.startsWith('knotpad-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
