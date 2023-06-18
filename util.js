/* global XMLHttpRequest */

let outstanding = 0 // outstanding fetches
let doneFunc = null
let doneContext = null

export function loadJson (url, func) {
  const req = new XMLHttpRequest()
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

export function onDone (func, context) {
  doneFunc = func
  doneContext = context
}

function loadDone () {
  doneFunc.bind(doneContext)()
}

export function genColour (str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  let colour = '#'
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF
    colour += ('00' + value.toString(16)).substr(-2)
  }
  return colour
}

export function revColour (inColour) {
  const rgb = inColour.match(/\d+/g)
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] // ITU-R BT.709
  if (luma < 128) {
    return '#fff'
  } else {
    return '#000'
  }
}

Set.prototype.intersection = function (setB) { // eslint-disable-line
  const intersection = new Set()
  for (const elem of setB) {
    if (this.has(elem)) {
      intersection.add(elem)
    }
  }
  return intersection
}

Set.prototype.union = function (setB) { // eslint-disable-line
  const union = new Set()
  for (const elemA of this) {
    union.add(elemA)
  }
  for (const elemB of setB) {
    union.add(elemB)
  }
  return union
}

Set.prototype.difference = function (setB) { // eslint-disable-line
  const difference = new Set()
  for (const elem of this) {
    if (!setB.has(elem)) {
      difference.add(elem)
    }
  }
  return difference
}

Object.prototype.forEach = function (func) { // eslint-disable-line
  for (const item in this) {
    if (this.hasOwnProperty(item)) { // eslint-disable-line
      func(item)
    }
  }
}

Object.prototype.keys = function () { // eslint-disable-line
  const keys = []
  this.forEach(item => keys.push(item))
  return keys
}

Object.prototype.get = function (key, backstop) { // eslint-disable-line
  if (this.hasOwnProperty(key)) {  // eslint-disable-line
    return this[key]
  } else {
    return backstop
  }
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
    const init = function () {
      let i = 0
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
