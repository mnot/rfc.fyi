/* Browser-side semantic search over the published IVF index.
 *
 * `centroids.bin` (1.6 MiB) is resident; a query is embedded locally, scored
 * against every centroid, and the best `nprobe` clusters are fetched whole
 * (`cache.put()` rejects a 206, so ranges could not be cached).
 *
 * The binary layout is in `bin/indexfmt.py`. Three things there fail silently
 * rather than loudly, and are flagged where they are relied on: centroids are
 * used as dequantised and NOT re-normalised (which would move ~4% of chunks);
 * bge-small pools CLS, not mean; and the query takes an instruction prefix the
 * corpus was embedded without. All three come from the manifest.
 *
 * `create()` needs only the manifest and centroids -- no model, and no
 * transformers.js, until `loadModel()`.
 */

/* Pinned, not floating: `dtype` and the pooling options are load-bearing and
 * a major version has moved both before. `int8` selects `model_int8.onnx`,
 * the artifact bin/embed.py encoded the corpus with; the wasm default `q8` is
 * a different file, so leaving it unset embeds queries with a model the
 * corpus never saw. `dist/transformers.min.js` rather than the `.web.` build,
 * which leaves `onnxruntime-web/webgpu` as an unresolvable bare specifier.
 */
const DEFAULT_RUNTIME_URL = '/vendor/transformers-3.8.1.min.js'

/* Served from this origin: loading it from jsDelivr failed in Safari inside
 * the bundle's own `defineProperty` shims, and self-hosting also keeps a
 * third-party runtime off the critical path.
 *
 * 3.8.1, not 4.2.0: 4.2.0 runs in Chrome but throws in Safari out of its
 * module-level task-alias map, which means the module never finished
 * initialising. 3.8.x has the `dtype` support this needs.
 *
 * Override for testing:  localStorage.transformersUrl = '<url>'
 */
function runtimeUrl () {
  try {
    return window.localStorage.getItem('transformersUrl') || DEFAULT_RUNTIME_URL
  } catch {
    return DEFAULT_RUNTIME_URL
  }
}

const HEADER_BYTES = 24
const FORMAT_VERSION = 1
const MAGIC_CENTROIDS = 'RFCV'
const MAGIC_CLUSTER = 'RFCC'
const DEFAULT_CLUSTER_PATH = 'clusters/{id:04d}.bin'
const DEFAULT_NPROBE = 20

/* The index is published under `/index/<build>/`, so those URLs are
 * immutable; current.json is the only one whose bytes change, and is how a
 * client finds the build. */
const INDEX_ROOT = '/index'
const CURRENT_URL = `${INDEX_ROOT}/current.json`

/* sw.js keeps index content here. Named on this side too because the page
 * is what knows which build is current. */
const INDEX_CACHE = 'rfcfyi-index'

/**
 * Drop cached index entries outside the build in use -- a superseded build,
 * or the flat layout that preceded build-addressed URLs. Either is tens of
 * megabytes in a cache the deploy reaper deliberately leaves alone.
 *
 * Best-effort; a browser that refuses just keeps the clutter.
 */
export async function pruneIndexCache (basePath) {
  const store = globalThis.caches
  if (!store) return 0
  let cache
  try {
    cache = await store.open(INDEX_CACHE)
  } catch {
    return 0
  }
  const keep = `${basePath}/`
  let dropped = 0
  for (const request of await cache.keys()) {
    const { pathname, origin } = new URL(request.url)
    if (origin !== globalThis.location.origin) continue
    if (pathname !== CURRENT_URL &&
        pathname.startsWith(`${INDEX_ROOT}/`) &&
        !pathname.startsWith(keep)) {
      if (await cache.delete(request)) dropped++
    }
  }
  return dropped
}

/**
 * The build the site is currently publishing, as a base path.
 *
 * @param {string} [bust] a nonce, when the pointer proved stale. `no-store`
 *   gets past the browser and the service worker but not a CDN edge, which
 *   can serve the previous build for minutes after a deploy; a distinct URL
 *   is a distinct key there. Retry only -- the offline fallback can only
 *   match the plain URL.
 */
