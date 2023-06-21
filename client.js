/* global history */

import * as util from './util.js'
import RfcData from './data.js'

class RfcFyiUi {
  verbose = false // whether we're showing obsolete, etc.
  params // the URL parameters
  searchWords = [] // words the user is searching for

  activeTags = new Map() // what tags are active, one for each type
  tagTargets = {} // holds references to tag elements
  unshownTagTypes = ['status']
  tagColours = {
    stream: '#678',
    level: '#a33',
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
      window.onpopstate = this.loadUi
    })
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
  }

  installClickHandlers () {
    const sortByNum = document.getElementById('sortByNumber')
    sortByNum.onclick = (event) => { this.showRfcs(); return false }
    const sortByRefs = document.getElementById('sortByRefs')
    sortByRefs.onclick = (event) => { this.showRfcs(true); return false }
  }

  loadUi (...args) {
    const url = new URL(window.location.href)
    this.params = new URLSearchParams(url.search)
    const search = this.params.get('search') || ''
    document.getElementById('search').value = search
    this.searchWords = search.split(' ').filter(word => word)
    if (this.params.has('obsolete')) {
      this.verbose = true
    }
    this.obsoleteTarget.checked = this.verbose
  }

  dataLoaded () {
    ui.initTags()
    ui.showRfcs()
  }

  showRfcs (sortByRef) {
    const target = document.getElementById('rfc-list')
    this.clear(target)
    let searchedRfcs = new Set()
    let taggedRfcs = new Set()
    let relevantRfcs = new Set()
    let rfcList = []
    let userInput = false
    if (this.activeTags.size !== 0 ||
        (this.searchWords.length !== 0 && !isNaN(parseInt(this.searchWords[0]))) ||
        (this.searchWords.length !== 0 && this.searchWords[0].length >= data.prefixLen)) {
      userInput = true
      searchedRfcs = data.searchRfcs(this.searchWords)
      taggedRfcs = data.listTaggedRfcs(this.activeTags)
      relevantRfcs = taggedRfcs.intersection(searchedRfcs)
      rfcList = Array.from(relevantRfcs)
      if (sortByRef === true) {
        rfcList.sort(this.refSort)
      } else {
        rfcList.sort(this.rfcSort)
      }
      if (!this.verbose) {
        rfcList = rfcList.filter(item => data.rfcs[item].status !== 'obsoleted')
      }
      rfcList.forEach(item => {
        const rfcData = data.rfcs[item]
        this.renderRfc(item, rfcData, target)
      })
    }

    // tags
    if (!userInput) { // default screen
      const relevantTags = {
        collection: new Set(data.tags.collection.keys()),
        stream: new Set(data.tags.stream.keys())
      }
      this.showTags(relevantTags, false)
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

    this.setContainer(rfcList.length > 0 || userInput)
  }

  renderRfc (rfcName, rfcData, target, hideRefs) {
    const rfcNum = data.rfcNametoNum(rfcName)
    const rfcSpan = document.createElement('li')
    rfcSpan.className = `status-${rfcData.status} stream-${rfcData.stream} level-${rfcData.level}`
    rfcSpan.num = rfcNum
    rfcSpan.data = rfcData
    const rfcRef = document.createElement('a')
    rfcRef.className = 'reference'
    rfcRef.href = `https://bib.ietf.org/public/rfc/bibxml/reference.RFC.${rfcNum}.xml`
    rfcRef.appendChild(document.createTextNode(rfcName))
    rfcSpan.appendChild(rfcRef)
    const sep = document.createTextNode(': ')
    rfcSpan.appendChild(sep)
    const rfcLink = document.createElement('a')
    rfcLink.href = `https://www.rfc-editor.org/rfc/rfc${rfcNum}.html`
    rfcSpan.appendChild(rfcLink)
    const rfcTitle = document.createTextNode(rfcData.title)
    rfcLink.appendChild(rfcTitle)
    if (rfcData.stream !== 'ietf') {
      this.renderTag('stream', rfcData.stream, rfcSpan)
    }
    if (rfcData.level !== 'std') {
      this.renderTag('level', rfcData.level, rfcSpan)
    }
    if (rfcData.wg) {
      this.renderTag('wg', rfcData.wg, rfcSpan)
    }
    const refCount = data.inRefs.get(rfcName, []).length
    if (hideRefs !== true && refCount > 0) {
      const refSpan = document.createElement('span')
      refSpan.className = 'refcount'
      const refCountLink = document.createElement('a')
      refCountLink.href = '#'
      refCountLink.className = 'refcountlink'
      refCountLink.onclick = this.refExpandHandler
      const refCountText = document.createTextNode(`${refCount} referencing RFC${this.pluralise(refCount)}`)
      refCountLink.appendChild(refCountText)
      refSpan.appendChild(refCountLink)
      rfcSpan.appendChild(refSpan)
    }
    target.appendChild(rfcSpan)
  }

  refExpandHandler (event) {
    const refList = document.createElement('ul')
    const rfcElement = event.target.parentElement.parentElement
    const rfcName = data.rfcNumtoName(rfcElement.num)
    const rfcRefs = data.inRefs.get(rfcName, [])
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
      // activate tags from the URL
      const urlTagString = this.params.get(tagType)
      const urlActiveTags = new Set(urlTagString ? urlTagString.split(',') : [])
      urlActiveTags.forEach(tagName => {
        this.setActiveTag(tagType, tagName)
      })
    })
  }

  renderTag (tagType, tagName, target, clickHandlerFactory) {
    const tagData = data.tags[tagType][tagName]
    const tagContent = document.createTextNode(tagName)
    const tagSpan = document.createElement('span')
    tagSpan.appendChild(tagContent)
    tagSpan.classList.add('tag')
    tagSpan.style.backgroundColor = tagData.colour || this.tagColours[tagType] || util.genColour(tagName)
    tagSpan.style.color = util.revColour(tagSpan.style.backgroundColor)
    if (clickHandlerFactory !== undefined) {
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
      if (hilight) this.tagTargets[tagType][currentActiveTag].classList.remove('tag-active')
      this.activeTags.delete(tagType)
    }
    if (!currentActiveTag || currentActiveTag !== tagName) {
      if (hilight) this.tagTargets[tagType][tagName].classList.add('tag-active')
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
      if (this.unshownTagTypes.includes(tagType)) return
      if (!relevantTags[tagType]) {
        relevantTags[tagType] = new Set()
      }
      const header = document.getElementById(tagType + '-header')
      header.style.display = showHeader && relevantTags[tagType].size > 0 ? 'block' : 'none'
      data.tags[tagType].forEach(tagName => {
        const visibility = relevantTags[tagType].has(tagName) ? 'inline' : 'none'
        this.tagTargets[tagType][tagName].style.display = visibility
      })
    })
  }

  searchInput () {
    const searchText = document.getElementById('search').value
    ui.searchWords = searchText.split(' ').filter(word => word)
    ui.showRfcs()
  }

  clearSearchHandler (event) {
    ui.searchTarget.value = ''
    ui.searchWords = []
    ui.activeTags.clear()
    ui.showRfcs()
    ui.updateUrl()
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
    container.className = hasResults ? 'results' : 'noresults'
  }

  rfcSort (a, b) {
    return parseInt(b.replace('RFC', '')) - parseInt(a.replace('RFC', ''))
  }

  refSort (a, b) {
    return data.inRefs.get(b, []).length - data.inRefs.get(a, []).length
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
