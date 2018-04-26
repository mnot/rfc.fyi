/* global alert, XMLHttpRequest */

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

  Object.prototype.forEach = function (func) { // eslint-disable-line
    for (let item in this) {
      if (this.hasOwnProperty(item)) {
        func(item)
      }
    }
  }

  rfcIndex = {

    prefixLen: 3,
    tagTypes: ['status', 'stream', 'level', 'wg'],
    invisibleTagTypes: ['status'],

    init: function () {
      this.outstanding = 0 // outstanding fetches
      this.tags = {} // tags and associated rfcs
      this.active_tags = {} // what tags are active
      this.words = {} // index of word prefixes to RFCs containing them
      this.keywords = {} // index of keyword phrases to RFCs containing them
      this.searchWords = [] // words the user is searching for
      this.load_json('tags.json', 'tags')
      this.allRfcs = [] // list of all RFC numbers
      this.rfcs = {} // RFC objects
      this.load_json('rfcs.json', 'rfcs')
      this.install_search_handler()
      this.install_obsolete_handler()
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
          alert('Request error: ' + url + ' (' + e3 + ')')
        }
      }
    },

    load_done: function () {
      // this.show_tags('tag', this.click_tag_handler)
      this.compute()
      this.tags['status']['current'].active = true
      this.tagTypes.forEach(tagType => {
        rfcIndex.show_tags(tagType, rfcIndex.click_tag_handler)
      })
    },

    compute: function () {
      this.allRfcs = Object.keys(this.rfcs)
      this.allRfcs.sort(this.rfcSort)
      this.allRfcs.forEach(rfcNum => {
        let rfc = this.rfcs[rfcNum]
        rfcIndex.tagTypes.forEach(tagType => {
          let tagName = rfc[tagType]
          if (tagName) {
            if (!rfcIndex.tags[tagType]) {
              rfcIndex.tags[tagType] = {}
            }
            if (!rfcIndex.tags[tagType][tagName]) {
              let visible = !rfcIndex.invisibleTagTypes.includes(tagType)
              rfcIndex.tags[tagType][tagName] = {
                'colour': '',
                'rfcs': [],
                'active': false,
                'visible': visible
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

    show_tags: function (tagType, handler) {
      var targetDiv = document.getElementById(tagType)
      rfcIndex.tags[tagType].forEach(tagName => {
        let tagData = rfcIndex.tags[tagType][tagName]
        if (!tagData.visible) {
          return
        }
        rfcIndex.render_tag(tagType, tagName, tagData, targetDiv, handler, tagData['colour'])
        targetDiv.appendChild(document.createTextNode(' '))
      })
    },

    render_tag: function (tagType, tagName, tagData, target, handler, bgColour) {
      var tagSpan = document.createElement('span')
      var tagContent = document.createTextNode(tagName)
      tagSpan.appendChild(tagContent)
      tagSpan.classList.add('tag')
      tagSpan.style.backgroundColor = bgColour || this.gen_colour()
      tagSpan.style.color = this.text_colour(tagSpan.style.backgroundColor)
      if (handler) {
        tagSpan.onclick = handler(tagType, tagName, tagData, tagSpan)
      }
      target.appendChild(tagSpan)
      this.tags[tagType][tagName].target = tagSpan
    },

    click_tag_handler: function (tagType, tagName, tagData, tagSpan) {
      return function (event) {
        var alreadySelected = rfcIndex.active_tags[tagType]
        if (alreadySelected && alreadySelected[0] !== tagName) {
          rfcIndex.tags[tagType][alreadySelected[0]].active = false
          alreadySelected[1].style['border-color'] = 'white'
        }
        rfcIndex.active_tags[tagType] = [tagName, tagSpan]
        tagData.active = !tagData.active
        if (tagData.active === true) {
          tagSpan.style['border-color'] = 'black'
        } else {
          tagSpan.style['border-color'] = 'white'
        }
        var selectedRfcs = rfcIndex.list_active_rfcs()
        rfcIndex.show_rfcs(selectedRfcs, document.getElementById('rfc-list'))
      }
    },

    show_obsolete_handler: function () {
      if (rfcIndex.tags['status']['current'].active) {
        rfcIndex.tags['status']['current'].active = false
      } else {
        rfcIndex.tags['status']['current'].active = true
      }
      var selectedRfcs = rfcIndex.list_active_rfcs()
      rfcIndex.show_rfcs(selectedRfcs, document.getElementById('rfc-list'))
    },

    install_obsolete_handler: function () {
      var obsoleteTarget = document.getElementById('obsolete')
      obsoleteTarget.oninput = this.show_obsolete_handler
    },

    list_active_rfcs: function () {
      var filteredRfcs = new Set(this.allRfcs)
      // apply selected tags
      rfcIndex.tags.forEach(tagType => {
        rfcIndex.tags[tagType].forEach(tagName => {
          let tagData = rfcIndex.tags[tagType][tagName]
          if (tagData.active === true) {
            let rfcs = new Set(tagData.rfcs)
            filteredRfcs = filteredRfcs.intersection(rfcs)
          }
        })
      })
      // apply search words
      rfcIndex.searchWords.forEach(searchWord => {
        let wordRfcs = rfcIndex.search_lookup(searchWord, rfcIndex.words, 'title')
        let keywordRfcs = rfcIndex.search_lookup(searchWord, rfcIndex.keywords, 'keywords')
        filteredRfcs = filteredRfcs.intersection(wordRfcs.union(keywordRfcs))
      })
      var rfcList = Array.from(filteredRfcs)
      rfcList.sort(this.rfcSort)
      return rfcList
    },

    show_rfcs: function (rfcList, target) {
      this.clear(target)
      for (let i = 0; i < rfcList.length; i = i + 1) {
        let item = rfcList[i]
        if (typeof (item) === 'object') { // it's a sublist
          let titleElement = document.createElement('h3')
          let titleContent = document.createTextNode(item.title)
          let sublist = document.createElement('ul')
          titleElement.append(titleContent)
          target.appendChild(titleElement)
          target.appendChild(sublist)
          this.show_rfcs(item.rfcs, sublist)
        } else { // it's a string RFC number
          let rfcData = this.rfcs[item]
          this.render_rfc(item, rfcData, target)
        }
      }
      this.hide_impossible_tags(rfcList)
      var count = document.createTextNode(rfcList.length)
      var countTarget = document.getElementById('count')
      this.clear(countTarget)
      countTarget.appendChild(count)
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

    hide_impossible_tags: function (rfcList) {
      var possibleTags = {
        'status': new Set(),
        'stream': new Set(),
        'level': new Set(),
        'wg': new Set()
      }
      rfcList.forEach(rfcNum => {
        possibleTags['status'].add(rfcIndex.rfcs[rfcNum].status)
        possibleTags['stream'].add(rfcIndex.rfcs[rfcNum].stream)
        possibleTags['level'].add(rfcIndex.rfcs[rfcNum].level)
        possibleTags['wg'].add(rfcIndex.rfcs[rfcNum].wg)
      })
      rfcIndex.tagTypes.forEach(tagType => {
        rfcIndex.tags[tagType].forEach(tagName => {
          if (!rfcIndex.tags[tagType][tagName].visible) {
            return
          }
          let active = possibleTags[tagType].has(tagName) ? 'inline' : 'none'
          rfcIndex.tags[tagType][tagName].target.style.display = active
        })
      })
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

    search_index: function (words, inputId, destination) {
      words.forEach(word => {
        word = rfcIndex.cleanString(word)
        if (word.length < rfcIndex.prefixLen) {
          return
        }
        var prefix = word.substring(0, rfcIndex.prefixLen)
        if (destination[prefix]) {
          destination[prefix].add(inputId)
        } else {
          destination[prefix] = new Set([inputId])
        }
      })
    },

    search_lookup: function (searchWord, index, attr) {
      searchWord = this.cleanString(searchWord)
      var searchPrefix = searchWord.substring(0, this.prefixLen)
      var matchRfcs = new Set(index[searchPrefix])
      if (searchWord.length > this.prefixLen) {
        matchRfcs.forEach(rfcNum => {
          let fullItem = rfcIndex.rfcs[rfcNum][attr]
          if (Array.isArray(fullItem)) {
            let hit = false
            fullItem.forEach(item => {
              if (rfcIndex.cleanString(item).includes(searchWord)) {
                hit = true
              }
            })
            if (!hit) {
              matchRfcs.delete(rfcNum)
            }
          } else {
            if (!rfcIndex.cleanString(fullItem).includes(searchWord)) {
              matchRfcs.delete(rfcNum)
            }
          }
        })
      }
      return matchRfcs
    },

    search_input: function () {
      var searchText = document.getElementById('search').value
      rfcIndex.searchWords = searchText.split(' ').filter(word => word)
      rfcIndex.show_rfcs(rfcIndex.list_active_rfcs(), document.getElementById('rfc-list'))
    },

    install_search_handler: function () {
      var searchTarget = document.getElementById('search')
      searchTarget.oninput = this.search_input
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
          // clean up the __ie_onload event
          /* @cc_on
         document.getElementById("__ie_onload").onreadystatechange = "";
         @ */
        }
        // for Mozilla/Opera9
        if (document.addEventListener) {
          document.addEventListener('DOMContentLoaded', init, false)
        }
        // for Internet Explorer
        /* @cc_on
       var script = document.createElement('script');
       script.id = '__ie_onload';
       script.setAttribute("defer", "defer");
       document.getElementsByTagName('head')[0].appendChild(script);
       script.onreadystatechange = function () {
         if (this.readyState === "complete") {
           init(); // call the onload handler
         }
       };
       @ */
        // for Safari
        if (/WebKit/i.test(navigator.userAgent)) { // sniff
          window.__load_timer = setInterval(function () {
            if (/loaded|complete/.test(document.readyState)) {
              init()
            }
          }, 10)
        }
        // for other browsers
        window.onload = init
        window.__load_events = []
      }
      window.__load_events.push(func)
    }
  }

  rfcIndex.addDOMLoadEvent(function () { rfcIndex.init() })
}())