async function currentBasePath (bust) {
  const url = bust ? `${CURRENT_URL}?b=${bust}` : CURRENT_URL
  const response = await fetchOk(url, { cache: 'no-store' })
  let build
  try {
    build = (await response.json()).build
  } catch (err) {
    return fail(`${CURRENT_URL} is not JSON`, err)
  }
  if (typeof build !== 'string' || !/^\d{8}T\d{6}Z$/.test(build)) {
    fail(`${url}: no usable build id`)
  }
  return `${INDEX_ROOT}/${build}`
}

/** Anything the UI can reasonably put in front of a person. */
export class SearchError extends Error {
  constructor (message, options) {
    super(message, options)
    this.name = 'SearchError'
  }
}

function fail (message, cause) {
  throw new SearchError(cause ? `${message}: ${cause.message}` : message, { cause })
}

function superseded (message) {
  const err = new SearchError(message)
  /* So create() can tell "the pointer was stale" apart from every other
   * reason a fetch fails, and go round once more. */
  err.supersededBuild = true
  throw err
}

async function fetchOk (url, init) {
  let response
  try {
    response = await fetch(url, init)
  } catch (err) {
    return fail(`could not reach ${url}`, err)
  }
  if (response.status === 404 &&
      url.startsWith(`${INDEX_ROOT}/`) && !url.startsWith(CURRENT_URL)) {
    /* A build directory disappears whole when a newer index is published,
     * so this is a session that outlived a deploy, not a broken link. */
    superseded(`${url}: this index build is no longer published -- reload the page`)
  }
  if (!response.ok) {
    fail(`${url}: HTTP ${response.status} ${response.statusText}`)
  }
  return response
}

/* Streamed only when Content-Length is known, because a progress bar that
 * cannot say how far along it is helps nobody, and `arrayBuffer()` is the
 * faster path when there is no one watching.
 */
async function fetchBuffer (url, report, phase) {
  const response = await fetchOk(url)
  const total = Number(response.headers.get('content-length')) || 0
  if (!report || !total || !response.body) {
    return response.arrayBuffer()
  }
  const reader = response.body.getReader()
  const parts = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    loaded += value.byteLength
    report({ phase, status: 'progress', loaded, total, progress: (loaded / total) * 100 })
  }
  const bytes = new Uint8Array(loaded)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.byteLength
  }
  return bytes.buffer
}

/* The 24-byte header both binary files share. */
function readHeader (buffer, url, magic) {
  if (buffer.byteLength < HEADER_BYTES) {
    fail(`${url}: ${buffer.byteLength} bytes, too short to be an index file`)
  }
  const view = new DataView(buffer)
  const got = String.fromCharCode(...new Uint8Array(buffer, 0, 4))
  if (got !== magic) {
    fail(`${url}: magic ${JSON.stringify(got)}, expected ${JSON.stringify(magic)}`)
  }
  const version = view.getUint16(4, true)
  if (version !== FORMAT_VERSION) {
    fail(`${url}: format version ${version}, expected ${FORMAT_VERSION}`)
  }
  return {
    dims: view.getUint16(6, true),
    count: view.getUint32(8, true),
    ident: view.getUint32(12, true),
    metaLen: view.getUint32(16, true)
  }
}

/* int8 -> float, and nothing else.
 *
 * Do NOT re-normalise the rows afterwards. The published partition is plain
 * argmax over these values as they stand; unit-normalising them is a
 * different function with a different argmax for a few percent of the corpus,
 * and the chunks that move are invisibly unreachable rather than obviously
 * broken.
 */
function dequantise (quantised, scale) {
  const out = new Float32Array(quantised.length)
  for (let i = 0; i < quantised.length; i++) {
    out[i] = quantised[i] * scale
  }
  return out
}

function dot (query, vectors, row, dims) {
  const base = row * dims
  let sum = 0
  for (let d = 0; d < dims; d++) {
    sum += query[d] * vectors[base + d]
  }
  return sum
}

/* Indices of the `n` highest scores, best first.
 *
 * A bounded insertion rather than sorting everything: this runs over 4,337
 * centroids on every keystroke-triggered query and over a few thousand chunks
 * after that, and n is 20-50, so almost every candidate is rejected by one
 * comparison.
 */
function topIndices (scores, n) {
  const want = Math.min(n, scores.length)
  if (want <= 0) return []
  const best = []
  let worst = -Infinity
  for (let i = 0; i < scores.length; i++) {
    const score = scores[i]
    if (best.length === want && score <= worst) continue
    let at = best.length
    while (at > 0 && scores[best[at - 1]] < score) at--
    best.splice(at, 0, i)
    if (best.length > want) best.pop()
    worst = scores[best[best.length - 1]]
  }
  return best
}

