/* global alert, XMLHttpRequest, ActiveXObject */

var rfcIndex;

(function () {
  'use strict'

  Set.prototype.intersection = function (setB) { // eslint-disable-line
    var intersection = new Set()
    for (var elem of setB) {
      if (this.has(elem)) {
        intersection.add(elem)
      }
    }
    return intersection
  }

  Object.prototype.forEach = function (func) { // eslint-disable-line
    for (var item in this) {
      if (this.hasOwnProperty(item)) {
        func(item)
      }
    }
  }

  rfcIndex = {

    level_lookup: {
      'INTERNET STANDARD': 'std',
      'DRAFT STANDARD': 'std',
      'BEST CURRENT PRACTICE': 'bcp',
      'HISTORIC': 'historic',
      'EXPERIMENTAL': 'experimental',
      'UNKNOWN': 'unknown',
      'INFORMATIONAL': 'informational',
      'PROPOSED STANDARD': 'std'
    },

    init: function () {
      this.outstanding = 0
      this.tags = {}
      this.active_tags = {}
      this.load_json('tags.json', 'tags')
      this.rfcs = []
      this.load_json('rfcs.json', 'rfcs')
    },

    load_json: function (url, dest) {
      var req = false
      if (window.XMLHttpRequest) {
        try {
          req = new XMLHttpRequest()
        } catch (e1) {
          req = false
        }
      } else if (window.ActiveXObject) {
        try {
          req = new ActiveXObject('Microsoft.XMLHTTP')
        } catch (e2) {
          req = false
        }
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
      this.show_tags('tag', this.click_tag_handler)
      this.compute_tags()
      this.show_tags('status', this.click_tag_handler)
      this.show_tags('stream', this.click_tag_handler)
      this.show_tags('level', this.click_tag_handler)
      this.show_tags('wg', this.click_tag_handler)
    },

    compute_tags: function () {
      var rfcNums = Object.keys(this.rfcs)
      rfcNums.sort(function (a, b) {
        return parseInt(a.replace('RFC', '')) - parseInt(b.replace('RFC', ''))
      })
      for (var i = 0; i < rfcNums.length; i = i + 1) {
        var rfcNum = rfcNums[i]
        var rfc = this.rfcs[rfcNum]
        // current?
        if (rfc['obsoleted-by']) {
          this.tag('obsoleted', rfcNum, 'status', '')
        } else {
          this.tag('current', rfcNum, 'status', '')
        }
        // stream
        this.tag(rfc.stream.toLowerCase(), rfcNum, 'stream', '')
        // level
        var level = this.level_lookup[rfc['current-status']]
        this.tag(level, rfcNum, 'level', '')
        // wg
        if (rfc.wg_acronym && rfc.wg_acronym !== 'NON WORKING GROUP') {
          this.tag(rfc.wg_acronym, rfcNum, 'wg', '')
        }
      }
    },

    tag: function (tagName, rfcNum, tagType, bgColour) {
      if (!this.tags[tagType]) {
        this.tags[tagType] = {}
      }
      if (!this.tags[tagType][tagName]) {
        this.tags[tagType][tagName] = {
          'colour': bgColour,
          'rfcs': [],
          'active': false
        }
      }
      this.tags[tagType][tagName].rfcs.push(rfcNum)
    },

    show_tags: function (tagType, handler) {
      var targetDiv = document.getElementById(tagType)
      rfcIndex.tags[tagType].forEach(function (tagName) {
        var tagData = rfcIndex.tags[tagType][tagName]
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
    },

    show_rfc_handler: function (tagName, tagData) {
      return function (event) {
        rfcIndex.show_rfcs(tagData.rfcs, document.getElementById('rfc-list'))
      }
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

    list_active_rfcs: function () {
      var filteredRfcs = new Set()
      rfcIndex.tags.forEach(function (tagType) {
        rfcIndex.tags[tagType].forEach(function (tagName) {
          var tagData = rfcIndex.tags[tagType][tagName]
          if (tagData.active === true) {
            var rfcs = new Set(tagData.rfcs)
            if (!filteredRfcs.size) {
              filteredRfcs = rfcs
            } else {
              filteredRfcs = filteredRfcs.intersection(rfcs)
            }
          }
        })
      })
      var rfcList = Array.from(filteredRfcs)
      return rfcList
    },

    show_rfcs: function (rfcs, target) {
      this.clear(target)
      for (var i = 0; i < rfcs.length; i = i + 1) {
        var item = rfcs[i]
        if (typeof (item) === 'object') { // it's a sublist
          var titleElement = document.createElement('h3')
          var titleContent = document.createTextNode(item.title)
          var sublist = document.createElement('ul')
          titleElement.append(titleContent)
          target.appendChild(titleElement)
          target.appendChild(sublist)
          this.show_rfcs(item.rfcs, sublist)
        } else { // it's a string RFC number
          var rfcData = this.rfcs[item]
          this.render_rfc(item, rfcData, target)
        }
      }
      var count = document.createTextNode(rfcs.length)
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
      rfcLink.href = 'https://tools.rfc.org/html/' + rfcName.toLowerCase()
      rfcSpan.appendChild(rfcLink)
      var rfcTitle = document.createTextNode(rfcData.title)
      rfcLink.appendChild(rfcTitle)
      target.appendChild(rfcSpan)
    },

    filter_rfc_handler: function (tagName, tagData) {
      return function (event) {
        rfcIndex.show_rfcs(tagData.rfcs, document.getElementById('rfc-list'))
      }
    },

    clear: function (target) {
      while (target.firstChild) {
        target.removeChild(target.firstChild)
      }
    },

    gen_colour: function () {
      var hex = '0123456789ABCDEF'
      var colour = '#'
      for (var i = 0; i < 6; i++) {
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
