/* global history */

import * as util from './util.js'

const prefixLen = 3
const tagTypes = ['collection', 'status', 'stream', 'level', 'wg']
const unshownTagTypes = ['status']
const oldTags = [
  'status-obsoleted',
  'level-historic'
]

let tags = {} // tags and associated rfcs
const activeTags = new Map() // what tags are active
let verbose = false // whether we're showing obsolete, etc.
const words = new Map() // index of word prefixes to RFCs containing them
const keywords = new Map() // index of keyword phrases to RFCs containing them
let searchWords = [] // words the user is searching for
let allRfcs = [] // list of all RFC numbers
let rfcs = {} // RFC objects
let refs = {} // references
const inRefs = {} // inbound reference counts

const tagColours = {
  stream: '#678',
  level: '#a33',
  wg: '#ccc'
}

function init () {
  util.onDone(loadDone)
  util.loadJson('tags.json', function (json) { tags = json })
  util.loadJson('rfcs.json', function (json) { rfcs = json })
  util.loadJson('refs.json', function (json) { refs = json })
}

function loadDone () {
  compute()
  tagTypes.forEach(tagType => {
    initTags(tagType, clickTagHandler)
  })
  refs.forEach(rfc => {
    const rfcRefs = refs.get(rfc, {})
    rfcRefs.get('normative', []).forEach(ref => {
      const rfcName = `RFC${ref.padStart(4, '0')}`
      inRefs[rfcName] = inRefs.get(rfcName, 0) + 1
    })
    rfcRefs.get('informative', []).forEach(ref => {
      const rfcName = `RFC${ref.padStart(4, '0')}`
      inRefs[rfcName] = inRefs.get(rfcName, 0) + 1
    })
  })
  installFormHandlers()
  installClickHandlers()
  loadUrl()
  window.onpopstate = back
}

function back (...args) {
  loadUrl()
  showRfcs()
}

let obsoleteTarget
let searchTarget
let deleteTarget
let form
let title

function installFormHandlers () {
  obsoleteTarget = document.getElementById('obsolete')
  obsoleteTarget.onchange = showObsoleteHandler
  searchTarget = document.getElementById('search')
  searchTarget.placeholder = 'Search titles & keywords'
  searchTarget.oninput = searchInput
  searchTarget.disabled = false
  searchTarget.focus()
  deleteTarget = document.getElementById('delete')
  deleteTarget.onclick = deleteHandler
  form = document.forms[0]
  form.onsubmit = searchSubmit
  title = document.getElementById('title')
  title.onclick = function () {
    window.location = '/'
  }
}

function installClickHandlers () {
  const sortByNum = document.getElementById('sortByNumber')
  sortByNum.onclick = (event) => { showRfcs(); return false }
  const sortByRefs = document.getElementById('sortByRefs')
  sortByRefs.onclick = (event) => { showRfcs(true); return false }
}

function compute () {
  allRfcs = Object.keys(rfcs)
  allRfcs.sort(rfcSort)
  allRfcs.forEach(rfcName => {
    const rfc = rfcs[rfcName]
    tagTypes.forEach(tagType => {
      const tagName = rfc[tagType]
      if (tagName) {
        if (!tags[tagType]) tags[tagType] = {}
        if (!tags[tagType][tagName]) {
          tags[tagType][tagName] = {
            colour: '',
            rfcs: [],
            active: false
          }
        }
        tags[tagType][tagName].rfcs.push(rfcName)
      }
    })
    // index titles
    searchIndex(rfc.title.split(' '), rfcName, words)
    searchIndex(rfc.keywords, rfcName, keywords)
  })
}

function initTags (tagType, clickHandler) {
  if (unshownTagTypes.includes(tagType)) return
  const targetDiv = document.getElementById(tagType)
  const tagList = tags[tagType].keys()
  tagList.sort()
  tagList.forEach(tagName => {
    const tagSpan = renderTag(tagType, tagName, targetDiv, clickHandler)
    tags[tagType][tagName].target = tagSpan
    targetDiv.appendChild(document.createTextNode(' '))
  })
}

function renderTag (tagType, tagName, target, clickHandler) {
  const tagSpan = document.createElement('span')
  const tagContent = document.createTextNode(tagName)
  const tagData = tags[tagType][tagName]
  tagSpan.appendChild(tagContent)
  tagSpan.classList.add('tag')
  tagSpan.style.backgroundColor = tagData.colour || tagColours[tagType] || util.genColour(tagName)
  tagSpan.style.color = util.revColour(tagSpan.style.backgroundColor)
  if (clickHandler) {
    tagSpan.onclick = clickHandler(tagType, tagName)
  } else {
    tagSpan.style.cursor = 'default'
  }
  target.appendChild(tagSpan)
  return tagSpan
}

