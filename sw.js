const CACHE_NAME = 'rfcfyi-v1773716340'
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
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Removing old cache', cacheName)
              return caches.delete(cacheName)
            }
          })
        )
      })
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

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
