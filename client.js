/* global history */

import * as util from './util.js'
import RfcData from './data.js'

class RfcFyiUi {
  verbose = false // whether we're showing obsolete, etc.
  params // the URL parameters
  searchWords = [] // words the user is searching for

  // Full-text mode. Off by default: prefix search over titles and keywords
  // is instant, needs nothing downloaded, and stays the better tool when you
  // know the words. Full text is for when you don't.
  fullText = false
  engine = null // SemanticSearch, constructed on first use
  semanticHits = null // Map rfcName -> [{ section, title, offset, score }]
  semanticOrder = [] // rfcNames, best score first
  semanticFor = null // the query semanticHits describes
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
  fullTextTarget = document.getElementById('fullText')
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
    this.fullTextTarget.onchange = this.fullTextHandler
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
    this.fullTextTarget.checked = this.fullText

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

  fullTextHandler (event) {
    ui.fullText = event.target.checked
    // A mode change invalidates any ranking we were holding.
    ui.semanticFor = null
    ui.showRfcs()
    ui.updateUrl()
  }

  ftStatus (message) {
    const el = document.getElementById('ftStatus')
    if (!el) return
    el.hidden = !message
    el.textContent = message || ''
  }

  async runSemanticSearch (query) {
    // Everything here is lazy on purpose. The engine pulls ~1.6 MiB of
    // centroids and the model ~32 MiB, and someone who never ticks the box
    // should pay for neither.
    try {
      if (!this.engine) {
        this.ftStatus('Loading search index\u2026')
        const { SemanticSearch } = await import('./search.js')
        this.engine = await SemanticSearch.create({
          basePath: '/index',
          onProgress: (msg) => this.ftStatus(msg)
        })
        this.ftStatus('Loading search model (~32 MB, once)\u2026')
        await this.engine.loadModel()
      }
      this.ftStatus('Searching\u2026')
      const hits = await this.engine.search(query, { nprobe: 20, limit: 200 })

      // Collapse chunk hits to RFC rows, best chunk first within each, and
      // order the rows by their best chunk. rfc.fyi is a finder: the row is
      // the document, the sections are the evidence.
      const byRfc = new Map()
      hits.forEach(hit => {
        const name = data.rfcNumtoName(String(hit.rfc))
        if (!data.rfcs[name]) return // an id we have no metadata for
        if (!byRfc.has(name)) byRfc.set(name, [])
        byRfc.get(name).push(hit)
      })
      this.semanticHits = byRfc
      this.semanticOrder = Array.from(byRfc.keys())
      this.semanticFor = query
      this.ftStatus('')
      this.showRfcs()
    } catch (err) {
      console.error('[search] full-text search failed:', err)
      this.semanticFor = query
      this.semanticHits = new Map()
      this.semanticOrder = []
      this.ftStatus('Full-text search is unavailable. Untick it to search titles and keywords.')
      this.showRfcs()
    }
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

    this.clear(target)
    let searchedRfcs = new Set()
    let taggedRfcs = new Set()
    let relevantRfcs = new Set()
    let rfcList = []
    let userInput = false
    if (this.activeTags.size !== 0 ||
      (semantic && this.searchWords.length !== 0) ||
      (this.searchWords.length !== 0 && !isNaN(parseInt(this.searchWords[0]))) ||
      (this.searchWords.length !== 0 && this.searchWords[0].length >= data.prefixLen)) {
      userInput = true
      taggedRfcs = data.listTaggedRfcs(this.activeTags)
      if (semantic) {
        const query = this.searchWords.join(' ')
        if (this.semanticFor !== query) {
          this.runSemanticSearch(query)
          return
        }
        // Already ranked; keep that order. Tags still intersect, exactly as
        // they do for prefix hits.
        rfcList = this.semanticOrder.filter(name => taggedRfcs.has(name))
        relevantRfcs = new Set(rfcList)
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
      rfcList.forEach(item => {
        const rfcData = data.rfcs[item]
        this.renderRfc(item, rfcData, target, false,
          semantic ? this.semanticHits.get(item) : null)
      })
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
      this.showRelevantTags(searchedRfcs)
    }

    // count
    const count = document.createTextNode(`${rfcList.length} RFC${this.pluralise(rfcList.length)}`)
    const countTarget = document.getElementById('count')
    this.clear(countTarget)
    countTarget.appendChild(count)

    // empty state
    const emptyTarget = document.getElementById('empty')
    if (emptyTarget) {
      if (userInput && rfcList.length === 0) {
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
    if (hideRefs !== true && refCount > 0) {
      const refSpan = document.createElement('span')
      refSpan.className = 'refcount'
      const refCountLink = document.createElement('button')
      refCountLink.type = 'button'
      refCountLink.className = 'refcountlink'
      refCountLink.onclick = this.refExpandHandler
      const refCountText = document.createTextNode(`${refCount.toLocaleString()} referencing RFC${this.pluralise(refCount)}`)
      refCountLink.appendChild(refCountText)
      refSpan.appendChild(refCountLink)
      rfcBody.appendChild(refSpan)
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
        a.href = `https://www.rfc-editor.org/rfc/rfc${rfcNum}.txt#offset-${hit.offset}`
        const label = hit.section ? `\u00A7${hit.section} ${hit.title || ''}` : (hit.title || 'Abstract')
        a.appendChild(document.createTextNode(label.trim()))
        li.appendChild(a)
        secList.appendChild(li)
      })
      rfcBody.appendChild(secList)
    }
    rfcSpan.appendChild(rfcBody)
    target.appendChild(rfcSpan)
  }

  refExpandHandler (event) {
    const refList = document.createElement('ul')
    const rfcElement = event.target.closest('li')
    const rfcName = data.rfcNumtoName(rfcElement.num)
    const rfcRefs = data.getObsoleteRefs(rfcName)
    rfcRefs.forEach(ref => {
      //    const normative = ref[0]
      const refName = ref[1]
      const refData = data.rfcs[refName]
      ui.renderRfc(refName, refData, refList, true)
    })
    event.target.parentElement.appendChild(refList)
    event.target.removeChild(event.target.firstChild)
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
