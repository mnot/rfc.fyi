/* Tests for sw.js.
 *
 * The worker is not a module and has no exports, so it is evaluated with the
 * globals it expects supplied by hand. The stubs are deliberately faithful on
 * the one point the bugs turned on: Cache keys are URLs, and `match` compares
 * them whole, query string included. A stub that matched on pathname would
 * pass a worker that still had the '/?q=' hole in it.
 *
 * Request and Response are the real ones -- Node has had them global since
 * 18 -- so `new Request(path, { cache: 'reload' })` is parsed by the same
 * code a browser would use rather than by an assumption of ours.
 *
 * What these cannot reach is a real Cache and a real fetch event, so the
 * behaviour they pin is the routing: which strategy each URL gets, what is
 * kept alive, and what a deploy reaps. Run with `make test`.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ORIGIN = 'https://rfc.fyi'
const SOURCE = readFileSync(new URL('../sw.js', import.meta.url), 'utf8')

// --------------------------------------------------------------------------
// Stubs
// --------------------------------------------------------------------------

/* Enough of Cache to route against. Keyed by absolute URL, because that is
   what decides whether '/?q=tls' finds the entry stored for '/'. */
class FakeCache {
  constructor () {
    this.entries = new Map()
  }

  static url (request) {
    return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href
  }

  async match (request) {
    return this.entries.get(FakeCache.url(request))
  }

  async put (request, response) {
    this.entries.set(FakeCache.url(request), response)
  }

  async addAll (requests) {
    for (const request of requests) {
      this.entries.set(FakeCache.url(request), new Response('precached'))
    }
  }

  paths () {
    return [...this.entries.keys()].map((url) => new URL(url).pathname).sort()
  }
}

class FakeCacheStorage {
  constructor () {
    this.stores = new Map()
  }

  async open (name) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache())
    return this.stores.get(name)
  }

  async keys () {
    return [...this.stores.keys()]
  }

  async delete (name) {
    return this.stores.delete(name)
  }
}

/* Relative URLs have no base in Node. A worker resolves them against its own
   location, so do that and hand the real constructor an absolute one. */
class BaseRequest extends Request {
  constructor (input, init) {
    super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init)
  }
}

/* `build` stands in for a stamp: bin/stamp-sw.py writes these two names, and
   two workers from different builds differ in exactly that. */
function load ({
  hostname = 'rfc.fyi',
  fetch,
  build = 'aaaaaaaaaaaa',
  caches = new FakeCacheStorage() // shared between workers to model one origin
} = {}) {
  const source = SOURCE
    .replace(/CACHE_NAME = '[^']*'/, `CACHE_NAME = 'rfcfyi-v${build}'`)
    .replace(/VENDOR_CACHE = '[^']*'/, `VENDOR_CACHE = 'rfcfyi-vendor-${build}'`)
  const events = new Map()
  const self = {
    location: { origin: `https://${hostname}`, hostname },
    addEventListener: (name, handler) => events.set(name, handler),
    skipWaiting: () => { self.skipWaitingCalled = true },
    clients: { claim: () => { self.claimCalled = true } },
    skipWaitingCalled: false,
    claimCalled: false
  }
  // Built before the worker is evaluated so the injected fetch can read
  // `respond` through it; tests swap that between lifecycle phases.
  const api = {
    self,
    caches,
    events,
    requested: [],
    inits: [],
    respond: fetch || (async () => new Response('from the network'))
  }

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'Request', 'Response', 'URL', 'console', source)(
    self,
    caches,
    (request, init) => {
      api.requested.push(new URL(FakeCache.url(request)).pathname)
      api.inits.push(init)
      return api.respond(request, init)
    },
    BaseRequest,
    Response,
    URL,
    { log: () => {} }
  )

  const named = (constant) => source.match(new RegExp(`${constant} = '([^']*)'`))[1]
  api.cacheName = named('CACHE_NAME')
  api.vendorCache = named('VENDOR_CACHE')
  return api
}

/* A fetch event, with the two lifetime hooks recorded rather than honoured.
   `mode` is set after construction because only a browser may build a
   request in navigate mode; the constructor rejects it. */
