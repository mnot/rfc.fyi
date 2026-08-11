export async function loadJson (url) {
  const response = await fetch(url)
  return response.json()
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
  const rgb = inColour.match(/\d+/g).map(Number)
  // Pick whichever of white/black gives the higher WCAG contrast against the
  // background. The max-contrast choice is always >= 4.58:1 for any colour, so
  // tag labels stay legible whatever the (curated or hash-generated) background.
  const lum = relativeLuminance(rgb)
  const contrastWhite = 1.05 / (lum + 0.05)
  const contrastBlack = (lum + 0.05) / 0.05
  return contrastWhite >= contrastBlack ? '#fff' : '#000'
}

function relativeLuminance ([r, g, b]) {
  const channel = c => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/* Set algebra and plain-object iteration, as functions.
 *
 * All of this was on Set.prototype and Object.prototype. Extending built-ins
 * reaches every object in the program including the ones inside libraries we
 * did not write, and it had already cost us twice: an `Object.prototype.get`
 * collided with the property-descriptor field of the same name, so
 * `Object.defineProperty(obj, k, { value })` threw for every object on the
 * page and stopped transformers.js loading from inside its own webpack
 * helper; and the Set methods now shadow the natives of the same names that
 * every current browser ships.
 *
 * These stay hand-written rather than deferring to those natives, since the
 * only thing the prototype versions were buying was compatibility and there
 * is no reason to spend it.
 */

export function intersect (a, b) {
  const out = new Set()
  for (const item of b) {
    if (a.has(item)) out.add(item)
  }
  return out
}

export function union (a, b) {
  const out = new Set(a)
  for (const item of b) out.add(item)
  return out
}

export function difference (a, b) {
  const out = new Set()
  for (const item of a) {
    if (!b.has(item)) out.add(item)
  }
  return out
}

/** Own enumerable keys of a plain object. Was Object.prototype.keys. */
export function ownKeys (object) {
  return Object.keys(object || {})
}

/** Call `func` with each own key. Was Object.prototype.forEach. */
export function forEachKey (object, func) {
  ownKeys(object).forEach(func)
}

/** Value at `key`, or `backstop` when absent. Was Object.prototype.get. */
export function getOr (object, key, backstop) {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : backstop
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
