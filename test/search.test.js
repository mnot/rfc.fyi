/* Tests for search.js.
 *
 * Two halves. The pure functions are checked directly, including against a
 * brute-force implementation over random input, because `topIndices` is a
 * hand-rolled bounded selection and the obvious bugs in one of those are
 * off-by-ones at the boundary rather than anything a worked example finds.
 *
 * The rest goes through the public API with `fetch` stubbed, building index
 * files byte by byte from the format in `bin/indexfmt.py`. That covers the
 * failures worth catching -- a truncated download, a file from a different
 * build, a superseded index -- which is what the format's validation exists
 * for and what nothing else exercises.
 *
 * Run with `make test`, or `node --test test/`.
 */

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { SemanticSearch, SearchError, __test } from '../search.js'

const { readHeader, dequantise, topIndices, clusterUrl } = __test

const HEADER_BYTES = 24
const DIMS = 4 // enough to exercise the arithmetic; the real index is 384
const SCALE = 0.0035588767115525373

// --------------------------------------------------------------------------
// Fixtures, built from the format spec rather than captured from a build.
// --------------------------------------------------------------------------

function header (magic, { count = 0, ident = 0, metaLen = 0, dims = DIMS, version = 1 } = {}) {
  const buf = new ArrayBuffer(HEADER_BYTES)
  const view = new DataView(buf)
  for (let i = 0; i < 4; i++) view.setUint8(i, magic.charCodeAt(i))
  view.setUint16(4, version, true)
  view.setUint16(6, dims, true)
  view.setUint32(8, count, true)
  view.setUint32(12, ident, true)
  view.setUint32(16, metaLen, true)
  return buf
}

function concat (...parts) {
  const total = parts.reduce((n, p) => n + p.byteLength, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(new Uint8Array(part), at)
    at += part.byteLength
  }
  return out.buffer
}

function centroidsFile (rows, opts = {}) {
  const vecs = new Int8Array(rows.flat())
  return concat(header('RFCV', { count: rows.length, ...opts }), vecs.buffer)
}

function clusterFile (id, rows, meta) {
  const tail = new TextEncoder().encode(JSON.stringify(meta))
  const vecs = new Int8Array(rows.flat())
  return concat(
    header('RFCC', { count: rows.length, ident: id, metaLen: tail.byteLength }),
    vecs.buffer, tail.buffer
  )
}

function manifest (over = {}) {
  return {
    version: 1,
    build: '20260811T003915Z',
    model: { id: 'Xenova/bge-small-en-v1.5', dims: DIMS },
    quant: { scale: SCALE },
    clusters: { count: 2, nprobe: 7, path: 'clusters/{id:04d}.bin' },
    centroids: { path: 'centroids.bin' },
    ...over
  }
}

/** Serve a routing table keyed on path, and record what was asked for.
 *
 * Keyed on the path rather than the whole URL because a server ignores the
 * cache-busting query the retry adds -- a stub that 404s on it would make
 * the retry look like it worked when it had not.
 *
 * A route may be a function, called with the request count, for the cases
 * where the same URL has to answer differently twice.
 */
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

function stubFetch (routes) {
  const asked = []
  const counts = {}
  globalThis.fetch = async (url) => {
    const full = String(url)
    asked.push(full)
    const path = full.split('?')[0]
    counts[path] = (counts[path] || 0) + 1
    let body = routes[path]
    if (typeof body === 'function') body = body(counts[path])
    if (body === undefined) return new Response('', { status: 404 })
    if (body instanceof ArrayBuffer) return new Response(body, { status: 200 })
    return new Response(JSON.stringify(body), { status: 200 })
  }
  return asked
}

const BUILD = '/index/20260811T003915Z'

function workingIndex (over = {}) {
  return {
    '/index/current.json': { build: '20260811T003915Z' },
    [`${BUILD}/manifest.json`]: manifest(),
    [`${BUILD}/centroids.bin`]: centroidsFile([[100, 0, 0, 0], [0, 100, 0, 0]]),
    ...over
  }
}

// --------------------------------------------------------------------------
// topIndices
// --------------------------------------------------------------------------

test('topIndices returns the n highest, best first', () => {
  assert.deepEqual(topIndices([3, 9, 1, 7, 5], 3), [1, 3, 4])
})