function clusterUrl (basePath, template, id) {
  const path = template.replace(/\{id:0(\d+)d\}/, (_, width) =>
    String(id).padStart(Number(width), '0'))
  return `${basePath}/${path}`
}

/* Exposed for tests only. These are the pieces worth checking in isolation:
 * a binary parser, a hand-rolled bounded selection, and two small pure
 * functions. Everything else needs the network and is covered through the
 * public API. */
export const __test = { readHeader, dequantise, topIndices, clusterUrl }

export class SemanticSearch {
  /* Use `create()`. */
  constructor (options) {
    this.basePath = options.basePath
    this.manifest = options.manifest
    this.dims = options.dims
    this.scale = options.scale
    this.centroids = options.centroids
    this.clusterCount = options.centroids.length / options.dims
    this.clusterPath = options.manifest.clusters?.path || DEFAULT_CLUSTER_PATH
    /* The build chooses this, and `verify` reports its fetch budget against
     * the same number, so read it rather than keeping a second copy. */
    this.nprobe = Number(options.manifest.clusters?.nprobe) || DEFAULT_NPROBE
    this.onProgress = options.onProgress

    /* Cluster id -> Promise of a parsed cluster. Promises rather than values
     * so two queries probing the same cluster share one fetch. Session-only:
     * the HTTP cache and the service worker are what survive a reload.
     */
    /* Bounded, least-recently-used. Twenty clusters at ~44 KiB land per
     * distinct query, so an unbounded map grows by about a megabyte every
     * fifty queries and never gives any of it back. The HTTP cache and the
     * service worker are what make a re-fetch cheap, so evicting here costs
     * little. */
    this.clusters = new Map()
    this.maxCachedClusters = 400
    this.pipeline = null
    this.pipelinePromise = null
    this.stats = {
      centroidBytes: options.centroidBytes,
      clusterBytes: 0,
      clusterFetches: 0,
      clusterHits: 0
    }
  }

  /**
   * Load the manifest and the centroids. Does not touch the model.
   *
   * @param {object} [options]
   * @param {string} [options.basePath] where the index lives, no trailing
   *   slash. Omit to read `/index/current.json` and use the published build.
   * @param {function} [options.onProgress] `{ phase, status, loaded, total, progress }`
   *   with phase one of 'manifest' | 'centroids' | 'model'
   */
  static async create ({ basePath, onProgress } = {}) {
    const report = typeof onProgress === 'function' ? onProgress : null
    if (basePath) {
      return SemanticSearch._open(String(basePath).replace(/\/+$/, ''), report)
    }
    try {
      return await SemanticSearch._open(await currentBasePath(), report)
    } catch (err) {
      if (!err?.supersededBuild) throw err
      /* A stale pointer from a CDN edge. Ask once more in a way the edge
       * cannot answer from cache. */
      return SemanticSearch._open(await currentBasePath(Date.now()), report)
    }
  }

  static async _open (base, report) {
    report?.({ phase: 'manifest', status: 'start' })
    /* Fire and forget: reclaiming space must not hold up the search. */
    pruneIndexCache(base).catch(() => {})
    const manifestUrl = `${base}/manifest.json`
    const response = await fetchOk(manifestUrl)
    let manifest
    try {
      manifest = await response.json()
    } catch (err) {
      return fail(`${manifestUrl} is not JSON`, err)
    }
    if (manifest.version !== FORMAT_VERSION) {
      fail(`${manifestUrl}: index version ${manifest.version}, expected ${FORMAT_VERSION}`)
    }
    report?.({ phase: 'manifest', status: 'done' })

    const centroidsUrl = `${base}/${manifest.centroids?.path || 'centroids.bin'}`
    const buffer = await fetchBuffer(centroidsUrl, report, 'centroids')
    const head = readHeader(buffer, centroidsUrl, MAGIC_CENTROIDS)
    const want = HEADER_BYTES + head.count * head.dims
    if (buffer.byteLength !== want) {
      fail(`${centroidsUrl}: ${buffer.byteLength} bytes, expected ${want}`)
    }
    if (head.dims !== manifest.model?.dims) {
      fail(`${centroidsUrl}: ${head.dims} dims, manifest says ${manifest.model?.dims}`)
    }
    const scale = manifest.quant?.scale
    if (!(scale > 0)) {
      fail(`${manifestUrl}: no usable quant.scale`)
    }
    report?.({ phase: 'centroids', status: 'done', loaded: buffer.byteLength, total: buffer.byteLength })

    return new SemanticSearch({
      basePath: base,
      manifest,
      dims: head.dims,
      scale,
      centroids: dequantise(new Int8Array(buffer, HEADER_BYTES, head.count * head.dims), scale),
      centroidBytes: buffer.byteLength,
      onProgress: report
    })
  }

