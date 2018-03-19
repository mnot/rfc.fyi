var rfc_index;

(function() {

  "use strict";

  Set.prototype.intersection = function(setB) {
      var intersection = new Set();
      for (var elem of setB) {
          if (this.has(elem)) {
              intersection.add(elem);
          }
      }
      return intersection;
  }

  rfc_index = {
    level_lookup: {
      "INTERNET STANDARD": "std",
      "DRAFT STANDARD": "std",
      "BEST CURRENT PRACTICE": "bcp",
      "HISTORIC": "historic",
      "EXPERIMENTAL": "experimental",
      "UNKNOWN": "unknown",
      "INFORMATIONAL": "informational",
      "PROPOSED STANDARD": "std"
    },
    init: function() {
      this.outstanding = 0
      this.selected_tags = []
      this.tags = {}
      this.load_json('tags.json', "tags")
      this.rfcs = []
      this.load_json('rfcs.json', "rfcs")
    },
    load_json: function(url, dest) {
      var req = false;
      if (window.XMLHttpRequest) {
        try {
          req = new XMLHttpRequest();
        } catch (e1) {
          req = false;
        }
      } else if (window.ActiveXObject) {
        try {
          req = new ActiveXObject("Microsoft.XMLHTTP");
        } catch (e2) {
          req = false;
        }
      }
      if (req) {
        req.onreadystatechange = function() {
          if (req.readyState === 4) {
            rfc_index.outstanding -= 1
            rfc_index[dest] = JSON.parse(req.responseText)
            if (rfc_index.outstanding == 0) {
              rfc_index.load_done()
            }
          }
        };
        try {
          rfc_index.outstanding += 1
          req.open("GET", url, true);
          req.send("");
        } catch (e3) {
          rfc_index.outstanding -= 1;
          alert("Request error: " + url + " (" + e3 + ")");
        }
      }
    },
    load_done: function() {
      this.show_tags('tag', this.add_tag_handler)
      this.compute_tags()
      this.show_tags('status', this.add_tag_handler)
      this.show_tags('stream', this.add_tag_handler)
      this.show_tags('level', this.add_tag_handler)
      this.show_tags('wg', this.add_tag_handler)
    },
    compute_tags: function() {
      var rfc_nums = Object.keys(this.rfcs)
      rfc_nums.sort(function (a,b) {
        return parseInt(a.replace("RFC", "")) - parseInt(b.replace("RFC", ""))
      })
      for (var i = 0; i < rfc_nums.length; i = i + 1) {
        var rfc_num = rfc_nums[i]
        var rfc = this.rfcs[rfc_num]
        // current?
        if (rfc['obsoleted-by']) {
          this.tag("obsoleted", rfc_num, "status", '')
        } else {
          this.tag("current", rfc_num, "status", '')
        }
        // stream
        this.tag(rfc.stream.toLowerCase(), rfc_num, "stream", '')
        // level
        var level = this.level_lookup[rfc['current-status']]
        this.tag(level, rfc_num, "level", '')
        // wg
        if (rfc.wg_acronym && rfc.wg_acronym != "NON WORKING GROUP") {
          this.tag(rfc.wg_acronym, rfc_num, "wg", '')
        }
      }
    },
    tag: function(name, value, type, bg_colour) {
      if (! this.tags[type]) {
        this.tags[type] = {}
      }
      if (! this.tags[type][name]) {
        this.tags[type][name] = {
            "colour": bg_colour,
            "rfcs": []
        }
      }
      this.tags[type][name].rfcs.push(value)
    },
    show_tags: function(type, handler) {
      var target_div = document.getElementById(type)
      for (var tag_name in this.tags[type]) {
        if (this.tags[type].hasOwnProperty(tag_name)) {
          var tag_data = this.tags[type][tag_name]
          this.render_tag(tag_name, tag_data, target_div, handler, tag_data['colour'])
          target_div.appendChild(document.createTextNode(" "))
        }
      }
    },
    render_tag: function(tag_name, tag_data, target, handler, bg_colour) {
      var tag_span = document.createElement("span")
      var tag_content = document.createTextNode(tag_name)
      tag_span.appendChild(tag_content)
      tag_span.classList.add('tag')
      tag_span.style.backgroundColor = bg_colour || this.gen_colour()
      tag_span.style.color = this.text_colour(tag_span.style.backgroundColor)
      if (handler) {
        tag_span.onclick = handler(tag_name, tag_data)
      }
      target.appendChild(tag_span)
    },
    show_rfc_handler: function(tag_name, tag_data) {
      return function (event) {
        rfc_index.show_rfcs(tag_data.rfcs, document.getElementById("rfc-list"))
      }
    },
    add_tag_handler: function(tag_name, tag_data) {
      return function (event) {
      rfc_index.selected_tags.push([tag_name, tag_data])
      var selected_rfcs = rfc_index.filter_tags(rfc_index.selected_tags)
      rfc_index.show_rfcs(selected_rfcs, document.getElementById("rfc-list"))
      }
    },
    filter_tags: function(tag_list) {
      var filtered_rfcs = new Set(tag_list[0][1].rfcs)
      for (var i = 1; i < tag_list.length; i = i + 1) {
        var rfcs = new Set(tag_list[i][1].rfcs)
        var filtered_rfcs = filtered_rfcs.intersection(rfcs)
      }
      var rfc_list = Array.from(filtered_rfcs)
      return rfc_list
    },
    show_rfcs: function(rfcs, target) {
      this.clear(target)
      for (var i = 0; i < rfcs.length; i = i + 1) {
        var item = rfcs[i]
        if (typeof(item) === 'object') { // it's a sublist
          var title_element = document.createElement("h3")
          var title_content = document.createTextNode(item.title)
          var sublist = document.createElement("ul")
          title_element.append(title_content)
          target.appendChild(title_element)
          target.appendChild(sublist)
          this.show_rfcs(item.rfcs, sublist)
        } else { // it's a string RFC number
          var rfc_data = this.rfcs[item]
          this.render_rfc(item, rfc_data, target)
        }
      }
      var count = document.createTextNode(rfcs.length)
      var count_target = document.getElementById("count")
      this.clear(count_target)
      count_target.appendChild(count)
    },
    render_rfc: function(rfc_name, rfc_data, target) {
        var rfc_span = document.createElement("li")
        rfc_span.data = rfc_data
        var rfc_content = document.createTextNode(rfc_name + ": " + rfc_data.title)
        rfc_span.appendChild(rfc_content)
//        tag_span.onclick = this.click_handler(tag_name, tag_data)
        target.appendChild(rfc_span)
    },
    filter_rfc_handler: function(tag_name, tag_data) {
      return function (event) {
        rfc_index.show_rfcs(tag_data.rfcs, document.getElementById("rfc-list"))
      }
    },
    clear: function(target) {
      while (target.firstChild) {
          target.removeChild(target.firstChild);
      }
    },

    gen_colour: function() {
      var hex = '0123456789ABCDEF'
      var colour = '#'
      for (var i = 0; i < 6; i++) {
        colour += hex[Math.floor(Math.random() * 16)]
      }
      return colour
    },

    text_colour: function(bg) {
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
         var i = 0;
         // quit if this function has already been called
         if (rfc_index.addDOMLoadEvent.done) {return; }
         rfc_index.addDOMLoadEvent.done = true;
         if (window.__load_timer) {
           clearInterval(window.__load_timer);
           window.__load_timer = null;
         }
         for (i; i < window.__load_events.length; i += 1) {
           window.__load_events[i]();
         }
         window.__load_events = null;
         // clean up the __ie_onload event
         /*@cc_on
         document.getElementById("__ie_onload").onreadystatechange = "";
         @*/
       };
       // for Mozilla/Opera9
       if (document.addEventListener) {
         document.addEventListener("DOMContentLoaded", init, false);
       }
       // for Internet Explorer
       /*@cc_on
       var script = document.createElement('script');
       script.id = '__ie_onload';
       script.setAttribute("defer", "defer");
       document.getElementsByTagName('head')[0].appendChild(script);
       script.onreadystatechange = function () {
         if (this.readyState === "complete") {
           init(); // call the onload handler
         }
       };
       @*/
       // for Safari
       if (/WebKit/i.test(navigator.userAgent)) { // sniff
         window.__load_timer = setInterval(function () {
           if (/loaded|complete/.test(document.readyState)) {
             init();
           }
         }, 10);
       }
       // for other browsers
       window.onload = init;
       window.__load_events = [];
     }
     window.__load_events.push(func);
   }
 }

 rfc_index.addDOMLoadEvent(function () { rfc_index.init(); })
}())
