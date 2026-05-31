// Service worker for offline support. Pre-caches the app shell on install,
// serves cache-first thereafter. Bump CACHE_NAME on any deploy to invalidate
// the old cache (CI replaces __BUILD_ID__ with the commit SHA; works fine
// locally too since the literal name is stable).
var CACHE_NAME = "trica-cache-__BUILD_ID__";

// App shell + UI assets. Relative paths resolve against the SW location, so
// they work on a GitHub Pages subpath too. The compiled JS (tsc) and CSS (sass)
// are built by CI before deploy (they're gitignored, not committed). The font
// is self-hosted (same-origin) so it's cacheable with no cross-origin dependency.
var urlsToCache = [
  "./",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./style.min.css",
  "./ui.js",
  "./solver.js",
  "./triangle-svg.js",
  "./assets/fonts/open-sans-latin.woff2",
  "./assets/logo-192.png",
  "./assets/logo-512.png",
  "./assets/logo-192-maskable.png",
  "./assets/logo-512-maskable.png",
];

// Precache each URL individually with allSettled rather than cache.addAll.
// addAll is atomic: one 404 or network blip rejects the whole batch, the
// install promise rejects, and the SW never activates — a silent total failure.
// Per-URL add lets us cache everything that's reachable, activate regardless,
// and let the readiness check (below) report exactly which assets are missing.
function precache() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.allSettled(
      urlsToCache.map(function (url) {
        return cache.add(url);
      }),
    );
  });
}

self.addEventListener("install", function (event) {
  // precache() never rejects (allSettled), so activation always proceeds even
  // if some assets failed — that's deliberate, so the worker survives to report
  // the gap instead of failing silently like a rejected addAll would.
  event.waitUntil(precache());
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
  var request = event.request;

  // Navigation requests (launching the PWA, reloads) get special handling: if
  // the exact URL isn't cached — e.g. Android appends ?source=pwa to start_url,
  // which wouldn't byte-match the cached "./" — fall back to the cached shell so
  // the app still boots offline instead of showing the browser's offline page.
  // The "./" entry holds the index document (caching "./" stores its bytes under
  // that key — there is no separate index.html entry), so that's the target.
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(function (response) {
        return (
          response ||
          fetch(request).catch(function () {
            return caches.match("./");
          })
        );
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (response) {
      return response || fetch(request);
    }),
  );
});

// Readiness check (source of truth for the "Offline ready" indicator). The page
// asks via a MessageChannel; we check the LIVE cache against urlsToCache and
// reply { ready, missing }. Checking the live cache (not an in-memory flag)
// means the answer stays honest across a fresh worker wake-up and even after
// the browser evicts cache entries under storage pressure.
function checkOfflineReady() {
  return caches.open(CACHE_NAME).then(function (cache) {
    return Promise.all(
      urlsToCache.map(function (url) {
        return cache.match(url, { ignoreSearch: true }).then(function (match) {
          return match ? null : url;
        });
      }),
    ).then(function (results) {
      var missing = results.filter(Boolean);
      return { ready: missing.length === 0, missing: missing };
    });
  });
}

self.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "CHECK_OFFLINE_READY") return;
  var port = event.ports[0];
  if (!port) return;
  event.waitUntil(
    checkOfflineReady().then(function (result) {
      port.postMessage(result);
    }),
  );
});