  get modelLoaded () {
    return this.pipeline !== null
  }

  /**
   * Fetch and warm the embedding model (~32 MiB, plus the ONNX runtime).
   * Cached by transformers.js in the Cache API, so it is a one-off per
   * browser rather than per session. Idempotent, and safe to call
   * concurrently; a failed load can be retried.
   */
  async loadModel () {
    if (this.pipeline) return this.pipeline
    if (!this.pipelinePromise) {
      this.pipelinePromise = this._openPipeline()
      // Reset on failure so a retry is possible, and so the rejection is
      // never unhandled while the caller has not awaited yet.
      this.pipelinePromise.catch(() => { this.pipelinePromise = null })
    }
    return this.pipelinePromise
  }

  async _openPipeline () {
    const spec = this.manifest.model || {}
    const report = this.onProgress
    const url = runtimeUrl()
    let runtime
    try {
      runtime = await import(/* @vite-ignore */ url)
    } catch (err) {
      return fail(`could not load the embedding runtime from ${url}`, err)
    }
    // Optional: it only matters for loading model files from this origin,
    // which we never do. Guarded because Safari has twice handed back a
    // namespace with top-level bindings missing -- 4.2.0's task-alias map,
    // then this -- and crashing on a setting we do not need told us nothing
    // about the real problem underneath.
    if (runtime.env) {
      runtime.env.allowLocalModels = false
      /* Serve the ONNX runtime wasm from this origin too.
       *
       * transformers.js caches the *model* files it fetches from HuggingFace
       * in a Cache API bucket of its own, but the runtime binary comes from
       * its CDN and lands only in the HTTP cache -- 4 MB that an offline
       * reload cannot recover, so the feature broke offline even with the
       * model right there. Same-origin, the service worker caches it like
       * any other asset.
       */
      try {
        runtime.env.backends.onnx.wasm.wasmPaths = '/vendor/ort/'
      } catch { /* older layout: leave the default */ }
    } else {
      report?.({
        phase: 'model',
        status: 'warn',
        message: `runtime loaded without env; exports: ${Object.keys(runtime).slice(0, 12).join(', ') || '(none)'}`
      })
    }
    if (typeof runtime.pipeline !== 'function') {
      return fail(
        `the runtime at ${url} exposes no pipeline() -- it loaded but did not ` +
        `initialise. Exports: ${Object.keys(runtime).slice(0, 12).join(', ') || '(none)'}`
      )
    }
    try {
      this.pipeline = await runtime.pipeline('feature-extraction', spec.id, {
        // The corpus was embedded with onnx/model_int8.onnx on CPU. Both are
        // pinned so a query vector and a chunk vector come from the same
        // graph at the same quantisation, on any machine.
        dtype: spec.variant || 'int8',
        device: 'wasm',
        progress_callback: report
          ? event => report({ phase: 'model', ...event })
          : undefined
      })
    } catch (err) {
      return fail(`could not load the embedding model ${spec.id}`, err)
    }
    // No 'ready' of our own: transformers.js emits one, and the resolution of
    // the promise this returns is the signal that cannot be missed.
    return this.pipeline
  }

  async _embed (text) {
    const spec = this.manifest.model || {}
    let output
    try {
      output = await this.pipeline(
        // The instruction prefix goes on the query and only on the query --
        // the corpus was embedded bare. Omitting it costs real recall, and
        // adding it to passages would cost more. It comes from the manifest,
        // which is written by the build that embedded the corpus.
        (spec.query_prefix || '') + text,
        { pooling: spec.pooling || 'cls', normalize: true }
      )
    } catch (err) {
      return fail('could not embed the query', err)
    }
    const vector = output.data
    if (!vector || vector.length !== this.dims) {
      fail(`the model returned ${vector ? vector.length : 0} dims, expected ${this.dims}`)
    }
    return vector
  }

