/* global history */

import * as util from './util.js'

class RfcFyiUi {
  prefixLen = 3
  tagTypes = ['collection', 'status', 'stream', 'level', 'wg']
  unshownTagTypes = ['status']
  oldTags = [
    'status-obsoleted',
    'level-historic'
  ]

  tags = {} // tags and associated rfcs
  activeTags = new Map() // what tags are active
  verbose = false // whether we're showing obsolete, etc.
  words = new Map() // index of word prefixes to RFCs containing them
  keywords = new Map() // index of keyword phrases to RFCs containing them
  searchWords = [] // words the user is searching for
  allRfcs = [] // list of all RFC names
  rfcs = {} // RFC objects
  refs = {} // references
  inRefs = {} // inbound references

  tagColours = {
    stream: '#678',
    level: '#a33',
    wg: '#ccc'
  }

  load () {
    util.onDone(this.loadDone, this)
    util.loadJson('tags.json', (json) => { this.tags = json })
    util.loadJson('rfcs.json', (json) => { this.rfcs = json })
    util.loadJson('refs.json', (json) => { this.refs = json })
  }

  loadDone () {
    this.createSearchIndex()
    this.computeReferences()
    this.tagTypes.forEach(tagType => {
      this.initTags(tagType, this.clickTagHandler)
    })
    this.installFormHandlers()
    this.installClickHandlers()
    this.loadUi()
    window.onpopstate = this.loadUi
  }

  obsoleteTarget = document.getElementById('obsolete')
  searchTarget = document.getElementById('search')
  clearSearchTarget = document.getElementById('clearSearch')
  form = document.forms[0]
  title = document.getElementById('title')

