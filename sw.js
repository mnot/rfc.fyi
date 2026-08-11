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

  // Which build the site is publishing. Network-first, and the only thing
  // under /index/ that is: a stale pointer names a build directory the site
  // no longer has, so every cluster fetch after it would 404. Forty bytes,
  // and it is read once per session. The cached copy is an offline fallback,
  // where the build it names is the one already in the cache anyway.
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

  // Index content is immutable and expensive to refetch, so it does not
  // belong in CACHE_NAME -- which `make pwa-update` bumps on every deploy,
  // so `activate` would delete a user's whole warmed index because someone
  // changed a stylesheet. This is the bug just fixed for the transformers.js
  // model cache, one level in.
  //
  // Cache-first with no revalidation, which is safe because these URLs carry
  // the build that produced them: /index/<build>/... never changes content,
  // it is superseded by a different path. search.js drops entries from
  // builds that are no longer current, since the page is the side that knows
  // which one is.
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