  /* The `nprobe` clusters whose centroids score highest. */
  _probe (query, nprobe) {
    const scores = new Float32Array(this.clusterCount)
    for (let j = 0; j < this.clusterCount; j++) {
      scores[j] = dot(query, this.centroids, j, this.dims)
    }
    return topIndices(scores, nprobe)
  }

  _cluster (id) {
    let pending = this.clusters.get(id)
    if (pending) {
      this.stats.clusterHits++
      // Re-insert to mark it most-recently-used: Map iterates in insertion
      // order, so the eviction below can just take the first key.
      this.clusters.delete(id)
      this.clusters.set(id, pending)
      return pending
    }
    pending = this._fetchCluster(id)
    pending.catch(() => this.clusters.delete(id))
    this.clusters.set(id, pending)
    while (this.clusters.size > this.maxCachedClusters) {
      this.clusters.delete(this.clusters.keys().next().value)
    }
    return pending
  }

  async _fetchCluster (id) {
    const url = clusterUrl(this.basePath, this.clusterPath, id)
    const buffer = await fetchBuffer(url)
    const head = readHeader(buffer, url, MAGIC_CLUSTER)
    if (head.dims !== this.dims) {
      fail(`${url}: ${head.dims} dims, expected ${this.dims}`)
    }
    if (head.ident !== id) {
      fail(`${url}: header says cluster ${head.ident}`)
    }
    const end = HEADER_BYTES + head.count * head.dims
    if (buffer.byteLength !== end + head.metaLen) {
      fail(`${url}: ${buffer.byteLength} bytes, expected ${end + head.metaLen}`)
    }
    let meta
    try {
      meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, end, head.metaLen)))
    } catch (err) {
      return fail(`${url}: unreadable metadata tail`, err)
    }
    if (meta.n !== head.count) {
      fail(`${url}: tail says n=${meta.n}, header says ${head.count}`)
    }
    this.stats.clusterFetches++
    this.stats.clusterBytes += buffer.byteLength
    return {
      id,
      count: head.count,
      vectors: new Int8Array(buffer, HEADER_BYTES, head.count * head.dims),
      meta
    }
  }

  /**
   * Rank chunks against a query.
   *
   * @param {string} query
   * @param {object} [options]
   * @param {number} [options.nprobe] clusters to fetch and scan; defaults to
   *   the manifest's `clusters.nprobe`
   * @param {number} [options.limit=50] chunks to return
   * @returns {Promise<Array<{rfc: number|string, section: ?string, title: string,
   *   offset: number, length: number, score: number}>>} best first. Chunks are
   *   returned as they are -- several from one RFC, or one section, is normal;
   *   collapsing them is the caller's business.
   */
  async search (query, { nprobe = this.nprobe, limit = 50 } = {}) {
    const text = String(query ?? '').trim()
    if (!text || limit <= 0) return []
    await this.loadModel()
    const vector = await this._embed(text)

    const probes = this._probe(vector, Math.max(1, Math.min(nprobe, this.clusterCount)))
    const clusters = await Promise.all(probes.map(id => this._cluster(id)))

    // One flat candidate list across every probed cluster, scored against the
    // dequantised int8 vectors. The scale is a positive constant so it cannot
    // reorder anything, but it is applied anyway: the number a caller sees is
    // then a cosine against the stored vector, not an arbitrary integer.
    let total = 0
    for (const cluster of clusters) total += cluster.count
    const scores = new Float32Array(total)
    const owner = new Int32Array(total)
    const row = new Int32Array(total)
    let at = 0
    for (let c = 0; c < clusters.length; c++) {
      const cluster = clusters[c]
      for (let i = 0; i < cluster.count; i++) {
        scores[at] = dot(vector, cluster.vectors, i, this.dims) * this.scale
        owner[at] = c
        row[at] = i
        at++
      }
    }

    return topIndices(scores, limit).map(hit => {
      const { meta } = clusters[owner[hit]]
      const i = row[hit]
      const section = meta.sec[i]
      return {
        rfc: meta.rfc[i],
        section: section === -1 ? null : meta.str[section],
        title: meta.str[meta.title[i]],
        offset: meta.off[i],
        length: meta.len[i],
        score: scores[hit]
      }
    })
  }
}
