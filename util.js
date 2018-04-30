/* global XMLHttpRequest */

var outstanding = 0 // outstanding fetches
var doneFuncs = [] // things to do when fetching is done

export function loadJson (url, func) {
  var req = new XMLHttpRequest()
  req.onreadystatechange = function () {
    if (req.readyState === 4) {
      outstanding -= 1
      func(JSON.parse(req.responseText)) // TODO: error handling
      if (outstanding === 0) {
        loadDone()
      }
    }
  }
  try {
    outstanding += 1
    req.open('GET', url, true)
    req.send('')
  } catch (e3) {
    outstanding -= 1
    console.log(`Request error: ${url} (${e3})`)
  }
}

export function onDone (func) {
  doneFuncs.push(func)
}

function loadDone () {
  doneFuncs.forEach(func => {
    func()
  })
}

export function getParameterByName (name) {
  var url = window.location.href
  name = name.replace(/[[\]]/g, '\\$&')
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)')
  var results = regex.exec(url)
  if (!results) return null
  if (!results[2]) return ''
  return decodeURIComponent(results[2].replace(/\+/g, ' '))
}

export function genColour () {
  var hex = '0123456789ABCDEF'
  var colour = '#'
  for (let i = 0; i < 6; i++) {
    colour += hex[Math.floor(Math.random() * 16)]
  }
  return colour
}

export function revColour (inColour) {
  var rgb = inColour.match(/\d+/g)
  var luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] // ITU-R BT.709
  if (luma < 128) {
    return '#fff'
  } else {
    return '#000'
  }
}

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
export function addDOMLoadEvent (func) {
  if (!window.__load_events) {
    var init = function () {
      var i = 0
      // quit if this function has already been called
      if (addDOMLoadEvent.done) { return }
      addDOMLoadEvent.done = true
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
