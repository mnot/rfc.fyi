const CACHE_PREFIX = 'rfcfyi-v'
/* Index content, kept apart from the site cache so a deploy does not discard
   it. Not prefixed with CACHE_PREFIX, so activate's reaper leaves it alone. */
const INDEX_CACHE = 'rfcfyi-index'
/* Hosts where a stale asset is a bug rather than a feature. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])
/* Stamped by bin/stamp-sw.py at build time with a hash of everything this
   worker holds. It is the site's only version marker: the static set is
   served cache-first, so a build reaches a browser by installing a worker
   under a new name and never by a file changing under the others. */
const CACHE_NAME = 'rfcfyi-vunstamped'
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static and data assets')
      /* cache: 'reload' bypasses the HTTP cache. Pages serves everything
         with max-age=600, so a worker installing in the minutes after a
         deploy would otherwise fill its new cache from the previous build's
         responses -- and being cache-first, it would then keep them. The
         clients most likely to install just then are the ones reloading
         because the site looks broken. */
      return cache.addAll(
        [...STATIC_ASSETS, ...DATA_ASSETS].map(
          (path) => new Request(path, { cache: 'reload' })
        )
      )
    })
  )
})

/* No skipWaiting: this worker takes over only once the pages the previous
   one controls have gone. Activating underneath a live page would replace
   the cache it is running out of, and search.js is imported lazily -- so a
   page that loaded one build would fetch that module from the next. The
   cost is that an update lands on a later visit rather than on a reload. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      // Only our own superseded caches. transformers.js keeps the ~32 MiB
      // model in a cache of its own, and CACHE_NAME changes with every
      // build, so reaping anything unfamiliar would discard it.
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Removing old cache', name)
            return caches.delete(name)
          })
      )
    })
  )
})

/* Cache-first, putting what it fetches. For everything under CACHE_NAME the
   contents are fixed for the life of the name, so there is nothing a
   revalidation could correct -- only a chance to leave the cache holding
   two builds at once. */
function cacheFirst (cacheName, request) {
  return caches.open(cacheName).then(async (cache) => {
    const hit = await cache.match(request)
    if (hit) return hit
    const fresh = await fetch(request)
    if (fresh.ok) cache.put(request, fresh.clone())
    return fresh
  })
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Same-origin only. The embedding model is fetched cross-origin from a
  // CDN and transformers.js already caches it in a cache of its own, so
  // handling it here would store ~32 MB twice. Letting it pass through also
  // keeps opaque-response padding out of our quota.
  if (url.origin !== self.location.origin) return

  // Network first on localhost, with the cache only as a fallback. In
  // development a cached asset is the previous version of a file you just
  // changed, so a fix looks like it did nothing.
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
  // CACHE_NAME, which changes with every build -- a stylesheet edit would
  // otherwise discard a warmed index. Cache-first with no revalidation is
  // safe because the URLs carry their build; search.js drops entries from
  // builds that are no longer current.
  if (url.pathname.startsWith('/index/')) {
    event.respondWith(cacheFirst(INDEX_CACHE, event.request))
    return
  }

  // Navigations are matched against index.html by name. cache.match is
  // exact-URL, so a shared link like /?q=tls misses the cached '/' and would
  // pair markup fetched now with scripts cached from an earlier build.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const hit = await cache.match('/index.html')
        return hit || fetch(event.request)
      })
    )
    return
  }

  // Data is the one thing that moves without the code moving: var/*.json is
  // rebuilt daily, and a build behind is a lag rather than a break, so it is
  // worth serving stale rather than paying for the network on every paint.
  if (DATA_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request)
        const fetched = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone())
          return response
        }).catch(() => cached)
        // Without this the worker can be terminated as soon as the cached
        // response is returned and the put never runs, which had the
        // revalidate half of stale-while-revalidate firing only sometimes.
        // respondWith is still pending here, so the event is live and
        // waitUntil is allowed.
        event.waitUntil(fetched)
        return cached || fetched
      })
    )
    return
  }

  // Everything else the site serves: the static set, and vendor/, whose
  // bytes the cache name covers even though its filenames do not carry a
  // version.
  event.respondWith(cacheFirst(CACHE_NAME, event.request))
})