function fetchEvent (url, init = {}) {
  const request = new BaseRequest(new URL(url, ORIGIN).href)
  if (init.mode) Object.defineProperty(request, 'mode', { value: init.mode })
  const event = {
    request,
    responded: null,
    kept: [],
    respondWith (promise) { event.responded = promise },
    waitUntil (promise) { event.kept.push(promise) }
  }
  return event
}

async function dispatch (worker, url, init) {
  const event = fetchEvent(url, init)
  worker.events.get('fetch')(event)
  const response = event.responded === null ? null : await event.responded
  return { event, response }
}

async function lifecycle (worker, name) {
  const event = { kept: [], waitUntil (promise) { event.kept.push(promise) } }
  worker.events.get(name)(event)
  await Promise.all(event.kept)
  return event
}

/* Install, then hand back a worker whose pre-cache is distinguishable from
   anything fetched afterwards -- 'precached' came out of the cache, 'from
   the network' did not -- with the install's own traffic set aside so a test
   can assert on what happened after it. */
async function installed (opts = {}) {
  const worker = load({ ...opts, fetch: undefined })
  worker.respond = async () => new Response('precached')
  const event = await lifecycle(worker, 'install')
  const precache = { requested: [...worker.requested], inits: [...worker.inits] }
  worker.requested.length = 0
  worker.inits.length = 0
  worker.respond = opts.fetch || (async () => new Response('from the network'))
  return { worker, event, precache }
}

// --------------------------------------------------------------------------
// Install and activate
// --------------------------------------------------------------------------

test('install pre-caches the static and data sets', async () => {
  const { worker } = await installed()
  const cache = await worker.caches.open(worker.cacheName)
  assert.deepEqual(cache.paths(), [
    '/',
    '/client.js',
    '/data.js',
    '/index.html',
    '/manifest.json',
    '/rfcfyi.png',
    '/search.js',
    '/style.css',
    '/util.js',
    '/var/refs.json',
    '/var/rfcs.json',
    '/var/tags.json'
  ])
})

test('install bypasses the HTTP cache', async () => {
  /* Pages serves max-age=600, so a worker installing just after a deploy
     would otherwise fill its new cache from the old build's responses and,
     being cache-first, keep them. */
  const { precache } = await installed()

  assert.equal(precache.requested.length, 12)
  assert.deepEqual([...new Set(precache.inits.map((init) => init.cache))], ['reload'])
})

test('a pre-cache that cannot be completed fails the install', async () => {
  /* Half a build in the cache is the state all of this exists to prevent,
     so it has to be an install failure rather than a worker that activates
     holding some of one build and some of the last. */
  const worker = load({
    fetch: async (request) => new URL(FakeCache.url(request)).pathname === '/search.js'
      ? new Response('nope', { status: 404 })
      : new Response('precached')
  })
  const event = { kept: [], waitUntil (promise) { event.kept.push(promise) } }
  worker.events.get('install')(event)
  await assert.rejects(Promise.all(event.kept), /search\.js: 404/)

  assert.deepEqual((await worker.caches.open(worker.cacheName)).paths(), [])
})

test('install does not skip waiting', async () => {
  /* Activating under a live page would swap the cache it is running out of,
     and search.js is imported lazily -- so the page would pull that one
     module from the next build. */
  const { worker } = await installed()
  assert.equal(worker.self.skipWaitingCalled, false)
})

test('activate reaps superseded caches of ours and nothing else', async () => {
  const worker = load()
  await worker.caches.open('rfcfyi-vdeadbeef0000') // a previous build
  await worker.caches.open('rfcfyi-v1786429966') // and one from before the hash
  await worker.caches.open('rfcfyi-vendor-deadbeef0000')
  await worker.caches.open('rfcfyi-index')
  await worker.caches.open('transformers-cache') // not ours; holds the model
  await worker.caches.open(worker.cacheName)
  await worker.caches.open(worker.vendorCache)

  await lifecycle(worker, 'activate')

  assert.deepEqual((await worker.caches.keys()).sort(), [
    'rfcfyi-active',
    'rfcfyi-index',
    'transformers-cache',
    worker.cacheName,
    worker.vendorCache
  ].sort())
})

