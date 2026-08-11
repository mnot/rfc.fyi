/* global history, caches */

import * as util from './util.js'
import RfcData from './data.js'

/* Rows shown in full-text mode. See showRfcs() for why this is a rank cap
 * and not a score floor. */
const SEMANTIC_ROW_CAP = 50

class RfcFyiUi {
  verbose = false // whether we're showing obsolete, etc.
  params // the URL parameters
  searchWords = [] // words the user is searching for

  // Full-text mode. Off by default: prefix search over titles and keywords
  // is instant, needs nothing downloaded, and stays the better tool when you
  // know the words. Full text is for when you don't.
  fullText = false
  engine = null // SemanticSearch, constructed on first use
  prefetching = false
  semanticHits = null // Map rfcName -> [{ section, title, offset, score }]
  semanticOrder = [] // rfcNames, best score first
  semanticFor = null // the query semanticHits describes
  semanticTotal = 0 // rows before the rank cap, for an honest count
  semanticTimer = null
  semanticToken = 0
  // Hoisted out of showRfcs, which took it as an argument defaulting to true
  // while six of its eight call sites passed nothing -- so choosing "sort by
  // number" and then typing another character silently reverted to refs.
  sortByRef = true

  activeTags = new Map() // what tags are active, one for each type
  tagTargets = {} // holds references to tag elements
  unshownTagTypes = ['status']
  tagColours = {
    stream: '#573',
    level: '#955',
    wg: '#cc6'
  }

  obsoleteTarget = document.getElementById('obsolete')
  searchTarget = document.getElementById('search')
  clearSearchTarget = document.getElementById('clearSearch')
  form = document.forms[0]
  title = document.getElementById('title')

  constructor () {
    util.addDOMLoadEvent(() => {
      this.installFormHandlers()
      this.installClickHandlers()
      this.loadUi()
      window.onpopstate = () => {
        this.loadUi()
        this.showRfcs()
      }
      this.registerServiceWorker()
      this.refreshModelHint()
    })
  }