function clickTagHandler (tagType, tagName) {
  return function (event) {
    const activeTag = activeTags.get(tagType)
    if (activeTag && activeTag !== tagName) {
      setTagActivity(tagType, activeTag, false)
    }
    const tagData = tags[tagType][tagName]
    setTagActivity(tagType, tagName, !tagData.active)
    showRfcs()
    updateUrl()
  }
}

function deleteHandler () {
  searchTarget.value = ''
  searchWords = []
  showRfcs()
  updateUrl()
}

function setTagActivity (tagType, tagName, active) {
  const change = tagType !== 'collection'
  const tagData = tags[tagType][tagName]
  tagData.active = active
  if (tagData.active === true) {
    if (change) tagData.target.className = 'tag-active'
    activeTags.set(tagType, tagName)
  } else {
    if (change) tagData.target.className = 'tag'
    activeTags.delete(tagType)
  }
}

function showRfcs (sortByRef) {
  const target = document.getElementById('rfc-list')
  clear(target)
  let searchedRfcs = new Set()
  let taggedRfcs = new Set()
  let relevantRfcs = new Set()
  let rfcList = []
  let userInput = false
  if (activeTags.size !== 0 ||
      (searchWords.length !== 0 && !isNaN(parseInt(searchWords[0]))) ||
      (searchWords.length !== 0 && searchWords[0].length >= prefixLen)) {
    userInput = true
    taggedRfcs = listTaggedRfcs()
    searchedRfcs = listSearchedRfcs()
    relevantRfcs = taggedRfcs.intersection(searchedRfcs)
    rfcList = Array.from(relevantRfcs)
    if (sortByRef === true) {
      rfcList.sort(refSort)
    } else {
      rfcList.sort(rfcSort)
    }
    rfcList.forEach(item => {
      const rfcData = rfcs[item]
      renderRfc(item, rfcData, target)
    })
  }

  // tags
  if (!userInput) { // default screen
    const relevantTags = {
      collection: new Set(tags.collection.keys()),
      stream: new Set(tags.stream.keys())
    }
    showTags(relevantTags, false)
  } else if (activeTags.has('collection')) { // show a collection
    showRelevantTags(relevantRfcs)
  } else if (searchWords.length === 0) { // just tags
    showRelevantTags(taggedRfcs)
  } else { // search (and possibly tags), but only worry about search terms
    showRelevantTags(searchedRfcs)
  }

  // count
  const count = document.createTextNode(rfcList.length + ' RFCs')
  const countTarget = document.getElementById('count')
  clear(countTarget)
  countTarget.appendChild(count)

  setContainer(rfcList.length > 0 || userInput)
}

function listTaggedRfcs () {
  let filteredRfcs = new Set(allRfcs)
  tags.forEach(tagType => {
    tags[tagType].forEach(tagName => {
      const tagData = tags[tagType][tagName]
      const rfcs = new Set(tagData.rfcs)
      if (tagData.active === true) {
        filteredRfcs = filteredRfcs.intersection(rfcs)
      } else if (!verbose && oldTags.includes(`${tagType}-${tagName}`)) {
        filteredRfcs = filteredRfcs.difference(rfcs)
      }
    })
  })
  return filteredRfcs
}

function listSearchedRfcs () {
  let filteredRfcs = new Set(allRfcs)
  searchWords.forEach(searchWord => {
    const padded = `RFC${searchWord.padStart(4, '0')}`
    if (padded in rfcs) {
      filteredRfcs = new Set([padded])
    } else if (searchWord.length >= prefixLen || searchWords.length === 1) {
      const wordRfcs = searchLookup(searchWord, words, 'title')
      const keywordRfcs = searchLookup(searchWord, keywords, 'keywords')
      filteredRfcs = filteredRfcs.intersection(wordRfcs.union(keywordRfcs))
    }
  })
  return filteredRfcs
}

function renderRfc (rfcName, rfcData, target) {
  const rfcNum = parseInt(rfcName.substring(3))
  const rfcNumPad = rfcNum.toString().padStart(4, '0')
  const rfcSpan = document.createElement('li')
  rfcSpan.data = rfcData
  const rfcRef = document.createElement('a')
  rfcRef.className = 'reference'
  rfcRef.href = `https://www.rfc-editor.org/refs/bibxml/reference.RFC.${rfcNumPad}.xml`
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
    renderTag('stream', rfcData.stream, rfcSpan)
  }
  if (rfcData.level !== 'std') {
    renderTag('level', rfcData.level, rfcSpan)
  }
  if (rfcData.wg) {
    renderTag('wg', rfcData.wg, rfcSpan)
  }
  const refSpan = document.createElement('span')
  refSpan.className = 'refcount'
  const refCount = document.createTextNode(`${inRefs.get(rfcName, 0)} refs`)
  refSpan.appendChild(refCount)
  rfcSpan.appendChild(refSpan)
  target.appendChild(rfcSpan)
}

