// Service worker for offline support. Pre-caches the app shell on install,
// serves cache-first thereafter. Bump CACHE_NAME on any deploy to invalidate
// the old cache (CI replaces __BUILD_ID__ with the commit SHA; works fine
// locally too since the literal name is stable).
var CACHE_NAME = "trica-cache-__BUILD_ID__";

// App shell + UI assets. Relative paths resolve against the SW location, so
// they work on a GitHub Pages subpath too. The compiled JS (tsc) and CSS (sass)
// are built by CI before deploy (they're gitignored, not committed). The font
// is self-hosted (same-origin) so cache.addAll stays atomic and truly offline.
var urlsToCache = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./style.min.css",
  "./ui.js",
  "./solver.js",
  "./triangle-svg.js",
  "./assets/fonts/open-sans-latin.woff2",
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
