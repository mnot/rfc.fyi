$traceurRuntime.registerModule("util.js", [], function() {
  "use strict";
  var __moduleName = "util.js";
  var outstanding = 0;
  var doneFuncs = [];
  function loadJson(url, func) {
    var req = new XMLHttpRequest();
    req.onreadystatechange = function() {
      if (req.readyState === 4) {
        outstanding -= 1;
        func(JSON.parse(req.responseText));
        if (outstanding === 0) {
          loadDone();
        }
      }
    };
    try {
      outstanding += 1;
      req.open('GET', url, true);
      req.send('');
    } catch (e3) {
      outstanding -= 1;
      console.log(("Request error: " + url + " (" + e3 + ")"));
    }
  }
  function onDone(func) {
    doneFuncs.push(func);
  }
  function loadDone() {
    doneFuncs.forEach(function(func) {
      func();
    });
  }
  function getParameterByName(name) {
    var url = window.location.href;
    name = name.replace(/[[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    var results = regex.exec(url);
    if (!results)
      return null;
    if (!results[2])
      return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }
  function genColour(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    var colour = '#';
    for (var i$__14 = 0; i$__14 < 3; i$__14++) {
      var value = (hash >> (i$__14 * 8)) & 0xFF;
      colour += ('00' + value.toString(16)).substr(-2);
    }
    return colour;
  }
  function revColour(inColour) {
    var rgb = inColour.match(/\d+/g);
    var luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    if (luma < 128) {
      return '#fff';
    } else {
      return '#000';
    }
  }
  Set.prototype.intersection = function(setB) {
    var intersection = new Set();
    var $__3 = true;
    var $__4 = false;
    var $__5 = undefined;
    try {
      for (var $__1 = void 0,
          $__0 = (setB)[Symbol.iterator](); !($__3 = ($__1 = $__0.next()).done); $__3 = true) {
        var elem = $__1.value;
        {
          if (this.has(elem)) {
            intersection.add(elem);
          }
        }
      }
    } catch ($__6) {
      $__4 = true;
      $__5 = $__6;
    } finally {
      try {
        if (!$__3 && $__0.return != null) {
          $__0.return();
        }
      } finally {
        if ($__4) {
          throw $__5;
        }
      }
    }
    return intersection;
  };
  Set.prototype.union = function(setB) {
    var union = new Set();
    var $__3 = true;
    var $__4 = false;
    var $__5 = undefined;
    try {
      for (var $__1 = void 0,
          $__0 = (this)[Symbol.iterator](); !($__3 = ($__1 = $__0.next()).done); $__3 = true) {
        var elemA = $__1.value;
        {
          union.add(elemA);
        }
      }
    } catch ($__6) {
      $__4 = true;
      $__5 = $__6;
    } finally {
      try {
        if (!$__3 && $__0.return != null) {
          $__0.return();
        }
      } finally {
        if ($__4) {
          throw $__5;
        }
      }
    }
    var $__10 = true;
    var $__11 = false;
    var $__12 = undefined;
    try {
      for (var $__8 = void 0,
          $__7 = (setB)[Symbol.iterator](); !($__10 = ($__8 = $__7.next()).done); $__10 = true) {
        var elemB = $__8.value;
        {
          union.add(elemB);
        }
      }
    } catch ($__13) {
      $__11 = true;
      $__12 = $__13;
    } finally {
      try {
        if (!$__10 && $__7.return != null) {
          $__7.return();
        }
      } finally {
        if ($__11) {
          throw $__12;
        }
      }
    }
    return union;
  };
  Set.prototype.difference = function(setB) {
    var difference = new Set();
    var $__3 = true;
    var $__4 = false;
    var $__5 = undefined;
    try {
      for (var $__1 = void 0,
          $__0 = (this)[Symbol.iterator](); !($__3 = ($__1 = $__0.next()).done); $__3 = true) {
        var elem = $__1.value;
        {
          if (!setB.has(elem)) {
            difference.add(elem);
          }
        }
      }
    } catch ($__6) {
      $__4 = true;
      $__5 = $__6;
    } finally {
      try {
        if (!$__3 && $__0.return != null) {
          $__0.return();
        }
      } finally {
        if ($__4) {
          throw $__5;
        }
      }
    }
    return difference;
  };
  Object.prototype.forEach = function(func) {
    for (var item in this) {
      if (this.hasOwnProperty(item)) {
        func(item);
      }
    }
  };
  Object.prototype.keys = function() {
    var keys = [];
    this.forEach(function(item) {
      return keys.push(item);
    });
    return keys;
  };
  function addDOMLoadEvent(func) {
    if (!window.__load_events) {
      var init = function() {
        var i = 0;
        if (addDOMLoadEvent.done) {
          return;
        }
        addDOMLoadEvent.done = true;
        if (window.__load_timer) {
          clearInterval(window.__load_timer);
          window.__load_timer = null;
        }
        for (i; i < window.__load_events.length; i += 1) {
          window.__load_events[i]();
        }
        window.__load_events = null;
      };
      document.addEventListener('DOMContentLoaded', init, false);
      window.onload = init;
      window.__load_events = [];
    }
    window.__load_events.push(func);
  }
  return {
    get loadJson() {
      return loadJson;
    },
    get onDone() {
      return onDone;
    },
    get getParameterByName() {
      return getParameterByName;
    },
    get genColour() {
      return genColour;
    },
    get revColour() {
      return revColour;
    },
    get addDOMLoadEvent() {
      return addDOMLoadEvent;
    }
  };
});
$traceurRuntime.registerModule("rfcs.js", [], function() {
  "use strict";
  var __moduleName = "rfcs.js";
  var util = $traceurRuntime.getModule($traceurRuntime.normalizeModuleName("./util.js", "rfcs.js"));
  var prefixLen = 3;
  var tagTypes = ['collection', 'status', 'stream', 'level', 'wg'];
  var unshownTagTypes = ['status'];
  var oldTags = ['status-obsoleted', 'stream-legacy', 'level-historic'];
  var tags = {};
  var activeTags = new Map();
  var verbose = false;
  var words = new Map();
  var keywords = new Map();
  var searchWords = [];
  var allRfcs = [];
  var rfcs = {};
  var tagColours = {
    'stream': '#678',
    'level': '#a33',
    'wg': '#753'
  };
  function init() {
    util.onDone(loadDone);
    util.loadJson('tags.json', function(json) {
      tags = json;
    });
    util.loadJson('rfcs.json', function(json) {
      rfcs = json;
    });
  }
  function loadDone() {
    compute();
    tagTypes.forEach(function(tagType) {
      initTags(tagType, clickTagHandler);
    });
    installFormHandlers();
    loadUrl();
    window.onpopstate = back;
  }
  function back() {
    for (var args = [],
        $__1 = 0; $__1 < arguments.length; $__1++)
      args[$__1] = arguments[$__1];
    loadUrl();
    showRfcs();
  }
  var obsoleteTarget;
  var searchTarget;
  var deleteTarget;
  var form;
  var title;
  function installFormHandlers() {
    obsoleteTarget = document.getElementById('obsolete');
    obsoleteTarget.onchange = showObsoleteHandler;
    searchTarget = document.getElementById('search');
    searchTarget.placeholder = 'Search titles & keywords';
    searchTarget.oninput = searchInput;
    searchTarget.disabled = false;
    searchTarget.focus();
    deleteTarget = document.getElementById('delete');
    deleteTarget.onclick = deleteHandler;
    form = document.forms[0];
    form.onsubmit = function() {
      return false;
    };
    title = document.getElementById('title');
    title.onclick = function() {
      window.location = '/';
    };
  }
  function compute() {
    allRfcs = Object.keys(rfcs);
    allRfcs.sort(rfcSort);
    allRfcs.forEach(function(rfcNum) {
      var rfc = rfcs[rfcNum];
      tagTypes.forEach(function(tagType) {
        var tagName = rfc[tagType];
        if (tagName) {
          if (!tags[tagType])
            tags[tagType] = {};
          if (!tags[tagType][tagName]) {
            tags[tagType][tagName] = {
              'colour': '',
              'rfcs': [],
              'active': false
            };
          }
          tags[tagType][tagName].rfcs.push(rfcNum);
        }
      });
      searchIndex(rfc['title'].split(' '), rfcNum, words);
      searchIndex(rfc['keywords'], rfcNum, keywords);
    });
  }
  function initTags(tagType, clickHandler) {
    if (unshownTagTypes.includes(tagType))
      return;
    var targetDiv = document.getElementById(tagType);
    var tagList = tags[tagType].keys();
    tagList.sort();
    tagList.forEach(function(tagName) {
      renderTag(tagType, tagName, targetDiv, clickHandler);
      targetDiv.appendChild(document.createTextNode(' '));
    });
  }
  function renderTag(tagType, tagName, target, clickHandler) {
    var tagSpan = document.createElement('span');
    var tagContent = document.createTextNode(tagName);
    var tagData = tags[tagType][tagName];
    tagSpan.appendChild(tagContent);
    tagSpan.classList.add('tag');
    tagSpan.style.backgroundColor = tagData['colour'] || tagColours[tagType] || util.genColour(tagName);
    tagSpan.style.color = util.revColour(tagSpan.style.backgroundColor);
    tags[tagType][tagName].target = tagSpan;
    if (clickHandler) {
      tagSpan.onclick = clickHandler(tagType, tagName);
    }
    target.appendChild(tagSpan);
  }
  function clickTagHandler(tagType, tagName) {
    return function(event) {
      var activeTag = activeTags.get(tagType);
      if (activeTag && activeTag !== tagName) {
        setTagActivity(tagType, activeTag, false);
      }
      var tagData = tags[tagType][tagName];
      setTagActivity(tagType, tagName, !tagData.active);
      showRfcs();
      updateUrl();
    };
  }
  function deleteHandler() {
    searchTarget.value = '';
    searchWords = [];
    showRfcs();
    updateUrl();
  }
  function setTagActivity(tagType, tagName, active) {
    var change = tagType !== 'collection';
    var tagData = tags[tagType][tagName];
    tagData.active = active;
    if (tagData.active === true) {
      if (change)
        tagData.target.className = 'tag-active';
      activeTags.set(tagType, tagName);
    } else {
      if (change)
        tagData.target.className = 'tag';
      activeTags.delete(tagType);
    }
  }
  function showRfcs() {
    var target = document.getElementById('rfc-list');
    clear(target);
    var searchedRfcs = new Set();
    var rfcList = [];
    var userInput = false;
    if (activeTags.size !== 0 || (searchWords.length !== 0 && searchWords[0].length >= prefixLen)) {
      userInput = true;
      var taggedRfcs = listTaggedRfcs();
      searchedRfcs = listSearchedRfcs();
      var relevantRfcs = taggedRfcs.intersection(searchedRfcs);
      rfcList = Array.from(relevantRfcs);
      rfcList.sort(rfcSort);
      rfcList.forEach(function(item) {
        var rfcData = rfcs[item];
        renderRfc(item, rfcData, target);
      });
    }
    if (!userInput) {
      var relevantTags = {'collection': new Set(tags['collection'].keys())};
      showTags(relevantTags, false);
    } else if (activeTags.has('collection')) {
      showRelevantTags(relevantRfcs);
    } else if (searchWords.length === 0) {
      showRelevantTags(taggedRfcs);
    } else {
      showRelevantTags(searchedRfcs);
    }
    var count = document.createTextNode(rfcList.length + ' 📄s');
    var countTarget = document.getElementById('count');
    clear(countTarget);
    countTarget.appendChild(count);
    setContainer(rfcList.length > 0 || userInput);
  }
  function listTaggedRfcs() {
    var filteredRfcs = new Set(allRfcs);
    tags.forEach(function(tagType) {
      tags[tagType].forEach(function(tagName) {
        var tagData = tags[tagType][tagName];
        var rfcs = new Set(tagData.rfcs);
        if (tagData.active === true) {
          filteredRfcs = filteredRfcs.intersection(rfcs);
        } else if (!verbose && oldTags.includes((tagType + "-" + tagName))) {
          filteredRfcs = filteredRfcs.difference(rfcs);
        }
      });
    });
    return filteredRfcs;
  }
  function listSearchedRfcs() {
    var filteredRfcs = new Set(allRfcs);
    searchWords.forEach(function(searchWord) {
      if (("RFC" + searchWord) in rfcs) {
        filteredRfcs = new Set([("RFC" + searchWord)]);
      } else if (searchWord.length >= prefixLen || searchWords.length === 1) {
        var wordRfcs = searchLookup(searchWord, words, 'title');
        var keywordRfcs = searchLookup(searchWord, keywords, 'keywords');
        filteredRfcs = filteredRfcs.intersection(wordRfcs.union(keywordRfcs));
      }
    });
    return filteredRfcs;
  }
  function renderRfc(rfcName, rfcData, target) {
    var rfcSpan = document.createElement('li');
    rfcSpan.data = rfcData;
    var rfcNumber = document.createTextNode(rfcName + ': ');
    rfcSpan.appendChild(rfcNumber);
    var rfcLink = document.createElement('a');
    rfcLink.href = 'https://tools.ietf.org/html/' + rfcName.toLowerCase();
    rfcSpan.appendChild(rfcLink);
    var rfcTitle = document.createTextNode(rfcData.title);
    rfcLink.appendChild(rfcTitle);
    target.appendChild(rfcSpan);
  }
  function showRelevantTags(rfcSet) {
    var relevantTags = {};
    tagTypes.forEach(function(tagType) {
      relevantTags[tagType] = new Set();
      var activeTag = activeTags.get(tagType);
      if (activeTag)
        relevantTags[tagType].add(activeTag);
    });
    rfcSet.forEach(function(rfcNum) {
      tagTypes.forEach(function(tagType) {
        var tagName = rfcs[rfcNum][tagType];
        if (!verbose && oldTags.includes((tagType + "-" + tagName))) {
          return;
        }
        if (tagName) {
          relevantTags[tagType].add(tagName);
        }
      });
    });
    showTags(relevantTags);
  }
  function showTags(relevantTags) {
    var showHeader = arguments[1] !== (void 0) ? arguments[1] : true;
    tagTypes.forEach(function(tagType) {
      if (unshownTagTypes.includes(tagType))
        return;
      if (!relevantTags[tagType]) {
        relevantTags[tagType] = new Set();
      }
      var header = document.getElementById(tagType + '-header');
      header.style.display = showHeader && relevantTags[tagType].size > 0 ? 'block' : 'none';
      tags[tagType].forEach(function(tagName) {
        var visibility = relevantTags[tagType].has(tagName) ? 'inline' : 'none';
        tags[tagType][tagName].target.style.display = visibility;
      });
    });
  }
  function searchIndex(words, inputId, index) {
    words.forEach(function(word) {
      word = cleanString(word);
      if (word.length < prefixLen) {
        return;
      }
      var prefix = word.substring(0, prefixLen);
      if (index.has(prefix)) {
        index.get(prefix).add(inputId);
      } else {
        index.set(prefix, new Set([inputId]));
      }
    });
  }
  function searchInput() {
    var searchText = document.getElementById('search').value;
    searchWords = searchText.split(' ').filter(function(word) {
      return word;
    });
    showRfcs();
    updateUrl();
  }
  function searchLookup(searchWord, index, attr) {
    searchWord = cleanString(searchWord);
    var searchPrefix = searchWord.substring(0, prefixLen);
    var matchRfcs = new Set(index.get(searchPrefix));
    if (searchWord.length > prefixLen) {
      matchRfcs.forEach(function(rfcNum) {
        var hit = false;
        var fullItem = rfcs[rfcNum][attr];
        if (typeof(fullItem) === 'string')
          fullItem = fullItem.split(' ');
        fullItem.forEach(function(item) {
          if (cleanString(item).startsWith(searchWord))
            hit = true;
        });
        if (!hit)
          matchRfcs.delete(rfcNum);
      });
    }
    return matchRfcs;
  }
  function showObsoleteHandler(event) {
    verbose = obsoleteTarget.checked;
    showRfcs();
    updateUrl();
  }
  function updateUrl() {
    var queries = [];
    if (searchWords.length > 0) {
      queries.push('search=' + searchWords.join('%20'));
    }
    if (verbose) {
      queries.push('obsolete');
    }
    tags.forEach(function(tagType) {
      var urlTags = [];
      tags[tagType].forEach(function(tagName) {
        var tagData = tags[tagType][tagName];
        if (tagData.active === true) {
          urlTags.push(tagName);
        }
      });
      if (urlTags.length > 0) {
        queries.push(tagType + '=' + urlTags.join(','));
      }
    });
    var url = './';
    if (queries.length > 0)
      url += '?';
    url += queries.join('&');
    history.pushState({}, '', url);
  }
  function loadUrl() {
    var search = util.getParameterByName('search') || '';
    document.getElementById('search').value = search;
    searchWords = search.split(' ').filter(function(word) {
      return word;
    });
    if (util.getParameterByName('obsolete') !== null) {
      verbose = true;
    }
    obsoleteTarget.checked = verbose;
    tagTypes.forEach(function(tagType) {
      if (unshownTagTypes.includes(tagType))
        return;
      activeTags.delete(tagType);
      var tagstring = util.getParameterByName(tagType);
      var urlTagNames = new Set(tagstring ? tagstring.split(',') : []);
      tags[tagType].forEach(function(tagName) {
        setTagActivity(tagType, tagName, urlTagNames.has(tagName));
      });
      if (urlTagNames.size > 0) {
        activeTags.set(tagType, urlTagNames.keys().next().value);
      }
    });
    showRfcs();
  }
  function clear(target) {
    while (target.firstChild) {
      target.removeChild(target.firstChild);
    }
  }
  function setContainer(hasResults) {
    var container = document.getElementById('container');
    container.className = hasResults ? 'results' : 'noresults';
  }
  function cleanString(input) {
    var output = input.toLowerCase();
    return output.replace(/[\]().,?"']/g, '');
  }
  function rfcSort(a, b) {
    return parseInt(b.replace('RFC', '')) - parseInt(a.replace('RFC', ''));
  }
  util.addDOMLoadEvent(init);
  return {};
});
$traceurRuntime.getModule("rfcs.js" + '');