function showRelevantTags (rfcSet) {
  const relevantTags = {}
  tagTypes.forEach(tagType => {
    relevantTags[tagType] = new Set()
    const activeTag = activeTags.get(tagType)
    if (activeTag) relevantTags[tagType].add(activeTag)
  })
  rfcSet.forEach(rfcName => {
    tagTypes.forEach(tagType => {
      const tagName = rfcs[rfcName][tagType]
      if (!verbose && oldTags.includes(`${tagType}-${tagName}`)) {
        return
      }
      if (tagName) {
        relevantTags[tagType].add(tagName)
      }
    })
  })
  showTags(relevantTags)
}

function showTags (relevantTags, showHeader = true) {
  tagTypes.forEach(tagType => {
    if (unshownTagTypes.includes(tagType)) return
    if (!relevantTags[tagType]) {
      relevantTags[tagType] = new Set()
    }
    const header = document.getElementById(tagType + '-header')
    header.style.display = showHeader && relevantTags[tagType].size > 0 ? 'block' : 'none'
    tags[tagType].forEach(tagName => {
      const visibility = relevantTags[tagType].has(tagName) ? 'inline' : 'none'
      tags[tagType][tagName].target.style.display = visibility
    })
  })
}

function searchIndex (words, inputId, index) {
  words.forEach(word => {
    word = cleanString(word)
    if (word.length < prefixLen) {
      return
    }
    const prefix = word.substring(0, prefixLen)
    if (index.has(prefix)) {
      index.get(prefix).add(inputId)
    } else {
      index.set(prefix, new Set([inputId]))
    }
  })
}

function searchInput () {
  const searchText = document.getElementById('search').value
  searchWords = searchText.split(' ').filter(word => word)
  showRfcs()
}

function searchSubmit () {
  updateUrl()
  return false
}

function searchLookup (searchWord, index, attr) {
  searchWord = cleanString(searchWord)
  const searchPrefix = searchWord.substring(0, prefixLen)
  const matchRfcs = new Set(index.get(searchPrefix))
  if (searchWord.length > prefixLen) {
    matchRfcs.forEach(rfcName => {
      let hit = false
      let fullItem = rfcs[rfcName][attr]
      if (typeof (fullItem) === 'string') fullItem = fullItem.split(' ')
      fullItem.forEach(item => {
        if (cleanString(item).startsWith(searchWord)) hit = true
      })
      if (!hit) matchRfcs.delete(rfcName)
    })
  }
  return matchRfcs
}

function showObsoleteHandler (event) {
  verbose = obsoleteTarget.checked
  showRfcs()
  updateUrl()
}

function updateUrl () {
  const queries = []
  if (searchWords.length > 0) {
    queries.push('search=' + searchWords.join('%20'))
  }
  if (verbose) {
    queries.push('obsolete')
  }
  tags.forEach(tagType => {
    const urlTags = []
    tags[tagType].forEach(tagName => {
      const tagData = tags[tagType][tagName]
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
  const title = `rfc.fyi: ${searchWords.join(' ')}`
  history.pushState({}, title, url)
}

function loadUrl () {
  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.search)
  const search = params.get('search') || ''
  document.getElementById('search').value = search
  searchWords = search.split(' ').filter(word => word)
  if (params.has('obsolete')) {
    verbose = true
  }
  obsoleteTarget.checked = verbose
  tagTypes.forEach(tagType => {
    if (unshownTagTypes.includes(tagType)) return
    activeTags.delete(tagType)
    const tagstring = params.get(tagType)
    const urlTagNames = new Set(tagstring ? tagstring.split(',') : [])
    tags[tagType].forEach(tagName => {
      setTagActivity(tagType, tagName, urlTagNames.has(tagName))
    })
    if (urlTagNames.size > 0) {
      activeTags.set(tagType, urlTagNames.keys().next().value)
    }
  })
  showRfcs()
}

function clear (target) {
  while (target.firstChild) {
    target.removeChild(target.firstChild)
  }
}

function setContainer (hasResults) {
  const container = document.getElementById('container')
  container.className = hasResults ? 'results' : 'noresults'
}

function cleanString (input) {
  const output = input.toLowerCase()
  return output.replace(/[\]().,?"']/g, '')
}

function rfcSort (a, b) {
  return parseInt(b.replace('RFC', '')) - parseInt(a.replace('RFC', ''))
}

function refSort (a, b) {
  return inRefs.get(b, 0) - inRefs.get(a, 0)
}

util.addDOMLoadEvent(init)
