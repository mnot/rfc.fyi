/* Browser-side semantic search over the published IVF index in `index/`.
 *
 * The shape of the thing: `centroids.bin` (1.6 MiB) is resident, everything
 * else is fetched on demand. A query is embedded locally, scored against every
 * centroid, and the best `nprobe` clusters are pulled as whole files -- whole
 * files because `cache.put()` rejects a 206, so a range request could not be
 * cached by the service worker. Roughly 2,300 chunk vectors come back for a
 * 20-cluster query and about ten of them are shown.
 *
 * The binary layout is specified in the module docstring of
 * `bin/build-clusters.py`; `read_cluster()` there is the reference reader.
 * Three things in it are silent wrongness rather than loud failure, so they
 * are called out at the point where they are relied on:
 *
 *   1. Centroids are used exactly as dequantised -- NOT re-normalised. The
 *      build's partition is `argmax(v . dequantised_centroid)`, and
 *      re-normalising moves about 4% of chunks into a different cluster than
 *      the one they were actually written to. See `dequantise` below.
 *   2. bge-small pools the CLS token, not the mean (`pooling: 'cls'`).
 *   3. The query gets an instruction prefix; the corpus was embedded without
 *      one. Both come from the manifest so they cannot drift from the build.
 *
 * Nothing here loads the model until `loadModel()` is called, and nothing
 * fetches transformers.js until then either -- `create()` only needs the
 * manifest and the centroids, which is enough to build the UI around.
 */

/* The runtime is pinned, not floating: `dtype` and the pooling options are
 * load-bearing and a major-version bump has moved both before. `@xenova/
 * transformers` is the retired v2 package; this is its successor. The `int8`
 * dtype selects `onnx/model_int8.onnx` (32.2 MiB) -- the exact artifact
 * bin/embed.py encoded the corpus with. The wasm default would be `q8`, which
 * is a *different* file (`model_quantized.onnx`), so leaving it unset would
 * quietly embed queries with a model the corpus never saw.
 *
 * `dist/transformers.min.js` and not the `.web.` build: the latter is the
 * bundler entry point and leaves `onnxruntime-web/webgpu` as a bare specifier,
 * which no browser can resolve from a CDN URL. This one has the runtime
 * inlined.
 */
const DEFAULT_RUNTIME_URL = '/vendor/transformers-3.8.1.min.js'

/* Served from this origin rather than a CDN.
 *
 * Loading it cross-origin from jsDelivr worked in Chrome and failed in Safari
 * with "Invalid property. 'value' present on property with getter or setter"
 * thrown out of the bundle's own `Object.defineProperty` shims -- while a bare
 * `import()` of the identical URL from the Safari console returned all 856
 * exports. So the module is fine and something about evaluating it in the page
 * context was not, and rather than keep bisecting someone else's bundle we
 * serve it ourselves.
 *
 * Self-hosting is worth having on its own terms: no third-party runtime on the
 * critical path, no CDN outage or version drift, one fewer origin for the
 * service worker to reason about, and it can be cached like any other asset.
 * The ONNX wasm is still fetched by transformers.js from its own CDN.
 *
 * 3.8.1 rather than the 4.2.0 this was first written against. 4.2.0 loads and
 * runs in Chrome but breaks in Safari: `pipeline()` throws "undefined is not
 * an object (evaluating 'Qp[t]')", where `Qp` is the module-level task-alias
 * map. That lookup is guarded (`Qp[t] ?? t`), so a missing *key* would be
 * harmless -- `Qp` itself being undefined at call time means the module never
 * finished initialising. 3.8.x is the long-deployed line and has the `dtype`
 * support v3 introduced, which is all this needs.
 *
 * Overridable from the console, so testing another build on a browser you
 * cannot script does not need a code change:
 *   localStorage.transformersUrl = '<url>'   then reload
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

/* Where the index lives, and the one URL under it whose bytes change.
 *
 * Everything else is published under `/index/<build>/`, so a given URL's
 * content is fixed forever and the service worker can keep it without ever
 * revalidating. An update publishes a new build directory rather than new
 * bytes at the old URLs; this pointer is how a client finds it.
 */
const INDEX_ROOT = '/index'
const CURRENT_URL = `${INDEX_ROOT}/current.json`

/* The cache sw.js keeps index content in. Named here too because pruning
 * superseded builds is the page's job -- it is the side that knows which
 * build is current. */
const INDEX_CACHE = 'rfcfyi-index'

/**
 * Drop cached index entries that do not belong to the build in use.
 *
 * Covers a superseded build and, for anyone who used full-text search before
 * builds were addressable, the flat `/index/clusters/...` layout that
 * preceded them. Left alone, either is tens of megabytes that will never be
 * served again, in a cache deliberately exempt from the deploy reaper.
 *
 * Best-effort: a browser without CacheStorage, or one that refuses, just
 * keeps the clutter.
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

/** The build the site is currently publishing, as a base path. */
async function currentBasePath () {
  /* Bypass the HTTP cache as well as the service worker's. Pages serves this
   * with a max-age like everything else, and a pointer minutes out of date
   * names a build the site has already replaced. */
  const response = await fetchOk(CURRENT_URL, { cache: 'no-store' })
  let build
  try {
    build = (await response.json()).build
  } catch (err) {
    return fail(`${CURRENT_URL} is not JSON`, err)
  }
  if (typeof build !== 'string' || !/^\d{8}T\d{6}Z$/.test(build)) {
    fail(`${CURRENT_URL}: no usable build id`)
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

async function fetchOk (url, init) {
  let response
  try {
    response = await fetch(url, init)
  } catch (err) {
    return fail(`could not reach ${url}`, err)
  }
  if (response.status === 404 &&
      url.startsWith(`${INDEX_ROOT}/`) && url !== CURRENT_URL) {
    /* Everything under a build directory disappears together when a newer
     * index is published, and a session that started before the deploy is
     * still asking for the old one. Reloading picks up the new pointer;
     * "HTTP 404" would send someone looking for a broken link. */
    fail(`${url}: this index build is no longer published -- reload the page`)
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

    report?.({ phase: 'manifest', status: 'start' })
    const base = basePath
      ? String(basePath).replace(/\/+$/, '')
      : await currentBasePath()
    /* Fire and forget: reclaiming space from a build nobody will fetch
     * again should not hold up the search that is waiting on this. */
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
   * @param {number} [options.nprobe=20] clusters to fetch and scan
   * @param {number} [options.limit=50] chunks to return
   * @returns {Promise<Array<{rfc: number|string, section: ?string, title: string,
   *   offset: number, length: number, score: number}>>} best first. Chunks are
   *   returned as they are -- several from one RFC, or one section, is normal;
   *   collapsing them is the caller's business.
   */
  async search (query, { nprobe = 20, limit = 50 } = {}) {
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
