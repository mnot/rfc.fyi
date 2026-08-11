const CACHE_PREFIX = 'rfcfyi-v'
/* Index content, kept apart from the site cache so a deploy does not discard
   it. Not prefixed with CACHE_PREFIX, so activate's reaper leaves it alone. */
const INDEX_CACHE = 'rfcfyi-index'
/* Hosts where a stale asset is a bug rather than a feature. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])
const CACHE_NAME = 'rfcfyi-v1786354013'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/client.js',
  '/data.js',
  '/util.js',
  '/search.js',
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
        // Only our own superseded caches. transformers.js keeps the ~32 MiB
        // model in a cache of its own, and CACHE_NAME is bumped every
        // deploy, so reaping anything unfamiliar would discard it.
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

  // Network first on localhost, with the cache only as a fallback. In
  // development stale-while-revalidate serves the previous version of a file
  // you just changed, so a fix looks like it did nothing.
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

  // Which build the site is publishing. The only thing under /index/ that is
  // network-first: a stale pointer names a directory the site no longer has,
  // so every fetch after it would 404. Cached as an offline fallback.
  if (url.pathname === '/index/current.json') {
    event.respondWith(
      caches.open(INDEX_CACHE).then(async (cache) => {
        try {
          const fresh = await fetch(event.request, { cache: 'no-store' })
          if (fresh.ok) cache.put(event.request, fresh.clone())
          return fresh
        } catch (err) {
          const hit = await cache.match(event.request)
          if (hit) return hit
          throw err
        }
      })
    )
    return
  }

  // Index content is immutable and expensive to refetch, so it stays out of
  // CACHE_NAME, which `make pwa-update` bumps on every deploy -- a stylesheet
  // change would otherwise discard a warmed index. Cache-first with no
  // revalidation is safe because the URLs carry their build; search.js drops
  // entries from builds that are no longer current.
  if (url.pathname.startsWith('/index/')) {
    event.respondWith(
      caches.open(INDEX_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request)
        if (hit) return hit
        const fresh = await fetch(event.request)
        if (fresh.ok) cache.put(event.request, fresh.clone())
        return fresh
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