  installFormHandlers () {
    this.obsoleteTarget.onchange = this.showObsoleteHandler
    this.searchTarget.placeholder = 'Search titles & keywords'
    this.searchTarget.oninput = this.searchInput
    this.searchTarget.disabled = false
    this.searchTarget.focus()
    this.clearSearchTarget.onclick = this.clearSearchHandler
    this.form.onsubmit = this.searchSubmit
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

  createSearchIndex () {
    this.allRfcs = Object.keys(this.rfcs)
    this.allRfcs.sort(this.rfcSort)
    this.allRfcs.forEach(rfcName => {
      const rfc = this.rfcs[rfcName]
      this.tagTypes.forEach(tagType => {
        const tagName = rfc[tagType]
        if (tagName) {
          if (!this.tags[tagType]) this.tags[tagType] = {}
          if (!this.tags[tagType][tagName]) {
            this.tags[tagType][tagName] = {
              colour: '',
              rfcs: [],
              active: false
            }
          }
          this.tags[tagType][tagName].rfcs.push(rfcName)
        }
      })
      // index titles and keywords
      this.searchIndex(rfc.title.split(' '), rfcName, this.words)
      this.searchIndex(rfc.keywords, rfcName, this.keywords)
    })
  }

  computeReferences () {
    this.allRfcs.forEach(rfcName => {
      this.inRefs[rfcName] = []
    })
    this.refs.forEach(rfcNum => {
      const rfcName = this.rfcNumtoName(rfcNum)
      const rfcRefs = this.refs.get(rfcNum, {})
      rfcRefs.get('normative', []).forEach(ref => {
        const refName = this.rfcNumtoName(ref)
        try {
          this.inRefs[refName].push([true, rfcName])
        } catch (error) {
          console.log(`${rfcName} has non-existant normative reference - ${refName}`)
        }
      })
      rfcRefs.get('informative', []).forEach(ref => {
        const refName = this.rfcNumtoName(ref)
        try {
          this.inRefs[refName].push([false, rfcName])
        } catch (error) {
          console.log(`${rfcName} has non-existant informative refereence - ${refName}`)
        }
      })
    })
  }

  initTags (tagType, clickHandler) {
    if (this.unshownTagTypes.includes(tagType)) return
    const targetDiv = document.getElementById(tagType)
    const tagList = this.tags[tagType].keys()
    tagList.sort()
    tagList.forEach(tagName => {
      const tagSpan = this.renderTag(tagType, tagName, targetDiv, clickHandler)
      this.tags[tagType][tagName].target = tagSpan
      targetDiv.appendChild(document.createTextNode(' '))
    })
  }

  renderTag (tagType, tagName, target, clickHandler) {
    const tagSpan = document.createElement('span')
    const tagContent = document.createTextNode(tagName)
    const tagData = this.tags[tagType][tagName]
    tagSpan.appendChild(tagContent)
    tagSpan.classList.add('tag')
    tagSpan.style.backgroundColor = tagData.colour || this.tagColours[tagType] || util.genColour(tagName)
    tagSpan.style.color = util.revColour(tagSpan.style.backgroundColor)
    if (clickHandler) {
      tagSpan.onclick = clickHandler(tagType, tagName)
    } else {
      tagSpan.style.cursor = 'default'
    }
    target.appendChild(tagSpan)
    return tagSpan
  }

  clickTagHandler (tagType, tagName) {
    return (event) => {
      const activeTag = ui.activeTags.get(tagType)
      if (activeTag && activeTag !== tagName) {
        ui.setTagActivity(tagType, activeTag, false)
      }
      const tagData = ui.tags[tagType][tagName]
      ui.setTagActivity(tagType, tagName, !tagData.active)
      ui.showRfcs()
      ui.updateUrl()
    }
  }

  clearSearchHandler (event) {
    ui.searchTarget.value = ''
    ui.searchWords = []
    ui.showRfcs()
    ui.updateUrl()
  }

  setTagActivity (tagType, tagName, active) {
    const change = tagType !== 'collection'
    const tagData = this.tags[tagType][tagName]
    tagData.active = active
    if (tagData.active === true) {
      if (change) tagData.target.className = 'tag-active'
      this.activeTags.set(tagType, tagName)
    } else {
      if (change) tagData.target.className = 'tag'
      this.activeTags.delete(tagType)
    }
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
        (this.searchWords.length !== 0 && this.searchWords[0].length >= this.prefixLen)) {
      userInput = true
      taggedRfcs = this.listTaggedRfcs()
      searchedRfcs = this.listSearchedRfcs()
      relevantRfcs = taggedRfcs.intersection(searchedRfcs)
      rfcList = Array.from(relevantRfcs)
      if (sortByRef === true) {
        rfcList.sort(this.refSort)
      } else {
        rfcList.sort(this.rfcSort)
      }
      rfcList.forEach(item => {
        const rfcData = this.rfcs[item]
        this.renderRfc(item, rfcData, target)
      })
    }

    // tags
    if (!userInput) { // default screen
      const relevantTags = {
        collection: new Set(this.tags.collection.keys()),
        stream: new Set(this.tags.stream.keys())
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

  listTaggedRfcs () {
    let filteredRfcs = new Set(this.allRfcs)
    this.tags.forEach(tagType => {
      this.tags[tagType].forEach(tagName => {
        const tagData = this.tags[tagType][tagName]
        const rfcs = new Set(tagData.rfcs)
        if (tagData.active === true) {
          filteredRfcs = filteredRfcs.intersection(rfcs)
        } else if (!this.verbose && this.oldTags.includes(`${tagType}-${tagName}`)) {
          filteredRfcs = filteredRfcs.difference(rfcs)
        }
      })
    })
    return filteredRfcs
  }

  listSearchedRfcs () {
    let filteredRfcs = new Set(this.allRfcs)
    this.searchWords.forEach(searchWord => {
      const padded = `RFC${searchWord.padStart(4, '0')}`
      if (padded in this.rfcs) {
        filteredRfcs = new Set([padded])
      } else if (searchWord.length >= this.prefixLen || this.searchWords.length === 1) {
        const wordRfcs = this.searchLookup(searchWord, this.words, 'title')
        const keywordRfcs = this.searchLookup(searchWord, this.keywords, 'keywords')
        filteredRfcs = filteredRfcs.intersection(wordRfcs.union(keywordRfcs))
      }
    })
    return filteredRfcs
  }

  renderRfc (rfcName, rfcData, target, hideRefs) {
    const rfcNum = this.rfcNametoNum(rfcName)
    const rfcSpan = document.createElement('li')
    rfcSpan.num = rfcNum
    rfcSpan.data = rfcData
    const rfcRef = document.createElement('a')
    rfcRef.className = 'reference'
    rfcRef.href = `https://www.rfc-editor.org/refs/bibxml/reference.RFC.${rfcNum}.xml`
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
    if (hideRefs !== true) {
      const refSpan = document.createElement('span')
      refSpan.className = 'refcount'
      const count = this.inRefs.get(rfcName, []).length
      const refCountLink = document.createElement('a')
      refCountLink.href = '#'
      refCountLink.className = 'refcountlink'
      refCountLink.onclick = this.refExpandHandler
      const refCountText = document.createTextNode(`${count} referencing RFC${this.pluralise(count)}`)
      refCountLink.appendChild(refCountText)
      refSpan.appendChild(refCountLink)
      rfcSpan.appendChild(refSpan)
    }
    target.appendChild(rfcSpan)
  }

  refExpandHandler (event) {
    const refList = document.createElement('ul')
    const rfcElement = event.target.parentElement.parentElement
    const rfcName = ui.rfcNumtoName(rfcElement.num)
    const rfcRefs = ui.inRefs.get(rfcName, [])
    rfcRefs.forEach(ref => {
      //    const normative = ref[0]
      const refName = ref[1]
      const refData = ui.rfcs[refName]
      ui.renderRfc(refName, refData, refList, true)
    })
    event.target.parentElement.appendChild(refList)
    event.target.removeChild(event.target.firstChild)
    event.stopPropagation()
    return false
  }

  showRelevantTags (rfcSet) {
    const relevantTags = {}
    this.tagTypes.forEach(tagType => {
      relevantTags[tagType] = new Set()
      const activeTag = this.activeTags.get(tagType)
      if (activeTag) relevantTags[tagType].add(activeTag)
    })
    rfcSet.forEach(rfcName => {
      this.tagTypes.forEach(tagType => {
        const tagName = this.rfcs[rfcName][tagType]
        if (!this.verbose && this.oldTags.includes(`${tagType}-${tagName}`)) {
          return
        }
        if (tagName) {
          relevantTags[tagType].add(tagName)
        }
      })
    })
    this.showTags(relevantTags)
  }

  showTags (relevantTags, showHeader = true) {
    this.tagTypes.forEach(tagType => {
      if (this.unshownTagTypes.includes(tagType)) return
      if (!relevantTags[tagType]) {
        relevantTags[tagType] = new Set()
      }
      const header = document.getElementById(tagType + '-header')
      header.style.display = showHeader && relevantTags[tagType].size > 0 ? 'block' : 'none'
      this.tags[tagType].forEach(tagName => {
        const visibility = relevantTags[tagType].has(tagName) ? 'inline' : 'none'
        this.tags[tagType][tagName].target.style.display = visibility
      })
    })
  }

  searchIndex (words, inputId, index) {
    words.forEach(word => {
      word = this.cleanString(word)
      if (word.length < this.prefixLen) {
        return
      }
      const prefix = word.substring(0, this.prefixLen)
      if (index.has(prefix)) {
        index.get(prefix).add(inputId)
      } else {
        index.set(prefix, new Set([inputId]))
      }
    })
  }

  searchInput () {
    const searchText = document.getElementById('search').value
    ui.searchWords = searchText.split(' ').filter(word => word)
    ui.showRfcs()
  }

  searchSubmit () {
    this.updateUrl()
    return false
  }

  searchLookup (searchWord, index, attr) {
    searchWord = this.cleanString(searchWord)
    const searchPrefix = searchWord.substring(0, this.prefixLen)
    const matchRfcs = new Set(index.get(searchPrefix))
    if (searchWord.length > this.prefixLen) {
      matchRfcs.forEach(rfcName => {
        let hit = false
        let fullItem = this.rfcs[rfcName][attr]
        if (typeof (fullItem) === 'string') fullItem = fullItem.split(' ')
        fullItem.forEach(item => {
          if (this.cleanString(item).startsWith(searchWord)) hit = true
        })
        if (!hit) matchRfcs.delete(rfcName)
      })
    }
    return matchRfcs
  }

  showObsoleteHandler (event) {
    ui.verbose = ui.obsoleteTarget.checked
    ui.showRfcs()
    ui.updateUrl()
  }

  updateUrl () {
    const queries = []
    if (this.searchWords.length > 0) {
      queries.push('search=' + this.searchWords.join('%20'))
    }
    if (this.verbose) {
      queries.push('obsolete')
    }
    this.tags.forEach(tagType => {
      const urlTags = []
      this.tags[tagType].forEach(tagName => {
        const tagData = this.tags[tagType][tagName]
        if (tagData.active === true) {
          urlTags.push(tagName)
        }
      })
      if (urlTags.length > 0) {
        queries.push(tagType + '=' + urlTags.join(','))
      }
    })
    let url = './'
    if (queries.length > 0) url += '?'
    url += queries.join('&')
    const title = `rfc.fyi: ${this.searchWords.join(' ')}`
    history.pushState({}, title, url)
  }

  loadUi (...args) {
    const url = new URL(window.location.href)
    const params = new URLSearchParams(url.search)
    const search = params.get('search') || ''
    document.getElementById('search').value = search
    this.searchWords = search.split(' ').filter(word => word)
    if (params.has('obsolete')) {
      this.verbose = true
    }
    this.obsoleteTarget.checked = this.verbose
    this.tagTypes.forEach(tagType => {
      if (this.unshownTagTypes.includes(tagType)) return
      this.activeTags.delete(tagType)
      const tagstring = params.get(tagType)
      const urlTagNames = new Set(tagstring ? tagstring.split(',') : [])
      this.tags[tagType].forEach(tagName => {
        this.setTagActivity(tagType, tagName, urlTagNames.has(tagName))
      })
      if (urlTagNames.size > 0) {
        this.activeTags.set(tagType, urlTagNames.keys().next().value)
      }
    })
    this.showRfcs()
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

  cleanString (input) {
    const output = input.toLowerCase()
    return output.replace(/[\]().,?"']/g, '')
  }

  rfcSort (a, b) {
    return parseInt(b.replace('RFC', '')) - parseInt(a.replace('RFC', ''))
  }

  refSort (a, b) {
    return ui.inRefs.get(b, []).length - ui.inRefs.get(a, []).length
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

  rfcNumtoName (rfcNum) {
    return `RFC${rfcNum.padStart(4, '0')}`
  }

  rfcNametoNum (rfcName) {
    const rfcNum = parseInt(rfcName.substring(3))
    const rfcNumPad = rfcNum.toString().padStart(4, '0')
    return rfcNumPad
  }
}

const ui = new RfcFyiUi()

util.addDOMLoadEvent(function () {
  ui.load()
})
