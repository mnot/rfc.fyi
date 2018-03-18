var rfc_index;

(function() {

  "use strict";

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
      this.show_tags('tag', this.show_rfc_handler)
      this.compute_tags()
      this.show_tags('status', this.filter_rfc_handler)
      this.show_tags('stream', this.filter_rfc_handler)
      this.show_tags('level', this.filter_rfc_handler)
    },
    compute_tags: function() {
      for (var rfc_num in this.rfcs) {
          if (this.rfcs.hasOwnProperty(rfc_num)) {
            var rfc = this.rfcs[rfc_num];
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
          }
      }
    },
    tag: function(name, value, type, colour) {
      if (! this.tags[type]) {
        this.tags[type] = {}
      }
      if (! this.tags[type][name]) {
        this.tags[type][name] = {
            "colour": colour,
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
          this.render_tag(tag_name, tag_data, target_div, handler)
          target_div.appendChild(document.createTextNode(" "))
        }
      }
    },
    render_tag: function(tag_name, tag_data, target, handler) {
      var tag_span = document.createElement("span")
      var tag_content = document.createTextNode(tag_name)
      tag_span.appendChild(tag_content)
      tag_span.classList.add('tag')
      tag_span.style.backgroundColor = "#ccc"
      if (handler) {
        tag_span.onclick = handler(tag_name, tag_data)
      }
      target.appendChild(tag_span)     
    },
    show_rfc_handler: function(tag_name, tag_data) {
      return function (event) {
        rfc_index.show_rfcs(tag_data.rfcs)
      }
    },
    show_rfcs: function(rfcs) {
      var rfcs_div = document.getElementById("rfc-list")
      this.clear(rfcs_div)
      for (var i = 0; i < rfcs.length; i = i + 1) {
        var rfc_name = rfcs[i]
        var rfc_data = this.rfcs[rfc_name]
        this.render_rfc(rfc_name, rfc_data, rfcs_div)
      }
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
      
    },
    clear: function(target) {
      while (target.firstChild) {
          target.removeChild(target.firstChild);
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
