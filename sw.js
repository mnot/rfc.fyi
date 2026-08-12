/* Every cache this worker owns is named from here, so the reaper can tell
   ours from transformers.js's, which holds the ~32 MiB model. */
const CACHE_PREFIX = 'rfcfyi-'
/* Index content, kept apart from the site cache so a deploy does not discard
   it: the URLs carry their build, so it is never wrong, only unused. */
const INDEX_CACHE = 'rfcfyi-index'
/* Which caches the active worker is serving from. Read by an installing
   worker, which must not reap those; see reapOrphans. */
const ACTIVE_CACHE = 'rfcfyi-active'
const ACTIVE_KEY = '/__active-caches'
/* Hosts where a stale asset is a bug rather than a feature. */
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0'])
/* Both stamped by bin/stamp-sw.py at build time, each with a hash of what it
   holds. The site cache is the version marker: its contents are served
   cache-first, so a build reaches a browser by installing a worker under a
   new name and never by a file changing under the others.

   vendor/ is named separately because it moves on a different clock -- only
   when TRANSFORMERS_VERSION does. Sharing the site's name would throw away
   22 MiB, most of it the wasm, every time a stylesheet changed. */
const CACHE_NAME = 'rfcfyi-vunstamped'
const VENDOR_CACHE = 'rfcfyi-vendor-unstamped'
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

/* Delete every cache of ours that nothing named in `keep` is using. */
async function reap (keep) {
  const names = await caches.keys()
  return Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && !keep.has(name))
      .map((name) => {
        console.log('[SW] Removing old cache', name)
        return caches.delete(name)
      })
  )
}

/* Caches left by installs that never activated.
 *
 * Without skipWaiting this worker can sit behind a live page indefinitely,
 * and every deploy in the meantime installs another worker that pre-caches
 * another ~4 MiB -- var/rfcs.json and var/refs.json are most of it -- and
 * then gets superseded before it can reap anything. Enough of those and the
 * origin is over quota, which costs the model and the index too.
 *
 * The one cache an installing worker must not touch is the one the active
 * worker is serving from, so the active worker records it. No record means
 * something older than this scheme is in charge; reap nothing rather than
 * pull the cache out from under a page that is running.
 */
async function reapOrphans () {
  const mark = await caches.open(ACTIVE_CACHE)
  const held = await mark.match(ACTIVE_KEY)
  if (!held) return
  return reap(new Set([
    CACHE_NAME, VENDOR_CACHE, INDEX_CACHE, ACTIVE_CACHE, ...await held.json()
  ]))
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    console.log('[SW] Pre-caching static and data assets')
    /* cache: 'reload' bypasses the HTTP cache. Pages serves everything with
       max-age=600, so a worker installing in the minutes after a deploy
       would otherwise fill its new cache from the previous build's
       responses -- and being cache-first, it would then keep them. The
       clients most likely to install just then are the ones reloading
       because the site looks broken. */
    await cache.addAll(
      [...STATIC_ASSETS, ...DATA_ASSETS].map(
        (path) => new Request(path, { cache: 'reload' })
      )
    )
    // Only once this worker has a cache worth keeping: a reap before a
    // failed addAll would strip the worker still waiting to activate.
    await reapOrphans()
  })())
})

/* No skipWaiting: this worker takes over only once the pages the previous
   one controls have gone. Activating underneath a live page would replace
   the cache it is running out of, and search.js is imported lazily -- so a
   page that loaded one build would fetch that module from the next. The cost
   is that an update lands on a later visit rather than on a reload. */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CACHE_NAME, VENDOR_CACHE, INDEX_CACHE, ACTIVE_CACHE])
    // Before reaping, so a failure between the two leaves the record naming
    // caches that still exist rather than ones that no longer do.
    const mark = await caches.open(ACTIVE_CACHE)
    await mark.put(ACTIVE_KEY, new Response(JSON.stringify([CACHE_NAME, VENDOR_CACHE])))
    await reap(keep)
  })())
})

/* Cache-first, keeping what it fetches. For everything under a stamped name
   the contents are fixed for the life of that name, so there is nothing a
   revalidation could correct -- only a chance to leave the cache holding two
   builds at once. */
function cacheFirst (event, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const hit = await cache.match(event.request)
    if (hit) return hit
    const fresh = await fetch(event.request)
    /* Hold the event open for the write. respondWith settles the moment the
       response is returned, and a worker with nothing else pending can be
       terminated -- which for the 21 MiB wasm means fetching it again, and
       again. */
    if (fresh.ok) event.waitUntil(cache.put(event.request, fresh.clone()))
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
  // the site cache, which changes with every build -- a stylesheet edit
  // would otherwise discard a warmed index. Cache-first with no revalidation
  // is safe because the URLs carry their build; search.js drops entries from
  // builds that are no longer current.
  if (url.pathname.startsWith('/index/')) {
    event.respondWith(cacheFirst(event, INDEX_CACHE))
    return
  }

  if (url.pathname.startsWith('/vendor/')) {
    event.respondWith(cacheFirst(event, VENDOR_CACHE))
    return
  }

  // The front page, matched by name rather than by URL. cache.match is
  // exact-URL, so a shared link like /?search=tls misses the cached '/' and
  // would pair markup fetched now against scripts cached from an earlier
  // build. Only these two paths: index.html loads client.js, style.css and
  // manifest.json relatively, so answering /anything/ with it would give a
  // shell whose every asset 404s, where the site used to serve a 404.
  if (event.request.mode === 'navigate' &&
      (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const hit = await cache.match('/index.html')
        return hit || fetch(event.request)
      })
    )
    return
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(event, CACHE_NAME))
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

  // Anything else the origin serves is not ours to cache. Left to the
  // network, which is also what answers for a path the site does not have.
})
