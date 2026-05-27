// Service worker for offline support. Pre-caches the app shell on install,
// serves cache-first thereafter. Bump CACHE_NAME on any deploy to invalidate
// the old cache (CI replaces __BUILD_ID__ with the commit SHA; works fine
// locally too since the literal name is stable).
var CACHE_NAME = "trica-cache-__BUILD_ID__";

// Shell-only for now — UI assets will be added back when a UI is reattached.
var urlsToCache = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(urlsToCache);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function (name) {
              return name !== CACHE_NAME;
            })
            .map(function (name) {
              return caches.delete(name);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response;
      }
      return fetch(event.request).then(function (networkResponse) {
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          (networkResponse.type !== "basic" && networkResponse.type !== "cors")
        ) {
          return networkResponse;
        }
        return networkResponse;
      });
    }),
  );
});