test('a waiting worker reaps the caches of installs that never activated', async () => {
  /* Without skipWaiting this worker can sit behind a live page for a long
     time, and every deploy meanwhile leaves another ~4 MB precache behind.
     Enough of them and the origin is evicted, model and index with it. */
  const live = load({ build: 'aaaaaaaaaaaa' })
  await lifecycle(live, 'install')
  await lifecycle(live, 'activate')
  // A build that installed while the page stayed open and was superseded
  // before it could activate.
  await live.caches.open('rfcfyi-vbbbbbbbbbbbb')

  const next = load({ build: 'cccccccccccc', caches: live.caches })
  await lifecycle(next, 'install')

  const left = (await live.caches.keys()).sort()
  assert.ok(!left.includes('rfcfyi-vbbbbbbbbbbbb'), 'the orphan is gone')
  assert.ok(left.includes(live.cacheName), 'the live page keeps its cache')
  assert.ok(left.includes(next.cacheName), 'and the new one keeps its own')
})

test('an installing worker reaps nothing when no active worker has spoken', async () => {
  /* The record is written by activate. Its absence means a worker older
     than this scheme is in charge, and reaping would strip the cache out
     from under a page that is running right now. */
  const worker = load()
  await worker.caches.open('rfcfyi-v1786429966')
  await lifecycle(worker, 'install')

  assert.ok((await worker.caches.keys()).includes('rfcfyi-v1786429966'))
})

test('a failed install reaps nothing', async () => {
  /* Reaping first would strip the worker still waiting to activate of the
     cache it would have served from. */
  const live = load({ build: 'aaaaaaaaaaaa' })
  await lifecycle(live, 'activate')
  await live.caches.open('rfcfyi-vbbbbbbbbbbbb')

  const next = load({
    build: 'cccccccccccc',
    caches: live.caches,
    fetch: async () => { throw new Error('offline mid-install') }
  })
  const event = { kept: [], waitUntil (promise) { event.kept.push(promise) } }
  next.events.get('install')(event)
  await assert.rejects(Promise.all(event.kept))

  assert.ok((await live.caches.keys()).includes('rfcfyi-vbbbbbbbbbbbb'))
})

// --------------------------------------------------------------------------
// Routing
// --------------------------------------------------------------------------

test('a static asset is served from the cache without a fetch', async () => {
  /* The regression this exists for: revalidating entries one at a time is
     what let a client hold client.js from one build and util.js from the
     next. Within a cache name there is nothing a refetch could correct. */
  const { worker } = await installed()
  const { response } = await dispatch(worker, '/client.js')

  assert.equal(await response.text(), 'precached')
  assert.deepEqual(worker.requested, [])
})

test('a static asset absent from the cache is fetched and kept', async () => {
  const worker = load()
  const { response } = await dispatch(worker, '/client.js')

  assert.equal(await response.text(), 'from the network')
  assert.deepEqual(worker.requested, ['/client.js'])
  const cache = await worker.caches.open(worker.cacheName)
  assert.deepEqual(cache.paths(), ['/client.js'])
})

test('a navigation with a query string serves the cached markup', async () => {
  /* cache.match is exact-URL, so a shared link like /?search=tls misses the
     cached '/' and used to pair markup fetched now against scripts cached
     from an earlier build. */
  const { worker } = await installed()
  const { response } = await dispatch(worker, '/?search=tls', { mode: 'navigate' })

  assert.equal(await response.text(), 'precached')
  assert.deepEqual(worker.requested, [])
})

test('a navigation to any other path is left to the network', async () => {
  /* index.html loads client.js, style.css and manifest.json relatively, so
     answering /anything/ with it gives a shell whose every asset resolves
     under /anything/ and 404s. The site has no router; Pages' 404 is the
     right answer. */
  const { worker } = await installed()
  const { event } = await dispatch(worker, '/rfc/9110', { mode: 'navigate' })

  assert.equal(event.responded, null)
  assert.deepEqual(worker.requested, [])
})

