const CACHE_PREFIX = 'rfcfyi-v'
<<<<<<< HEAD
const CACHE_NAME = 'rfcfyi-v1786354013'
=======
/* Hosts where a stale asset is a bug rather than a feature. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])
const CACHE_NAME = 'rfcfyi-v1786352179'
>>>>>>> 3b08043 (Serve fresh assets on localhost; reap caches without a bare map)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/client.js',
  '/data.js',
  '/util.js',
  '/style.css',
  '/rfcfyi.png',
  '/manifest.json'
]

const DATA_ASSETS = [
  '/var/tags.json',
  '/var/rfcs.json',
  '/var/refs.json'
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static and data assets')
      return cache.addAll([...STATIC_ASSETS, ...DATA_ASSETS])
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        // Only reap our own superseded caches. This origin also holds
        // caches we do not own -- transformers.js keeps the ~32 MiB
        // embedding model in one of its own -- and CACHE_NAME is bumped on
        // every deploy by `make pwa-update`. A blanket "delete anything
        // that is not me" would throw that model away once per release.
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Removing old cache', name)
              return caches.delete(name)
            })
        )
      })
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Same-origin only. The embedding model is fetched cross-origin from a
  // CDN and transformers.js already caches it in a cache of its own, so
  // handling it here would store ~32 MB twice. Letting it pass through also
  // keeps opaque-response padding out of our quota.
  if (url.origin !== self.location.origin) return

  // On localhost, network first: the edit you just made wins, and the cache
  // is only a fallback for when the dev server is down. Stale-while-
  // revalidate is right in production and actively misleading in
  // development -- it serves the previous version of a file you just
  // changed, so a fix looks like it did nothing and the next reload
  // silently "fixes" it. Bumping CACHE_NAME is the production answer and it
  // does not happen while you are editing.
  if (DEV_HOSTS.has(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const fresh = await fetch(event.request, { cache: 'no-store' })
          if (fresh.ok) cache.put(event.request, fresh.clone())
          return fresh
        } catch (err) {
          const cached = await cache.match(event.request)
          if (cached) return cached
          throw err
        }
      })
    )
    return
  }

  // Handle data and static assets with Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(event.request)
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone())
        }
        return networkResponse
      }).catch(() => {
        return cachedResponse
      })
      return cachedResponse || fetchPromise
    })
  )
})