  registerServiceWorker () {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((registration) => {
          console.log('[SW] Registered with scope:', registration.scope)
        }).catch((error) => {
          console.error('[SW] Registration failed:', error)
        })
      })
    }
  }

  installFormHandlers () {
    this.obsoleteTarget.onchange = this.showObsoleteHandler
    this.searchTarget.placeholder = 'Search titles & keywords'
    this.searchTarget.oninput = this.searchInput
    this.searchTarget.disabled = false
    this.searchTarget.focus()
    this.clearSearchTarget.onclick = this.clearSearchHandler
    this.form.onsubmit = this.updateUrl
    this.title.onclick = function () {
      window.location = '/'
    }
    const reloadBtn = document.getElementById('reloadBtn')
    if (reloadBtn) reloadBtn.onclick = () => window.location.reload()
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') ui.resetToHome()
    })
  }

  resetToHome () {
    this.searchTarget.value = ''
    this.searchWords = []
    this.clearActiveTags()
    this.showRfcs()
    this.updateUrl()
    this.searchTarget.focus()
  }

  installClickHandlers () {
    const sortByNum = document.getElementById('sortByNumber')
    sortByNum.onclick = (event) => { this.sortByRef = false; this.showRfcs(); return false }
    const sortByRefs = document.getElementById('sortByRefs')
    sortByRefs.onclick = (event) => { this.sortByRef = true; this.showRfcs(); return false }
    document.getElementById('modeTitles').onclick = () => { this.setMode(false); return false }
    document.getElementById('modeFullText').onclick = () => { this.setMode(true); return false }
    const filterToggle = document.getElementById('filterToggle')
    if (filterToggle) filterToggle.onclick = this.toggleFilters
  }

  toggleFilters (event) {
    const container = document.getElementById('container')
    const toggle = document.getElementById('filterToggle')
    const open = container.classList.toggle('filters-open')
    if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    event.stopPropagation()
    return false
  }

  updateFilterToggle () {
    const toggle = document.getElementById('filterToggle')
    if (!toggle) return
    const n = this.activeTags.size
    toggle.textContent = n > 0 ? `Filters (${n})` : 'Filters'
  }

  loadUi (...args) {
    const url = new URL(window.location.href)
    this.params = new URLSearchParams(url.search)

    // search
    const search = this.params.get('search') || ''
    this.searchTarget.value = search
    this.searchWords = search.split(' ').filter(word => word)

    // verbose
    this.verbose = this.params.has('obsolete')
    this.obsoleteTarget.checked = this.verbose

    // full text
    this.fullText = this.params.has('ft')
    this.applyMode()

    // tags
    if (this.tagTargets.collection) { // only if tags are initialized
      this.clearActiveTags()
      data.tagTypes.forEach(tagType => {
        const urlTagString = this.params.get(tagType)
        const urlActiveTags = urlTagString ? urlTagString.split(',') : []
        urlActiveTags.forEach(tagName => {
          this.setActiveTag(tagType, tagName)
        })
      })
    }
  }

  clearActiveTags () {
    this.activeTags.forEach((tagName, tagType) => {
      const target = this.tagTargets[tagType] ? this.tagTargets[tagType][tagName] : null
      if (target) {
        target.classList.remove('tag-active')
        target.setAttribute('aria-pressed', 'false')
      }
    })
    this.activeTags.clear()
  }

  dataLoaded () {
    if (data.loadError) {
      ui.showDataError()
      return
    }
    ui.initTags()
    ui.showRfcs()
  }

  /* transformers.js keeps the model in its own Cache API bucket, so the
   * download is a one-off across sessions -- but the hint saying so is only
   * true until it happens. Checked on load rather than remembered in
   * localStorage, since the browser can evict the cache without telling us
   * and a stale "already downloaded" is the more annoying lie.
   */
  async refreshModelHint () {
    const hint = document.querySelector('#modeFullText .hint')
    if (!hint) return
    const modelId = (this.engine && this.engine.manifest &&
      this.engine.manifest.model && this.engine.manifest.model.id) || 'bge-small'
    let cached = false
    try {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name)
        const keys = await cache.keys()
        // Match the model this index was actually built with, rather than
        // a hardcoded name: everything else reads it from the manifest, and
        // a changed model would otherwise leave the hint permanently wrong.
        if (keys.some(r => r.url.includes(modelId))) { cached = true; break }
      }
    } catch { /* no Cache API, or blocked: leave the hint as written */ }
    hint.hidden = cached
  }

  setMode (fullText) {
    if (this.fullText === fullText) return
    this.fullText = fullText
    this.semanticFor = null // a mode change invalidates any ranking held
    this.applyMode() // which starts the prefetch
    this.showRfcs()
    this.updateUrl()
  }

  applyMode () {
    const titles = document.getElementById('modeTitles')
    const full = document.getElementById('modeFullText')
    if (!titles || !full) return
    titles.classList.toggle('sort-active', !this.fullText)
    full.classList.toggle('sort-active', this.fullText)
    // Full-text wants a phrase, not a keyword. Measured over the query set,
    // recall falls from 0.701 on a ~10-word phrase to 0.138 on a single
    // word -- so a placeholder inviting keywords steers people into the one
    // shape this mode is worst at, and which titles-and-keywords is best at.
    this.searchTarget.placeholder = this.fullText
      ? 'Describe what you\u2019re looking for'
      : 'Search titles & keywords'
    const exTitles = document.getElementById('examplesTitles')
    const exFull = document.getElementById('examplesFullText')
    if (exTitles && exFull) {
      exTitles.hidden = this.fullText
      exFull.hidden = !this.fullText
    }
    // Selecting the mode is the opt-in, so start fetching immediately rather
    // than waiting for a query. The download is tens of megabytes and several
    // seconds; overlapping it with typing is most of the difference between
    // the feature feeling instant and feeling broken.
    if (this.fullText) this.prefetchEngine()
  }

  /* Warm the engine without running a query. Safe to call repeatedly: the
   * work is guarded by `this.engine` and by loadModel() being idempotent.
   */
  prefetchEngine () {
    if (this.prefetching || this.engine) return
    this.prefetching = true
    ;(async () => {
      try {
        const { SemanticSearch } = await import('./search.js')
        const engine = await SemanticSearch.create({
          onProgress: (event) => {
            // Don't talk over a search that has since started.
            if (!this.semanticFor) this.ftProgress(event)
          }
        })
        await engine.loadModel()
        this.engine = engine
        this.refreshModelHint()
        if (!this.semanticFor) this.ftStatus('')
      } catch (err) {
        console.error('[search] prefetch failed:', err)
        // Stay quiet: nothing was asked for yet. A real query will surface it.
      } finally {
        this.prefetching = false
      }
    })()
  }

  ftStatus (message, busy = true) {
    const el = document.getElementById('ftStatus')
    if (!el) return
    el.hidden = !message
    el.textContent = ''
    if (!message) return
    if (busy) {
      const spin = document.createElement('span')
      spin.className = 'spinner'
      spin.setAttribute('aria-hidden', 'true')
      el.appendChild(spin)
    }
    el.appendChild(document.createTextNode(message))
  }

  // transformers.js reports per-file download progress. The model is tens of
  // megabytes over several files, so a percentage is worth far more than an
  // indeterminate spinner -- the wait is long enough that people need to know
  // it is finite.
  ftProgress (event) {
    if (!event || typeof event !== 'object') {
      this.ftStatus(String(event || ''))
      return
    }
    if (event.phase === 'model' && event.status === 'progress' && event.total) {
      const pct = Math.round((event.loaded / event.total) * 100)
      const mb = (event.total / 1048576).toFixed(1)
      const file = String(event.file || '').split('/').pop()
      this.ftStatus(`Downloading search model \u2014 ${pct}% of ${mb} MB (${file})`)
      return
    }
    if (event.phase === 'manifest' || event.phase === 'centroids') {
      this.ftStatus('Loading search index\u2026')
      return
    }
    if (event.status === 'ready' || event.status === 'done') return
    this.ftStatus('Preparing search model\u2026')
  }

  /* Debounced, and only the newest query is allowed to land.
   *
   * searchInput fires per keystroke, and in full-text mode `semantic` is
   * true from the first character -- the prefix path at least has
   * data.prefixLen as a floor -- so typing "cache" used to start five
   * searches, each an embed plus up to twenty cluster fetches. Out-of-order
   * completion was not permanently corrupting, but a late resolver would
   * claim semanticFor for its own stale query and trigger a third search.
   */
  scheduleSemanticSearch (query) {
    clearTimeout(this.semanticTimer)
    this.semanticTimer = setTimeout(() => this.runSemanticSearch(query), 200)
  }

  async runSemanticSearch (query) {
    const token = ++this.semanticToken
    // Everything here is lazy on purpose. The engine pulls ~1.6 MiB of
    // centroids and the model ~32 MiB, and someone who never ticks the box
    // should pay for neither.
    try {
      if (!this.engine) {
        this.ftStatus('Loading search index\u2026')
        const { SemanticSearch } = await import('./search.js')
        const engine = await SemanticSearch.create({
          onProgress: (event) => this.ftProgress(event)
        })
        await engine.loadModel()
        this.engine = engine
        this.refreshModelHint()
      }
      this.ftStatus('Searching\u2026')
      const hits = await this.engine.search(query, { limit: 200 })

      // Collapse chunk hits to RFC rows, best chunk first within each, and
      // order the rows by their best chunk. rfc.fyi is a finder: the row is
      // the document, the sections are the evidence.
      const byRfc = new Map()
      const seenSections = new Map() // rfcName -> Set of section keys
      hits.forEach(hit => {
        const name = data.rfcNumtoName(String(hit.rfc))
        if (!data.rfcs[name]) return // an id we have no metadata for
        // One row per section, not per chunk. A section runs to several
        // chunks, so without this the same heading renders two or three
        // times under one RFC and the extra slots say nothing -- the worst
        // observed case filled both displayed lines with the same section.
        // Hits arrive best-first, so the first one kept is the strongest.
        const key = hit.section || hit.title || ''
        if (!seenSections.has(name)) seenSections.set(name, new Set())
        if (seenSections.get(name).has(key)) return
        seenSections.get(name).add(key)
        if (!byRfc.has(name)) byRfc.set(name, [])
        byRfc.get(name).push(hit)
      })
      if (token !== this.semanticToken) return // superseded while in flight
      this.semanticHits = byRfc
      const score = new Map()
      byRfc.forEach((hits, name) => score.set(name, this.rowScore(query, name, hits)))
      this.semanticOrder = Array.from(byRfc.keys())
        .sort((a, b) => score.get(b) - score.get(a))
      this.semanticFor = query
      this.ftStatus('')
      this.showRfcs()
    } catch (err) {
      console.error('[search] full-text search failed:', err)
      if (token !== this.semanticToken) return
      this.semanticFor = query
      this.semanticHits = new Map()
      this.semanticOrder = []
      // Say what actually broke. "Unavailable" alone is the same sentence
      // for a missing index, a blocked CDN and a failed query, which makes
      // it useless to whoever has to fix it -- including me.
      const why = (err && err.message) ? err.message : String(err)
      this.ftStatus(`Full-text search is unavailable: ${why}`, false)
      this.showRfcs()
    }
  }

  /**
   * How strongly an RFC answers the query, from its matched sections plus two
   * weak priors.
   *
   * Ranking on the single best passage, which is what this replaced, scores a
   * document that is *about* the query the same as one that mentions it once:
   * "HTTP caching" put RFC 9111 tenth. Three sections at 1/3 weight each means
   * a document needs several good passages to lead, and one strong passage no
   * longer carries a whole RFC.
   *
   * Measured over the 87 labelled queries, recall@10 goes 0.649 -> 0.785 and
   * the median rank of the first relevant RFC 4 -> 2. Split in half, the gain
   * holds on both halves independently (0.648 -> 0.818, 0.651 -> 0.752), so it
   * is not the coefficients fitting the query set. They are still hand-picked;
   * the citation weight in particular is sharp, and 0.05 loses more than 0.02
   * gains by promoting RFCs on citation count alone.
   */
  rowScore (query, rfcName, hits) {
    const top = hits.slice(0, 3)
    const passages = top.reduce((sum, hit) => sum + hit.score, 0) / 3
    const title = this.titleOverlap(query, (data.rfcs[rfcName] || {}).title)
    const cited = Math.log1p(data.obsoleteRefs.get(rfcName) || 0)
    return passages + 0.2 * title + 0.02 * cited
  }

  /* Query words present in the title, as a fraction. Lexical on purpose: the
     corpus embedding never saw the titles, and "HTTP caching" is the title of
     the RFC it should return first. */
  titleOverlap (query, title) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (words.length === 0) return 0
    const haystack = (title || '').toLowerCase()
    return words.filter(w => haystack.includes(w)).length / words.length
  }

  showDataError () {
    const err = document.getElementById('dataError')
    if (err) err.hidden = false
    this.searchTarget.disabled = true
    this.searchTarget.placeholder = 'Couldn’t load data'
  }

  showRfcs () {
    const sortByRef = this.sortByRef
    const target = document.getElementById('rfc-list')
    const sortNum = document.getElementById('sortByNumber')
    const sortRef = document.getElementById('sortByRefs')
    if (sortByRef) {
      sortNum.classList.remove('sort-active')
      sortRef.classList.add('sort-active')
    } else {
      sortNum.classList.add('sort-active')
      sortRef.classList.remove('sort-active')
    }
    // In full-text mode the list is *truncated* by relevance, so ranking
    // decides membership and not merely order. Re-sorting the survivors by
    // RFC number would show an arbitrary slice in numeric order, which is
    // meaningless in a way it never is over the complete set prefix search
    // returns. So the control goes away rather than becoming a third option.
    const semantic = this.fullText && this.searchWords.length !== 0
    document.getElementById('sort').hidden = semantic
    document.getElementById('sortRelevance').hidden = !semantic

    let searchedRfcs = new Set()
    let taggedRfcs = new Set()
    let relevantRfcs = new Set()
    let rfcList = []
    let userInput = false
    let pending = false
    if (this.activeTags.size !== 0 ||
      (semantic && this.searchWords.length !== 0) ||
      (this.searchWords.length !== 0 && !isNaN(parseInt(this.searchWords[0]))) ||
      (this.searchWords.length !== 0 && this.searchWords[0].length >= data.prefixLen)) {
      userInput = true
      taggedRfcs = data.listTaggedRfcs(this.activeTags)
      if (semantic) {
        const query = this.searchWords.join(' ')
        if (this.semanticFor !== query) {
          // Kick off the search and fall through. Returning here left the
          // list cleared while #count still showed the previous number, and
          // skipped setContainer() -- which is what kept the download
          // progress hidden, since #ftStatus only shows outside .noresults.
          this.scheduleSemanticSearch(query)
          pending = true
        }
        // Already ranked; keep that order. Tags still intersect, exactly as
        // they do for prefix hits.
        if (!pending) {
          rfcList = this.semanticOrder.filter(name => taggedRfcs.has(name))
          relevantRfcs = new Set(rfcList)
        }
      } else {
        searchedRfcs = data.searchRfcs(this.searchWords)
        relevantRfcs = taggedRfcs.intersection(searchedRfcs)
        rfcList = Array.from(relevantRfcs)
        if (sortByRef === true) {
          rfcList.sort(this.refSort)
        } else {
          rfcList.sort(this.rfcSort)
        }
      }
      if (!this.verbose) {
        // Filter before any truncation, or a capped list silently returns
        // fewer than it promised.
        rfcList = rfcList.filter(item => data.rfcs[item].status !== 'obsoleted')
      }
      if (semantic) {
        // Cap by rank, not by score. Cosine scores here do not separate
        // relevant from irrelevant at all -- measured over the query set,
        // labelled-relevant chunks run a median 0.758 against 0.746 for
        // everything else, so any absolute floor discards good material to
        // remove almost no noise, and a relative one is no better. Rank
        // does carry the signal: the median labelled RFC lands at position
        // 5, and recall saturates by 50 rows (88.5%, against 89.4% at any
        // depth). Past that it is tail nobody scrolls to.
        this.semanticTotal = rfcList.length
        rfcList = rfcList.slice(0, SEMANTIC_ROW_CAP)
      }
      if (!pending) {
        this.clear(target)
        rfcList.forEach(item => {
          const rfcData = data.rfcs[item]
          this.renderRfc(item, rfcData, target, false,
            semantic ? this.semanticHits.get(item) : null)
        })
      }
    } else {
      this.clear(target)
    }

    // tags
    if (!userInput) { // default screen
      const relevantTags = {
        collection: new Set(data.tags?.collection ? data.tags.collection.keys() : []),
        stream: new Set(data.tags?.stream ? data.tags.stream.keys() : [])
      }
      this.showTags(relevantTags, true)
    } else if (this.activeTags.has('collection')) { // show a collection
      this.showRelevantTags(relevantRfcs)
    } else if (this.searchWords.length === 0) { // just tags
      this.showRelevantTags(taggedRfcs)
    } else { // search (and possibly tags), but only worry about search terms
      // The unfiltered result set, so the facets offer what is actually
      // there to narrow to. In full-text mode `searchedRfcs` is never
      // populated -- the ranking is, so use that instead or the stream and
      // level filters silently disappear exactly when a broad semantic
      // result most needs narrowing.
      this.showRelevantTags(semantic ? new Set(this.semanticOrder) : searchedRfcs)
    }

    // count
    const truncated = semantic && !pending && this.semanticTotal > rfcList.length
    const count = document.createTextNode(pending
      ? 'Searching\u2026'
      : truncated
        ? `top ${rfcList.length} of ${this.semanticTotal} RFCs`
        : `${rfcList.length} RFC${this.pluralise(rfcList.length)}`)
    const countTarget = document.getElementById('count')
    this.clear(countTarget)
    countTarget.appendChild(count)

    // empty state
    const emptyTarget = document.getElementById('empty')
    if (emptyTarget) {
      if (userInput && !pending && rfcList.length === 0) {
        emptyTarget.textContent = this.verbose
          ? 'No RFCs match. Try a broader term, check the spelling, or pick a collection.'
          : 'No RFCs match. Try a broader term, or tick “Show obsolete and historic RFCs” to include older ones.'
        emptyTarget.hidden = false
      } else {
        emptyTarget.hidden = true
      }
    }

    this.updateFilterToggle()
    this.setContainer(rfcList.length > 0 || userInput)
  }

  renderRfc (rfcName, rfcData, target, hideRefs, sections) {
    const rfcNum = data.rfcNametoNum(rfcName)
    const rfcSpan = document.createElement('li')
    rfcSpan.className = `status-${rfcData.status} stream-${rfcData.stream} level-${rfcData.level}`
    rfcSpan.num = rfcNum
    rfcSpan.data = rfcData
    const rfcRef = document.createElement('a')
    rfcRef.className = 'reference'
    rfcRef.href = `https://bib.ietf.org/public/rfc/bibxml/reference.RFC.${rfcNum}.xml`
    rfcRef.appendChild(document.createTextNode(`RFC\u00A0${rfcNum}`))
    rfcSpan.appendChild(rfcRef)
    const rfcBody = document.createElement('span')
    rfcBody.className = 'rfc-body'
    const rfcLink = document.createElement('a')
    rfcLink.href = `https://www.rfc-editor.org/info/rfc${rfcNum}/`
    rfcBody.appendChild(rfcLink)
    const rfcTitle = document.createTextNode(rfcData.title)
    rfcLink.appendChild(rfcTitle)
    if (rfcData.stream !== 'ietf') {
      this.renderTag('stream', rfcData.stream, rfcBody)
    }
    if (rfcData.level !== 'std') {
      this.renderTag('level', rfcData.level, rfcBody)
    }
    if (rfcData.wg) {
      this.renderTag('wg', rfcData.wg, rfcBody)
    }
    const refCount = data.obsoleteRefs.get(rfcName)
    let refSpan = null
    if (hideRefs !== true && refCount > 0) {
      refSpan = document.createElement('span')
      refSpan.className = 'refcount'
      const refCountLink = document.createElement('button')
      refCountLink.type = 'button'
      refCountLink.className = 'refcountlink'
      refCountLink.setAttribute('aria-expanded', 'false')
      refCountLink.onclick = this.refExpandHandler
      const refCountText = document.createTextNode(`${refCount.toLocaleString()} referencing RFC${this.pluralise(refCount)}`)
      refCountLink.appendChild(refCountText)
      refSpan.appendChild(refCountLink)
    }
    if (sections && sections.length) {
      // The matched passages. This is the visible difference between full
      // text and title search -- without it the feature looks identical to
      // the one that was already here.
      const secList = document.createElement('ul')
      secList.className = 'sections'
      sections.slice(0, 3).forEach(hit => {
        const li = document.createElement('li')
        const a = document.createElement('a')
        // The HTML rendering, at the section anchor rfc-editor actually
        // publishes. Both the modern xml2rfc output and the legacy
        // conversions carry id="section-N", so this works across the series.
        // (`#offset-N` was invented and resolved to nothing.)
        a.href = hit.section
          ? `https://www.rfc-editor.org/rfc/rfc${rfcNum}.html#section-${hit.section}`
          : `https://www.rfc-editor.org/rfc/rfc${rfcNum}.html`
        const label = hit.section ? `\u00A7${hit.section} ${hit.title || ''}` : (hit.title || 'Abstract')
        a.appendChild(document.createTextNode(label.trim()))
        li.appendChild(a)
        secList.appendChild(li)
      })
      rfcBody.appendChild(secList)
    }
    // After the sections: expanded, the reference list runs to hundreds of
    // rows, and above them it pushes the matched passages off the screen.
    if (refSpan) rfcBody.appendChild(refSpan)
    rfcSpan.appendChild(rfcBody)
    target.appendChild(rfcSpan)
  }

  refExpandHandler (event) {
    const button = event.target.closest('button')
    const refSpan = button.parentElement
    const expand = button.getAttribute('aria-expanded') !== 'true'
    button.setAttribute('aria-expanded', expand ? 'true' : 'false')

    let refList = refSpan.querySelector('ul')
    if (refList) {
      refList.hidden = !expand
      event.stopPropagation()
      return false
    }
    // Built once, then kept and toggled. The label stays: removing it left
    // an empty button, so an expanded list could never be collapsed again.
    refList = document.createElement('ul')
    const rfcElement = button.closest('li')
    const rfcName = data.rfcNumtoName(rfcElement.num)
    data.getObsoleteRefs(rfcName).forEach(ref => {
      ui.renderRfc(ref[1], data.rfcs[ref[1]], refList, true)
    })
    refSpan.appendChild(refList)
    event.stopPropagation()
    return false
  }

  initTags () {
    data.tagTypes.forEach(tagType => {
      if (this.unshownTagTypes.includes(tagType)) return
      const targetDiv = document.getElementById(tagType)
      this.tagTargets[tagType] = {}
      // render the tag list
      const tagList = data.tags[tagType].keys()
      tagList.sort()
      tagList.forEach(tagName => {
        const tagSpan = this.renderTag(tagType, tagName, targetDiv, this.clickTagHandlerFactory)
        this.tagTargets[tagType][tagName] = tagSpan
      })
    })
    this.loadUi()
  }

  renderTag (tagType, tagName, target, clickHandlerFactory) {
    const tagData = data.tags[tagType][tagName]
    const interactive = clickHandlerFactory !== undefined
    const tagContent = document.createTextNode(tagName)
    const tagSpan = document.createElement(interactive ? 'button' : 'span')
    if (interactive) tagSpan.type = 'button'
    tagSpan.appendChild(tagContent)
    tagSpan.classList.add('tag')
    tagSpan.style.backgroundColor = tagData.colour || this.tagColours[tagType] || util.genColour(tagName)
    tagSpan.style.color = util.revColour(tagSpan.style.backgroundColor)
    if (interactive) {
      tagSpan.setAttribute('aria-pressed', 'false')
      tagSpan.onclick = clickHandlerFactory(tagType, tagName)
    } else {
      tagSpan.style.cursor = 'default'
    }
    target.appendChild(tagSpan)
    target.appendChild(document.createTextNode(' '))
    return tagSpan
  }

  clickTagHandlerFactory (tagType, tagName) {
    return (event) => {
      ui.setActiveTag(tagType, tagName)
      ui.showRfcs()
      ui.updateUrl()
      event.stopPropagation()
      return false
    }
  }

  setActiveTag (tagType, tagName) {
    const hilight = tagType !== 'collection'
    const currentActiveTag = ui.activeTags.get(tagType)
    if (currentActiveTag) {
      const prev = this.tagTargets[tagType][currentActiveTag]
      if (prev) {
        if (hilight) prev.classList.remove('tag-active')
        prev.setAttribute('aria-pressed', 'false')
      }
      this.activeTags.delete(tagType)
    }
    if (!currentActiveTag || currentActiveTag !== tagName) {
      const next = this.tagTargets[tagType][tagName]
      if (next) {
        if (hilight) next.classList.add('tag-active')
        next.setAttribute('aria-pressed', 'true')
      }
      this.activeTags.set(tagType, tagName)
    }
  }

  showRelevantTags (rfcSet) {
    const relevantTags = {}
    data.tagTypes.forEach(tagType => {
      relevantTags[tagType] = new Set()
      const activeTag = this.activeTags.get(tagType)
      if (activeTag) relevantTags[tagType].add(activeTag)
    })
    rfcSet.forEach(rfcName => {
      if (!this.verbose) {
        if (data.rfcs[rfcName].status === 'obsoleted') {
          return
        }
      }
      data.tagTypes.forEach(tagType => {
        const tagName = data.rfcs[rfcName][tagType]
        if (tagName) {
          relevantTags[tagType].add(tagName)
        }
      })
    })
    this.showTags(relevantTags)
  }

  showTags (relevantTags, showHeader = true) {
    data.tagTypes.forEach(tagType => {
      const header = document.getElementById(tagType + '-header')
      if (!header) return
      if (this.unshownTagTypes.includes(tagType)) return
      if (!relevantTags[tagType]) {
        relevantTags[tagType] = new Set()
      }
      header.style.display = showHeader && relevantTags[tagType].size > 0 ? 'block' : 'none'
      if (data.tags[tagType]) {
        data.tags[tagType].forEach(tagName => {
          const visibility = relevantTags[tagType].has(tagName) ? 'inline' : 'none'
          this.tagTargets[tagType][tagName].style.display = visibility
        })
      }
    })
  }

  searchInput () {
    const searchText = document.getElementById('search').value
    ui.searchWords = searchText.split(' ').filter(word => word)
    ui.showRfcs()
  }

  clearSearchHandler (event) {
    ui.resetToHome()
    event.stopPropagation()
    return false
  }

  showObsoleteHandler (event) {
    ui.verbose = ui.obsoleteTarget.checked
    ui.showRfcs()
    ui.updateUrl()
    event.stopPropagation()
    return false
  }

  updateUrl () {
    const queries = []
    if (ui.searchWords.length > 0) {
      queries.push('search=' + ui.searchWords.join('%20'))
    }
    if (ui.verbose) {
      queries.push('obsolete')
    }
    // Mode belongs in the URL: it changes what the results *are*, not
    // merely their order, so a shared link has to reproduce it.
    if (ui.fullText) {
      queries.push('ft')
    }
    ui.activeTags.forEach((tagName, tagType) => {
      queries.push(`${tagType}=${tagName}`)
    })
    let url = './'
    if (queries.length > 0) url += '?'
    url += queries.join('&')
    const title = `rfc.fyi: ${ui.searchWords.join(' ')}`
    history.pushState({}, title, url)
    return false
  }

  clear (target) {
    while (target.firstChild) {
      target.removeChild(target.firstChild)
    }
  }

  setContainer (hasResults) {
    const container = document.getElementById('container')
    const filtersOpen = hasResults && container.classList.contains('filters-open')
    container.className = hasResults ? 'results' : 'noresults'
    if (filtersOpen) {
      container.classList.add('filters-open')
    } else {
      const toggle = document.getElementById('filterToggle')
      if (toggle) toggle.setAttribute('aria-expanded', 'false')
    }
  }

  rfcSort (a, b) {
    return parseInt(b.replace('RFC', '')) - parseInt(a.replace('RFC', ''))
  }

  refSort (a, b) {
    return data.obsoleteRefs.get(b) - data.obsoleteRefs.get(a)
  }

  pluralise (num) {
    if (num === 0) {
      return 's'
    }
    if (num > 1) {
      return 's'
    }
    return ''
  }
}

const ui = new RfcFyiUi()
const data = new RfcData(ui.dataLoaded)
