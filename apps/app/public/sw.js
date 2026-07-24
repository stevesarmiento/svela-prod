const STATIC_CHUNK_CACHE = "app-static-chunks-v1";
const STATIC_ASSET_CACHE = "app-static-assets-v1";
const ACTIVE_CACHES = [STATIC_CHUNK_CACHE, STATIC_ASSET_CACHE];

function isStaticChunkRequest(requestUrl) {
  return requestUrl.origin === self.location.origin && requestUrl.pathname.startsWith("/_next/static/");
}

function isStaticAssetRequest(request, requestUrl) {
  if (requestUrl.origin !== self.location.origin) return false;

  const pathname = requestUrl.pathname.toLowerCase();
  const isFont = /\.(woff2?|ttf|otf|eot)$/.test(pathname);
  const isImage = /\.(avif|gif|ico|jpe?g|png|svg|webp)$/.test(pathname);

  return isFont || isImage;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response?.ok) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || network;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response?.ok) {
    void cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.flatMap((name) =>
          ACTIVE_CACHES.includes(name) ? [] : [caches.delete(name)],
        ),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") return;

  const requestUrl = new URL(request.url);

  if (isStaticChunkRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CHUNK_CACHE));
    return;
  }

  if (isStaticAssetRequest(request, requestUrl)) {
    event.respondWith(cacheFirst(request, STATIC_ASSET_CACHE));
  }
});
