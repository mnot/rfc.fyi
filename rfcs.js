/* global history */

import * as util from './util.js'

var rfcIndex;

(function () {
  'use strict'

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
      this.tags = {} // tags and associated rfcs
      this.active_tags = new Map() // what tags are active
      this.verbose = false // whether we're showing obsolete, etc.
      this.words = new Map() // index of word prefixes to RFCs containing them
      this.keywords = new Map() // index of keyword phrases to RFCs containing them
      this.searchWords = [] // words the user is searching for
      this.allRfcs = [] // list of all RFC numbers
      this.install_form_handlers()
      util.onDone(this.load_done)
      this.tags = {} // tag objects
      util.loadJson('tags.json', this, 'tags')
      this.rfcs = {} // RFC objects
      util.loadJson('rfcs.json', this, 'rfcs')
    },

    install_form_handlers: function () {
      this.obsoleteTarget = document.getElementById('obsolete')
      this.obsoleteTarget.onchange = this.show_obsolete_handler
      this.searchTarget = document.getElementById('search')
      this.searchTarget.oninput = this.search_input
      this.form = document.forms[0]
      this.form.onsubmit = function () { return false }
    },

    load_done: function () {
      rfcIndex.compute()
      rfcIndex.tagTypes.forEach(tagType => {
        rfcIndex.init_tags(tagType, rfcIndex.click_tag_handler)
      })
      rfcIndex.load_url()
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
      tagSpan.style.backgroundColor = tagData['colour'] || util.genColour()
      tagSpan.style.color = util.revColour(tagSpan.style.backgroundColor)
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

    show_obsolete_handler: function (event) {
      rfcIndex.verbose = rfcIndex.obsoleteTarget.checked
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
      if (rfcIndex.active_tags.size !== 0 ||
          (rfcIndex.searchWords.length !== 0 &&
           rfcIndex.searchWords[0].length >= rfcIndex.prefixLen)) {
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
      countTarget.appendChild(count)
      rfcIndex.set_container(rfcList.length > 0 || userInput)
    },

    show_relevant_tags: function (rfcSet) {
      var relevantTags = {}
      rfcIndex.tagTypes.forEach(tagType => {
        relevantTags[tagType] = new Set()
        var activeTag = rfcIndex.active_tags.get(tagType)
        if (activeTag) relevantTags[tagType].add(activeTag)
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
      var search = util.getParameterByName('search') || ''
      document.getElementById('search').value = search
      rfcIndex.searchWords = search.split(' ').filter(word => word)
      if (util.getParameterByName('obsolete') !== null) {
        rfcIndex.verbose = true
      }
      rfcIndex.obsoleteTarget.checked = rfcIndex.verbose
      rfcIndex.tagTypes.forEach(tagType => {
        if (rfcIndex.unshownTagTypes.includes(tagType)) return
        var tagstring = util.getParameterByName(tagType)
        if (tagstring) {
          var tags = tagstring.split(',')
          tags.forEach(tagName => {
            rfcIndex.set_tag_activity(tagType, tagName, true)
          })
        }
      })
      rfcIndex.show_rfcs()
    },

    clear: function (target) {
      while (target.firstChild) {
        target.removeChild(target.firstChild)
      }
    },

    set_container: function (hasResults) {
      var container = document.getElementById('container')
      container.className = hasResults ? 'results' : 'noresults'
    },

    cleanString: function (input) {
      var output = input.toLowerCase()
      return output.replace(/[\]().,?"']/g, '')
    },

    rfcSort: function (a, b) {
      return parseInt(a.replace('RFC', '')) - parseInt(b.replace('RFC', ''))
    }
  }

  util.addDOMLoadEvent(() => rfcIndex.init())
}())