test('vendor has a cache of its own', async () => {
  /* It moves only with TRANSFORMERS_VERSION. Sharing the site's name would
     throw away 22 MB, most of it the ort wasm, on every stylesheet edit --
     which is exactly what stamping the name on every build would now mean. */
  const worker = load()
  const wasm = '/vendor/ort/ort-wasm-simd-threaded.jsep.wasm'
  const { event } = await dispatch(worker, wasm)
  await Promise.all(event.kept)
  const { response } = await dispatch(worker, wasm)

  assert.equal(await response.text(), 'from the network')
  assert.deepEqual(worker.requested, [wasm])
  assert.deepEqual((await worker.caches.open(worker.vendorCache)).paths(), [wasm])
  assert.deepEqual((await worker.caches.open(worker.cacheName)).paths(), [])
})

test('a cache-first write is kept alive', async () => {
  /* respondWith settles the moment the response is returned, so without a
     waitUntil the worker can be terminated before the put lands -- and the
     21 MB wasm gets fetched again, and again. */
  const worker = load()
  const { event } = await dispatch(worker, '/vendor/ort/ort-wasm-simd-threaded.jsep.wasm')

  assert.equal(event.kept.length, 1)
})

test('a cache-first miss that 404s is not stored', async () => {
  const worker = load({ fetch: async () => new Response('nope', { status: 404 }) })
  const { event } = await dispatch(worker, '/index/20260811/clusters/0042.bin')

  assert.deepEqual(event.kept, [])
  assert.deepEqual((await worker.caches.open('rfcfyi-index')).paths(), [])
})

test('data is served stale and the revalidation is kept alive', async () => {
  /* Without waitUntil the worker can be terminated the moment the cached
     response is returned, so the put never runs and the revalidate half of
     stale-while-revalidate fires only sometimes. */
  const { worker } = await installed({
    fetch: async () => new Response('rebuilt overnight')
  })
  const { event, response } = await dispatch(worker, '/var/rfcs.json')

  assert.equal(await response.text(), 'precached')
  assert.equal(event.kept.length, 1)

  await Promise.all(event.kept)
  const cache = await worker.caches.open(worker.cacheName)
  assert.equal(await (await cache.match('/var/rfcs.json')).text(), 'rebuilt overnight')
})

test('a failed revalidation is survivable', async () => {
  /* Offline, the cached copy still has to come back, and the revalidation
     that waitUntil is now holding open must not reject -- a rejected
     waitUntil is an install/activate-style failure signal, not something to
     hand a worker every time a train goes into a tunnel. */
  const { worker } = await installed({
    fetch: async () => { throw new Error('offline') }
  })
  const { event, response } = await dispatch(worker, '/var/rfcs.json')

  assert.equal(await response.text(), 'precached')
  await assert.doesNotReject(Promise.all(event.kept))
})

test('index content is cache-first, and apart from the site cache', async () => {
  /* It is immutable -- the URLs carry their build -- and expensive to
     refetch, so a stylesheet edit bumping the cache name must not discard a
     warmed index. */
  const worker = load()
  await dispatch(worker, '/index/20260811/clusters/0042.bin')
  const { response } = await dispatch(worker, '/index/20260811/clusters/0042.bin')

  assert.equal(await response.text(), 'from the network')
  assert.deepEqual(worker.requested, ['/index/20260811/clusters/0042.bin'])
  const site = await worker.caches.open(worker.cacheName)
  assert.deepEqual(site.paths(), [])
})

test('the build pointer is network-first', async () => {
  /* A stale pointer names a directory the site no longer has, and every
     fetch after it 404s. */
  const worker = load()
  await dispatch(worker, '/index/current.json')
  await dispatch(worker, '/index/current.json')

  assert.deepEqual(worker.requested, ['/index/current.json', '/index/current.json'])
})

test('cross-origin requests are left alone', async () => {
  /* transformers.js caches the ~32 MB model itself; handling it here would
     store it twice and put opaque-response padding in our quota. */
  const worker = load()
  const { event } = await dispatch(worker, 'https://cdn.jsdelivr.net/model.onnx')

  assert.equal(event.responded, null)
})

test('localhost is network-first', async () => {
  /* In development a cached asset is the previous version of the file you
     just edited, so a fix looks like it did nothing. */
  const worker = load({ hostname: 'localhost' })
  const { response } = await dispatch(worker, 'https://localhost/client.js')

  assert.equal(await response.text(), 'from the network')
})