test('topIndices handles the boundaries', () => {
  assert.deepEqual(topIndices([], 5), [])
  assert.deepEqual(topIndices([1, 2, 3], 0), [])
  assert.deepEqual(topIndices([1, 2, 3], -1), [])
  // Asking for more than exists yields everything, still ordered.
  assert.deepEqual(topIndices([1, 3, 2], 99), [1, 2, 0])
  assert.deepEqual(topIndices([42], 1), [0])
})

test('topIndices keeps the earlier index on a tie', () => {
  // Not arbitrary: cluster ids are probed in the order returned, so a tie
  // that reordered run to run would make a query non-deterministic.
  assert.deepEqual(topIndices([5, 5, 5], 2), [0, 1])
})

test('topIndices matches a full sort over random input', () => {
  // A bounded insertion is where off-by-ones live, and they show up on
  // particular shapes rather than on a worked example.
  let seed = 12345
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let trial = 0; trial < 200; trial++) {
    const len = 1 + Math.floor(rand() * 40)
    const scores = Array.from({ length: len }, () => Math.round(rand() * 20))
    const n = 1 + Math.floor(rand() * 12)
    // Indices, not the scores they map to: comparing scores would pass for
    // any tie order, and tie order is the property that has to hold.
    const want = scores
      .map((score, i) => ({ score, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, Math.min(n, len))
      .map(e => e.i)
    assert.deepEqual(topIndices(scores, n), want, `scores=${scores} n=${n}`)
  }
})

// --------------------------------------------------------------------------
// dequantise
// --------------------------------------------------------------------------

test('dequantise scales into a Float32Array', () => {
  const out = dequantise(new Int8Array([0, 1, -1, 127, -127]), 2)
  assert.ok(out instanceof Float32Array)
  assert.deepEqual(Array.from(out), [0, 2, -2, 254, -254])
})

test('dequantise does not re-normalise', () => {
  // The published partition is argmax over these values as they stand;
  // unit-normalising is a different function with a different argmax.
  const out = dequantise(new Int8Array([100, 100, 100, 100]), SCALE)
  const norm = Math.hypot(...out)
  assert.ok(Math.abs(norm - 1) > 0.1, `unexpectedly unit-length: ${norm}`)
})

// --------------------------------------------------------------------------
// clusterUrl
// --------------------------------------------------------------------------

test('clusterUrl pads to the template width', () => {
  assert.equal(clusterUrl('/index/B', 'clusters/{id:04d}.bin', 7), '/index/B/clusters/0007.bin')
  assert.equal(clusterUrl('/index/B', 'clusters/{id:04d}.bin', 4336), '/index/B/clusters/4336.bin')
  assert.equal(clusterUrl('/index/B', 'c/{id:06d}.bin', 7), '/index/B/c/000007.bin')
})

test('clusterUrl does not truncate an id wider than the template', () => {
  // Better a URL that 404s than one that quietly fetches the wrong cluster.
  assert.equal(clusterUrl('/i', 'c/{id:02d}.bin', 12345), '/i/c/12345.bin')
})

// --------------------------------------------------------------------------
// readHeader
// --------------------------------------------------------------------------

test('readHeader reads the fields', () => {
  const got = readHeader(header('RFCC', { count: 9, ident: 3, metaLen: 40 }), 'u', 'RFCC')
  assert.deepEqual(got, { dims: DIMS, count: 9, ident: 3, metaLen: 40 })
})

for (const [name, buffer, expected] of [
  ['one byte short', new ArrayBuffer(HEADER_BYTES - 1), /23 bytes, too short/],
  ['wrong magic', header('XXXX'), /magic "XXXX", expected "RFCV"/],
  ['wrong version', header('RFCV', { version: 2 }), /format version 2, expected 1/]
]) {
  test(`readHeader rejects a ${name} file`, () => {
    assert.throws(() => readHeader(buffer, 'the-url', 'RFCV'), (err) => {
      assert.ok(err instanceof SearchError, `expected SearchError, got ${err.name}`)
      assert.match(err.message, expected)
      assert.match(err.message, /the-url/, 'the message must name the file')
      return true
    })
  })
}

// --------------------------------------------------------------------------
// create(): pointer resolution and validation
// --------------------------------------------------------------------------

test('create resolves the pointer and loads the build it names', async () => {
  const asked = stubFetch(workingIndex())
  const engine = await SemanticSearch.create()
  assert.equal(engine.basePath, BUILD)
  assert.equal(engine.clusterCount, 2)
  assert.equal(engine.nprobe, 7, 'nprobe comes from the manifest, not a constant')
  assert.ok(asked.includes('/index/current.json'))
})

test('create rejects a pointer that is not a build id', async () => {
  stubFetch({ '/index/current.json': { build: 'latest' } })
  await assert.rejects(SemanticSearch.create(), /no usable build id/)
})

test('create rejects an index of the wrong format version', async () => {
  stubFetch(workingIndex({ [`${BUILD}/manifest.json`]: manifest({ version: 99 }) }))
  await assert.rejects(SemanticSearch.create(), /index version 99, expected 1/)
})

test('create rejects centroids that do not match their header', async () => {
  // A truncated download: the header promises three rows, two arrived.
  const short = concat(header('RFCV', { count: 3 }), new Int8Array(2 * DIMS).buffer)
  stubFetch(workingIndex({ [`${BUILD}/centroids.bin`]: short }))
  await assert.rejects(SemanticSearch.create(), /bytes, expected/)
})

test('create rejects centroids from a different model', async () => {
  const wrong = centroidsFile([[1, 2, 3, 4, 5, 6, 7, 8]], { dims: 8 })
  stubFetch(workingIndex({ [`${BUILD}/centroids.bin`]: wrong }))
  await assert.rejects(SemanticSearch.create(), /8 dims, manifest says 4/)
})

test('create recovers when a stale pointer came from a CDN edge', async () => {
  // The case this retry exists for: an edge serves the previous build's id
  // for some minutes after a deploy, while the origin has the new one. The
  // second request carries a nonce the edge cannot have cached.
  const asked = stubFetch(workingIndex({
    '/index/current.json': (nth) =>
      nth === 1 ? { build: '19990101T000000Z' } : { build: '20260811T003915Z' }
  }))
  const engine = await SemanticSearch.create()
  assert.equal(engine.basePath, BUILD, 'should end up on the published build')
  const pointers = asked.filter(u => u.startsWith('/index/current.json'))
  assert.equal(pointers.length, 2)
  assert.match(pointers[1], /\?b=/, 'the retry must be able to miss a CDN cache')
})

test('create gives up after one retry, with something to act on', async () => {
  // Both answers name a build that is not published: not a stale edge, so
  // retrying further would not help.
  const asked = stubFetch({ '/index/current.json': { build: '19990101T000000Z' } })
  await assert.rejects(SemanticSearch.create(), (err) => {
    assert.match(err.message, /no longer published -- reload the page/)
    return true
  })
  assert.equal(asked.filter(u => u.startsWith('/index/current.json')).length, 2,
    'exactly one retry, not a loop')
})

// --------------------------------------------------------------------------
// Cluster parsing
// --------------------------------------------------------------------------

const TAIL = { n: 2, rfc: [9111, '17a'], off: [10, 20], len: [5, 6], sec: [0, -1], title: [1, 1], str: ['3', 'Storing'] }

test('a cluster parses into vectors and its tail', async () => {
  stubFetch(workingIndex({
    [`${BUILD}/clusters/0001.bin`]: clusterFile(1, [[1, 0, 0, 0], [0, 1, 0, 0]], TAIL)
  }))
  const engine = await SemanticSearch.create()
  const cluster = await engine._fetchCluster(1)
  assert.equal(cluster.meta.n, 2)
  assert.deepEqual(cluster.meta.rfc, [9111, '17a'], 'rfc ids may be strings')
  assert.equal(cluster.vectors.length, 2 * DIMS)
})

test('a cluster whose header disagrees with its tail is rejected', async () => {
  stubFetch(workingIndex({
    [`${BUILD}/clusters/0001.bin`]: clusterFile(1, [[1, 0, 0, 0]], { ...TAIL, n: 2 })
  }))
  const engine = await SemanticSearch.create()
  await assert.rejects(engine._fetchCluster(1), /tail says n=2, header says 1/)
})

test('a cluster served under the wrong id is rejected', async () => {
  // Whole-file caching means a misrouted response is plausible bytes.
  stubFetch(workingIndex({
    [`${BUILD}/clusters/0001.bin`]: clusterFile(2, [[1, 0, 0, 0]], { ...TAIL, n: 1 })
  }))
  const engine = await SemanticSearch.create()
  await assert.rejects(engine._fetchCluster(1), /header says cluster 2/)
})

test('a cluster with an unreadable tail is rejected', async () => {
  const rows = new Int8Array([1, 0, 0, 0])
  const junk = new TextEncoder().encode('{not json')
  const bad = concat(
    header('RFCC', { count: 1, ident: 1, metaLen: junk.byteLength }),
    rows.buffer, junk.buffer
  )
  stubFetch(workingIndex({ [`${BUILD}/clusters/0001.bin`]: bad }))
  const engine = await SemanticSearch.create()
  await assert.rejects(engine._fetchCluster(1), /unreadable metadata tail/)
})

// --------------------------------------------------------------------------
// search(): the scoring loop and the result mapping
//
// The path with the most arithmetic in it and, until now, no coverage: dot()
// over the flat candidate list, _probe over the centroids, and the walk back
// out through the tail's string table. A fake pipeline is all it needs -- the
// model is the only reason this looked untestable.
// --------------------------------------------------------------------------

/** An engine over a two-cluster index, with a caller-supplied query vector. */
async function engineWith (query, over = {}) {
  stubFetch(workingIndex({
    // Cluster 0 sits along x, cluster 1 along y; the centroids in
    // workingIndex() point the same way, so a query picks a known cluster.
    [`${BUILD}/clusters/0000.bin`]: clusterFile(0, [[127, 0, 0, 0], [90, 90, 0, 0]], {
      n: 2,
      rfc: [9111, 9110],
      off: [10, 20],
      len: [5, 6],
      sec: [0, -1],
      title: [1, 2],
      str: ['3', 'Storing Responses', 'Abstract']
    }),
    [`${BUILD}/clusters/0001.bin`]: clusterFile(1, [[0, 127, 0, 0]], {
      n: 1, rfc: [2616], off: [1], len: [2], sec: [0], title: [0], str: ['9.1']
    }),
    ...over
  }))
  const engine = await SemanticSearch.create()
  engine.pipeline = async () => ({ data: new Float32Array(query) })
  return engine
}

test('search scores every probed chunk and ranks them', async () => {
  const engine = await engineWith([1, 0, 0, 0]) // pointing at cluster 0
  const hits = await engine.search('anything', { nprobe: 2, limit: 10 })
  assert.equal(hits.length, 3, 'every chunk in both probed clusters is a candidate')
  assert.deepEqual(hits.map(h => h.rfc), [9111, 9110, 2616])
  // Strictly descending, and scaled rather than raw int8.
  assert.ok(hits[0].score > hits[1].score && hits[1].score > hits[2].score)
  assert.ok(Math.abs(hits[0].score - 127 * SCALE) < 1e-6, `got ${hits[0].score}`)
})

test('search maps the tail back through its string table', async () => {
  const engine = await engineWith([1, 0, 0, 0])
  const [first, second] = await engine.search('anything', { nprobe: 1, limit: 10 })
  assert.deepEqual(first, {
    rfc: 9111, section: '3', title: 'Storing Responses', offset: 10, length: 5, score: first.score
  })
  // sec === -1 is the sentinel for a chunk with no section, not an index.
  assert.equal(second.section, null, 'a -1 section must not index into str')
  assert.equal(second.title, 'Abstract')
})

test('search honours limit and returns nothing for an empty query', async () => {
  const engine = await engineWith([1, 0, 0, 0])
  assert.equal((await engine.search('anything', { limit: 1 })).length, 1)
  assert.deepEqual(await engine.search('   '), [])
  assert.deepEqual(await engine.search('anything', { limit: 0 }), [])
})

test('nprobe decides how much of the index is looked at', async () => {
  const engine = await engineWith([1, 0, 0, 0])
  const one = await engine.search('anything', { nprobe: 1, limit: 10 })
  assert.deepEqual(one.map(h => h.rfc), [9111, 9110], 'only cluster 0')
  assert.equal(engine.stats.clusterFetches, 1)
})

test('a query pointing elsewhere probes the other cluster', async () => {
  const engine = await engineWith([0, 1, 0, 0])
  const hits = await engine.search('anything', { nprobe: 1, limit: 10 })
  assert.deepEqual(hits.map(h => h.rfc), [2616], 'centroid selection follows the query')
})

// --------------------------------------------------------------------------
// Cluster caching
// --------------------------------------------------------------------------

test('a cluster is fetched once and then reused', async () => {
  const engine = await engineWith([1, 0, 0, 0])
  await engine.search('a', { nprobe: 2, limit: 5 })
  await engine.search('b', { nprobe: 2, limit: 5 })
  assert.equal(engine.stats.clusterFetches, 2, 'two clusters, one fetch each')
  assert.equal(engine.stats.clusterHits, 2, 'the second query hit both')
})

test('the cluster cache is bounded and evicts oldest first', async () => {
  const engine = await engineWith([1, 0, 0, 0])
  engine.maxCachedClusters = 1
  await engine.search('a', { nprobe: 2, limit: 5 })
  assert.equal(engine.clusters.size, 1, 'unbounded growth is tens of MB a session')
  assert.ok(engine.clusters.has(1), 'the first inserted is the one dropped')
})

// --------------------------------------------------------------------------
// Remaining validation
// --------------------------------------------------------------------------

test('a cluster from a different model is rejected', async () => {
  const wrong = clusterFile(1, [[1, 2, 3, 4, 5, 6, 7, 8]], { ...TAIL, n: 1 })
  new DataView(wrong).setUint16(6, 8, true) // dims, as a wider model would write
  stubFetch(workingIndex({ [`${BUILD}/clusters/0001.bin`]: wrong }))
  const engine = await SemanticSearch.create()
  await assert.rejects(engine._fetchCluster(1), /8 dims, expected 4/)
})

test('a manifest without a usable scale is rejected', async () => {
  // Every score would be zero, and the results would look merely bad.
  for (const quant of [{}, { scale: 0 }, { scale: -1 }]) {
    stubFetch(workingIndex({ [`${BUILD}/manifest.json`]: manifest({ quant }) }))
    await assert.rejects(SemanticSearch.create(), /no usable quant.scale/)
  }
})

test('an explicit basePath keeps its trailing slash out of every URL', async () => {
  const asked = stubFetch(workingIndex())
  await SemanticSearch.create({ basePath: `${BUILD}//` })
  assert.ok(asked.includes(`${BUILD}/manifest.json`), `asked: ${asked}`)
})

test('every dimension contributes, including the last', async () => {
  // The scoring loop's bound is the one arithmetic error that stays silent:
  // dropping the final dimension leaves every result plausible and slightly
  // wrong. Fixtures whose signal sits in dimension 0 cannot see it, so this
  // one puts a chunk's entire weight in the last.
  const engine = await engineWith([0, 0, 0, 1], {
    [`${BUILD}/clusters/0000.bin`]: clusterFile(0, [[0, 0, 0, 127], [40, 0, 0, 0]], {
      n: 2, rfc: [1, 2], off: [0, 0], len: [1, 1], sec: [-1, -1], title: [0, 0], str: ['x']
    })
  })
  const hits = await engine.search('anything', { nprobe: 2, limit: 5 })
  assert.equal(hits[0].rfc, 1, 'a vector aligned only on the last dimension must win')
  assert.ok(Math.abs(hits[0].score - 127 * SCALE) < 1e-6, `got ${hits[0].score}`)
})

test('centroid selection reads every dimension too', async () => {
  // Same bound, on the other caller: _probe scores the centroids.
  stubFetch(workingIndex({
    [`${BUILD}/centroids.bin`]: centroidsFile([[0, 0, 0, 0], [0, 0, 0, 127]]),
    [`${BUILD}/clusters/0001.bin`]: clusterFile(1, [[1, 0, 0, 0]], {
      n: 1, rfc: [7], off: [0], len: [1], sec: [-1], title: [0], str: ['x']
    })
  }))
  const engine = await SemanticSearch.create()
  engine.pipeline = async () => ({ data: new Float32Array([0, 0, 0, 1]) })
  const hits = await engine.search('anything', { nprobe: 1, limit: 5 })
  assert.deepEqual(hits.map(h => h.rfc), [7], 'must probe the cluster the last dimension points at')
})
