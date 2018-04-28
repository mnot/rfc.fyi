/* global alert, history, XMLHttpRequest */

var rfcIndex;

(function () {
  'use strict'

  Set.prototype.intersection = function (setB) { // eslint-disable-line
    var intersection = new Set()
    for (let elem of setB) {
      if (this.has(elem)) {
        intersection.add(elem)
      }
    }
    return intersection
  }

  Set.prototype.union = function (setB) { // eslint-disable-line
    var union = new Set()
    for (let elemA of this) {
      union.add(elemA)
    }
    for (let elemB of setB) {
      union.add(elemB)
    }
    return union
  }

  Set.prototype.difference = function (setB) { // eslint-disable-line
    var difference = new Set()
    for (let elem of this) {
      if (!setB.has(elem)) {
        difference.add(elem)
      }
    }
    return difference
  }

  Object.prototype.forEach = function (func) { // eslint-disable-line
    for (let item in this) {
      if (this.hasOwnProperty(item)) {
        func(item)
      }
    }
  }

  Object.prototype.keys = function () { // eslint-disable-line
    var keys = []
    this.forEach(item => keys.push(item))
    return keys
  }

  rfcIndex = {

    prefixLen: 3,
    tagTypes: ['status', 'stream', 'level', 'wg'],
    unshownTagTypes: ['status'],
    oldTags: [
      'status-obsoleted',
      'stream-legacy',
      'level-historic'
    ],

    init: function () {
      this.outstanding = 0 // outstanding fetches
      this.tags = {} // tags and associated rfcs
      this.active_tags = new Map() // what tags are active
      this.verbose = false // whether we're showing obsolete, etc.
      this.words = new Map() // index of word prefixes to RFCs containing them
      this.keywords = new Map() // index of keyword phrases to RFCs containing them
      this.searchWords = [] // words the user is searching for
      this.tags = {} // tag objects
      this.load_json('tags.json', 'tags')
      this.allRfcs = [] // list of all RFC numbers
      this.rfcs = {} // RFC objects
      this.load_json('rfcs.json', 'rfcs')
      this.install_form_handlers()
    },

    load_json: function (url, dest) {
      var req = false
      try {
        req = new XMLHttpRequest()
      } catch (e1) {
        req = false
      }
      if (req) {
        req.onreadystatechange = function () {
          if (req.readyState === 4) {
            rfcIndex.outstanding -= 1
            rfcIndex[dest] = JSON.parse(req.responseText)
            if (rfcIndex.outstanding === 0) {
              rfcIndex.load_done()
            }
          }
        }
        try {
          rfcIndex.outstanding += 1
          req.open('GET', url, true)
          req.send('')
        } catch (e3) {
          rfcIndex.outstanding -= 1
          alert(`Request error: ${url} (${e3})`)
        }
      }
    },

    install_form_handlers: function () {
      var obsoleteTarget = document.getElementById('obsolete')
      obsoleteTarget.oninput = this.show_obsolete_handler
      var searchTarget = document.getElementById('search')
      searchTarget.oninput = this.search_input
      var form = document.forms[0]
      form.onsubmit = function () { return false }
    },

    load_done: function () {
      this.compute()
      this.tagTypes.forEach(tagType => {
        rfcIndex.init_tags(tagType, rfcIndex.click_tag_handler)
      })
      this.load_url()
    },

    compute: function () {
      this.allRfcs = Object.keys(this.rfcs)
      this.allRfcs.sort(this.rfcSort)
      this.allRfcs.forEach(rfcNum => {
        let rfc = this.rfcs[rfcNum]
        rfcIndex.tagTypes.forEach(tagType => {
          let tagName = rfc[tagType]
          if (tagName) {
            if (!rfcIndex.tags[tagType]) rfcIndex.tags[tagType] = {}
            if (!rfcIndex.tags[tagType][tagName]) {
              rfcIndex.tags[tagType][tagName] = {
                'colour': '',
                'rfcs': [],
                'active': false
              }
            }
            rfcIndex.tags[tagType][tagName].rfcs.push(rfcNum)
          }
        })
        // index titles
        this.search_index(rfc['title'].split(' '), rfcNum, this.words)
        this.search_index(rfc['keywords'], rfcNum, this.keywords)
      })
    },

    init_tags: function (tagType, clickHandler) {
      if (rfcIndex.unshownTagTypes.includes(tagType)) return
      var targetDiv = document.getElementById(tagType)
      var tags = rfcIndex.tags[tagType].keys()
      tags.sort()
      tags.forEach(tagName => {
        rfcIndex.render_tag(tagType, tagName, targetDiv, clickHandler)
        targetDiv.appendChild(document.createTextNode(' '))
      })
    },

    render_tag: function (tagType, tagName, target, clickHandler) {
      var tagSpan = document.createElement('span')
      var tagContent = document.createTextNode(tagName)
      var tagData = rfcIndex.tags[tagType][tagName]
      tagSpan.appendChild(tagContent)
      tagSpan.classList.add('tag')
      tagSpan.style.backgroundColor = tagData['colour'] || this.gen_colour()
      tagSpan.style.color = this.text_colour(tagSpan.style.backgroundColor)
      this.tags[tagType][tagName].target = tagSpan
      if (clickHandler) {
        tagSpan.onclick = clickHandler(tagType, tagName)
      }
      target.appendChild(tagSpan)
    },

    click_tag_handler: function (tagType, tagName) {
      return function (event) {
        var activeTag = rfcIndex.active_tags.get(tagType)
        if (activeTag && activeTag !== tagName) {
          let activeTagData = rfcIndex.tags[tagType][activeTag]
          activeTagData.active = false
          activeTagData.target.style['border-color'] = 'white'
        }
        var tagData = rfcIndex.tags[tagType][tagName]
        rfcIndex.set_tag_activity(tagType, tagName, !tagData.active)
        rfcIndex.show_rfcs()
        rfcIndex.update_url()
      }
    },

    set_tag_activity: function (tagType, tagName, active) {
      var tagData = rfcIndex.tags[tagType][tagName]
      tagData.active = active
      if (tagData.active === true) {
        tagData.target.style['border-color'] = 'black'
        rfcIndex.active_tags.set(tagType, tagName)
      } else {
        tagData.target.style['border-color'] = 'white'
        rfcIndex.active_tags.delete(tagType)
      }
    },

    show_obsolete_handler: function () {
      rfcIndex.verbose = !rfcIndex.verbose
      rfcIndex.show_rfcs()
      rfcIndex.update_url()
    },

    list_tagged_rfcs: function () {
      var filteredRfcs = new Set(this.allRfcs)
      rfcIndex.tags.forEach(tagType => {
        rfcIndex.tags[tagType].forEach(tagName => {
          let tagData = rfcIndex.tags[tagType][tagName]
          let rfcs = new Set(tagData.rfcs)
          if (tagData.active === true) {
            filteredRfcs = filteredRfcs.intersection(rfcs)
          } else if (!rfcIndex.verbose && rfcIndex.oldTags.includes(`${tagType}-${tagName}`)) {
            filteredRfcs = filteredRfcs.difference(rfcs)
          }
        })
      })
      return filteredRfcs
    },

    list_searched_rfcs: function () {
      var filteredRfcs = new Set(this.allRfcs)
      rfcIndex.searchWords.forEach(searchWord => {
        if (searchWord.length >= rfcIndex.prefixLen || rfcIndex.searchWords.length === 1) {
          let wordRfcs = rfcIndex.search_lookup(searchWord, rfcIndex.words, 'title')
          let keywordRfcs = rfcIndex.search_lookup(searchWord, rfcIndex.keywords, 'keywords')
          filteredRfcs = filteredRfcs.intersection(wordRfcs.union(keywordRfcs))
        }
      })
      return filteredRfcs
    },

    show_rfcs: function (target = document.getElementById('rfc-list')) {
      this.clear(target)
      var searchedRfcs = new Set()
      var rfcList = []
      var userInput = false
      if (rfcIndex.active_tags.size !== 0 || rfcIndex.searchWords.length !== 0) {
        userInput = true
        var taggedRfcs = rfcIndex.list_tagged_rfcs()
        searchedRfcs = rfcIndex.list_searched_rfcs()
        rfcList = Array.from(taggedRfcs.intersection(searchedRfcs))
        rfcList.sort(this.rfcSort)
        rfcList.forEach(item => {
          let rfcData = this.rfcs[item]
          this.render_rfc(item, rfcData, target)
        })
      }
      this.show_relevant_tags(searchedRfcs)
      var count = document.createTextNode(rfcList.length + ' RFCs')
      var countTarget = document.getElementById('count')
      this.clear(countTarget)
      if (userInput) countTarget.appendChild(count)
      rfcIndex.set_container(rfcList.length > 0 || userInput)
    },

    show_relevant_tags: function (rfcSet) {
      var relevantTags = {}
      rfcIndex.tagTypes.forEach(tagType => {
        relevantTags[tagType] = new Set()
      })
      rfcSet.forEach(rfcNum => {
        rfcIndex.tagTypes.forEach(tagType => {
          let tagName = rfcIndex.rfcs[rfcNum][tagType]
          if (!rfcIndex.verbose && rfcIndex.oldTags.includes(`${tagType}-${tagName}`)) {
            return
          }
          if (tagName) {
            relevantTags[tagType].add(tagName)
          }
        })
      })
      rfcIndex.tagTypes.forEach(tagType => {
        if (rfcIndex.unshownTagTypes.includes(tagType)) return
        let header = document.getElementById(tagType + '-header')
        header.style.display = relevantTags[tagType].size > 0 ? 'block' : 'none'
        rfcIndex.tags[tagType].forEach(tagName => {
          let visibility = relevantTags[tagType].has(tagName) ? 'inline' : 'none'
          rfcIndex.tags[tagType][tagName].target.style.display = visibility
        })
      })
    },

    set_container: function (hasResults) {
      var container = document.getElementById('container')
      container.className = hasResults ? 'results' : 'noresults'
    },

    render_rfc: function (rfcName, rfcData, target) {
      var rfcSpan = document.createElement('li')
      rfcSpan.data = rfcData
      var rfcNumber = document.createTextNode(rfcName + ': ')
      rfcSpan.appendChild(rfcNumber)
      var rfcLink = document.createElement('a')
      rfcLink.href = 'https://tools.ietf.org/html/' + rfcName.toLowerCase()
      rfcSpan.appendChild(rfcLink)
      var rfcTitle = document.createTextNode(rfcData.title)
      rfcLink.appendChild(rfcTitle)
      target.appendChild(rfcSpan)
    },

    clear: function (target) {
      while (target.firstChild) {
        target.removeChild(target.firstChild)
      }
    },

    gen_colour: function () {
      var hex = '0123456789ABCDEF'
      var colour = '#'
      for (let i = 0; i < 6; i++) {
        colour += hex[Math.floor(Math.random() * 16)]
      }
      return colour
    },

    text_colour: function (bg) {
      var rgb = bg.match(/\d+/g)
      var luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] // ITU-R BT.709
      if (luma < 128) {
        return '#fff'
      } else {
        return '#000'
      }
    },

    search_index: function (words, inputId, index) {
      words.forEach(word => {
        word = rfcIndex.cleanString(word)
        if (word.length < rfcIndex.prefixLen) {
          return
        }
        var prefix = word.substring(0, rfcIndex.prefixLen)
        if (index.has(prefix)) {
          index.get(prefix).add(inputId)
        } else {
          index.set(prefix, new Set([inputId]))
        }
      })
    },

    search_input: function () {
      var searchText = document.getElementById('search').value
      rfcIndex.searchWords = searchText.split(' ').filter(word => word)
      rfcIndex.show_rfcs()
      rfcIndex.update_url()
    },

    search_lookup: function (searchWord, index, attr) {
      searchWord = this.cleanString(searchWord)
      var searchPrefix = searchWord.substring(0, this.prefixLen)
      var matchRfcs = new Set(index.get(searchPrefix))
      if (searchWord.length > this.prefixLen) {
        matchRfcs.forEach(rfcNum => {
          let hit = false
          let fullItem = rfcIndex.rfcs[rfcNum][attr]
          if (typeof (fullItem) === 'string') fullItem = fullItem.split(' ')
          fullItem.forEach(item => {
            if (rfcIndex.cleanString(item).startsWith(searchWord)) hit = true
          })
          if (!hit) matchRfcs.delete(rfcNum)
        })
      }
      return matchRfcs
    },

    update_url: function () {
      var queries = []
      if (rfcIndex.searchWords.length > 0) {
        queries.push('search=' + rfcIndex.searchWords.join('%20'))
      }
      if (rfcIndex.verbose) {
        queries.push('obsolete')
      }
      rfcIndex.tags.forEach(tagType => {
        var activeTags = []
        rfcIndex.tags[tagType].forEach(tagName => {
          let tagData = rfcIndex.tags[tagType][tagName]
          if (tagData.active === true) {
            activeTags.push(tagName)
          }
        })
        if (activeTags.length > 0) {
          queries.push(tagType + '=' + activeTags.join(','))
        }
      })
      var url = './'
      if (queries.length > 0) url += '?'
      url += queries.join('&')
      history.pushState({}, '', url)
    },

    load_url: function () {
      var search = rfcIndex.getParameterByName('search') || ''
      document.getElementById('search').value = search
      rfcIndex.searchWords = search.split(' ').filter(word => word)
      if (rfcIndex.getParameterByName('obsolete') !== null) {
        rfcIndex.verbose = true
      }
      var obsoleteTarget = document.getElementById('obsolete')
      obsoleteTarget.checked = rfcIndex.verbose
      rfcIndex.tagTypes.forEach(tagType => {
        if (rfcIndex.unshownTagTypes.includes(tagType)) return
        var tagstring = rfcIndex.getParameterByName(tagType)
        if (tagstring) {
          var tags = tagstring.split(',')
          tags.forEach(tagName => {
            rfcIndex.set_tag_activity(tagType, tagName, true)
          })
        }
      })
      rfcIndex.show_rfcs()
    },

    getParameterByName: function (name) {
      var url = window.location.href
      name = name.replace(/[[\]]/g, '\\$&')
      var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)')
      var results = regex.exec(url)
      if (!results) return null
      if (!results[2]) return ''
      return decodeURIComponent(results[2].replace(/\+/g, ' '))
    },

    cleanString: function (input) {
      var output = input.toLowerCase()
      return output.replace(/[\]().,?"']/g, '')
    },

    rfcSort: function (a, b) {
      return parseInt(a.replace('RFC', '')) - parseInt(b.replace('RFC', ''))
    },

    /*
    * (c)2006 Dean Edwards/Matthias Miller/John Resig
    * Special thanks to Dan Webb's domready.js Prototype extension
    * and Simon Willison's addLoadEvent
    *
    * For more info, see:
    * http://dean.edwards.name/weblog/2006/06/again/
    *
    * Thrown together by Jesse Skinner (http://www.thefutureoftheweb.com/)
    */
    addDOMLoadEvent: function (func) {
      if (!window.__load_events) {
        var init = function () {
          var i = 0
          // quit if this function has already been called
          if (rfcIndex.addDOMLoadEvent.done) { return }
          rfcIndex.addDOMLoadEvent.done = true
          if (window.__load_timer) {
            clearInterval(window.__load_timer)
            window.__load_timer = null
          }
          for (i; i < window.__load_events.length; i += 1) {
            window.__load_events[i]()
          }
          window.__load_events = null
        }
        document.addEventListener('DOMContentLoaded', init, false)
        window.onload = init
        window.__load_events = []
      }
      window.__load_events.push(func)
    }
  }

  rfcIndex.addDOMLoadEvent(function () { rfcIndex.init() })
}())
