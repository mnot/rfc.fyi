import * as util from './util.js'

export default class RfcData {
  prefixLen = 3

  allRfcs = [] // list of all RFC names
  tags = {} // tags and associated rfcs
  rfcs = {} // RFC objects
  refs = {} // references
  inRefs = {} // inbound references
  words = new Map() // index of word prefixes to RFCs containing them
  keywords = new Map() // index of keyword phrases to RFCs containing them
  tagTypes = ['collection', 'status', 'stream', 'level', 'wg']

  constructor (doneCallback) {
    const tagLoader = util.loadJson('tags.json')
    const rfcLoader = util.loadJson('rfcs.json')
    const refLoader = util.loadJson('refs.json')
    Promise.all([tagLoader, rfcLoader, refLoader])
    .then(([tags, rfcs, refs]) => {
      this.tags = tags
      this.rfcs = rfcs
      this.refs = refs
      this.createSearchIndex()
      this.computeReferences()
      doneCallback()
    })
  }

  createSearchIndex () {
    this.allRfcs = Object.keys(this.rfcs)
    this.allRfcs.sort(this.rfcSort)
    this.allRfcs.forEach(rfcName => {
      const rfc = this.rfcs[rfcName]
      // tags
      this.tagTypes.forEach(tagType => {
        const tagName = rfc[tagType]
        if (tagName) {
          if (!this.tags[tagType]) this.tags[tagType] = {}
          if (!this.tags[tagType][tagName]) {
            this.tags[tagType][tagName] = {
              colour: '',
              rfcs: []
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
          console.log(`${rfcName} has non-existant informative reference - ${refName}`)
        }
      })
    })
  }

  searchRfcs (searchWords) {
    let filteredRfcs = new Set(this.allRfcs)
    searchWords.forEach(searchWord => {
      const padded = `RFC${searchWord.padStart(4, '0')}`
      if (padded in this.rfcs) {
        filteredRfcs = new Set([padded])
      } else if (searchWord.length >= this.prefixLen || searchWords.length === 1) {
        const wordRfcs = this.searchLookup(searchWord, this.words, 'title')
        const keywordRfcs = this.searchLookup(searchWord, this.keywords, 'keywords')
        filteredRfcs = filteredRfcs.intersection(wordRfcs.union(keywordRfcs))
      }
    })
    return filteredRfcs
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

  listTaggedRfcs (activeTags) {
    let filteredRfcs = new Set(this.allRfcs)
    this.tags.forEach(tagType => {
      const activeTag = activeTags.get(tagType)
      if (activeTag !== undefined) {
        const taggedRfcs = new Set(this.tags[tagType][activeTag].rfcs)
        filteredRfcs = filteredRfcs.intersection(taggedRfcs)
      }
    })
    return filteredRfcs
  }

  cleanString (input) {
    const output = input.toLowerCase()
    return output.replace(/[\]().,?"']/g, '')
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
