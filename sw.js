const CACHE_NAME = 'rfcfyi-v1773654881'
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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets')
      return cache.addAll(STATIC_ASSETS)
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Removing old cache', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Handle data files with Stale-While-Revalidate
  if (DATA_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone())
            })
            // If we have a cached response, we might want to notify the client if data changed significantly,
            // but for now we just update the cache in the background.
          }
          return networkResponse
        }).catch(() => {
          // Fallback to cache if network fails
          return cachedResponse
        })

        return cachedResponse || fetchPromise
      })
    )
    return
  }

  // Handle static assets with Cache-First
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request)
    })
  )
})
