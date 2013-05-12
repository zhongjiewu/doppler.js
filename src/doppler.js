// This Javascript is to track user activies on the page and send info back to the server

(function($){
  DopplarRadarLocal = Backbone.Model.extend({
    autoSyncPeriod: 5000,
    initialize: function() {
      this.maxUploadSize = 50;
      this.intervalMs = 5000;
      this.joinableEvents = {mousemove:500, scroll:1000};
      this.url = "/api/dopplars";

      // fake console
      var devNull = function() {}
        , fakeConsole = {info:devNull, debug:devNull, error:devNull, log:devNull};
      if(window.console && window.rails_env == "development") {
        this.console = window.console;
      } else {
        this.console = fakeConsole;
      }

      this.eventQueue = [];
      this.timers = [];
      this.lastOmittedEvent = null;
      this.importAll();
      this.startTimer(this.intervalMs);
    },
    uploadAll: function() {
      var localCompressedEventQueue = [];
      while(localCompressedEventQueue.length < this.maxUploadSize &&
        this.eventQueue.length > 0) {
        var event = this.eventQueue.shift();
        localCompressedEventQueue.push(deflateEvent(event));
      }
      if(localCompressedEventQueue.length > 0) {
        var json = JSON.stringify(localCompressedEventQueue)
          , url = this.url;
        if(btoa && window.rails_env != "development") {
          json = btoa(json);
          url = url + "?b=t"; // signal encoding
        }
        $.ajax({
          url: url,
          method: "POST",
          contentType: "text/plain",
          data: json
        });
        this.console.debug("Posted " + localCompressedEventQueue.length + " events to server");
      }
    },
    append: function(newEvent) {
      // determin if to recycle omitted event
      if(this.lastOmittedEvent != null) {
        var omittedEvent = this.lastOmittedEvent;
        if(!this.newEventOmittable(omittedEvent, newEvent)) {
          this.eventQueue.push(omittedEvent);
          this.lastOmittedEvent = null;
        }
      }
      // determine if to insert new event
      if(this.eventQueue.length > 0) {
        var lastEvent = this.eventQueue[this.eventQueue.length - 1];
        if(!this.newEventOmittable(lastEvent, newEvent)) {
          this.eventQueue.push(newEvent);
        } else {
          this.lastOmittedEvent = newEvent;
        }
      } else {
        this.eventQueue.push(newEvent);
      }
    },
    startTimer: function(intervalMs) {
      var context = this;
      timer = setInterval(function(){
        (function(){
          this.uploadAll();
        }).apply(context);
      },intervalMs);
      this.timers.push(timer);
    },
    stopTimers: function() {
      while(this.timers.length != 0) {
        var timer = this.timers.shift();
        clearInterval(timer);
      }
    },
    newEventOmittable: function(lastEvent, newEvent) {
      if(lastEvent.type == newEvent.type) {
        var type = lastEvent.type
          , deltaMs = newEvent.timeStamp - lastEvent.timeStamp
          , maxJoiableTimeGapMs = this.joinableEvents[type];

        if(deltaMs < 0) {
          deltaMs = -deltaMs;
        }
        if(maxJoiableTimeGapMs != null && deltaMs < maxJoiableTimeGapMs) {
          return true;
        }
        if(type == "mousemove" &&
          lastEvent.screenX == newEvent.screenX &&
          lastEvent.screenY == newEvent.screenY) {
          console.log("mouse actually not moved");
          return false;
        }
      }
      return false;
    },
    exportAll: function() {
      var localCompressedEventQueue = [];
      while(this.eventQueue.length > 0) {
        var event = this.eventQueue.shift();
        localCompressedEventQueue.push(deflateEvent(event));
      }
      if(localCompressedEventQueue.length > 0) {
        var json = JSON.stringify(localCompressedEventQueue)
          , binary = false;
        if(btoa) {
          json = btoa(json);
          binary = true;
        }
        var data = JSON.stringify({encode:binary,json:json});
        if(window && window.localStorage) {
          window.localStorage.setItem('dopplar',data);
          this.console.debug("exported " + localCompressedEventQueue.length + " events to localStorage");
        } else {
          $.cookie("dopplar", data, { expires: 365, path: '/' });
          this.console.debug("exported " + localCompressedEventQueue.length + " events to cookie");
        }
      }
    },
    // import
    importAll: function() {
      try {
        if(window.localStorage) {
          var data = window.localStorage.getItem('dopplar');
          window.localStorage.removeItem('dopplar');
          if(data != null && data != "") {
            var count = this.importOne(data);
            this.console.debug("Imported " + count + " events from localStorage");
          }
        }
      } catch(e) {
        this.console.error("Failed to import doppler events from localStorage");
        this.console.error(e);
      }
      try {
        var data = $.cookie("dopplar");
        $.removeCookie("dopplar",{ path: '/' });
        if(data != null && data != "") {
          var count = this.importOne(data);
          this.console.debug("Imported " + count + " events from cookie");
        }
      } catch(e) {
        this.console.error("Failed to import doppler events from cookie");
        this.console.error(e);
      }
    },
    importOne: function(data) {
      var data = JSON.parse(data)
        , json = data.json
        , encode = data.encode
        , count = 0;
      if(encode) {
        json = atob(json);
      }
      localCompressedEventQueue = JSON.parse(json);
      count = localCompressedEventQueue.length;
      while(localCompressedEventQueue.length > 0) {
        var event = inflateEvent(localCompressedEventQueue.shift());
        this.eventQueue.push(event);
      }
      return count;
    },
  });

  function extractEvent(e) {
    var result = {
      type           : e.type,
      timeStamp      : e.timeStamp,
      offsetX        : e.offsetX,
      offsetY        : e.offsetY,
      pageX          : e.pageX,
      pageY          : e.pageY,
      screenX        : e.screenX,
      screenY        : e.screenY,
      clientX        : e.clientX,
      clientY        : e.clientY,
      target         : $(e.target).domAddress(),
      currentTarget  : $(e.currentTarget).domAddress(),
      relatedTarget  : $(e.relatedTarget).domAddress(),
      altKey         : e.altKey,
      ctrlKey        : e.ctrlKey,
      bubbles        : e.bubbles,
      button         : e.button,
      cancelable     : e.cancelable,
      charCode       : e.charCode,
      data           : e.data,
      detail         : e.detail,
      eventPhase     : e.eventPhase,
      metaKey        : e.metaKey,
      prevValue      : e.prevValue,
      which          : e.which,
    };
    return result;
  }
  function deflateEvent(e) {
    return [
      e.type,e.timeStamp,e.offsetX,e.offsetY,e.pageX,e.pageY,e.screenX,e.screenY,e.clientX,e.clientY,
      e.target,e.currentTarget,e.relatedTarget,e.altKey,e.ctrlKey,e.bubbles,e.button,e.cancelable,
      e.charCode,e.data,e.detail,e.eventPhase,e.metaKey,e.prevValue,e.which
    ];
  };
  function inflateEvent(e) {
    return {
      type           : e[0],
      timeStamp      : e[1],
      offsetX        : e[2],
      offsetY        : e[3],
      pageX          : e[4],
      pageY          : e[5],
      screenX        : e[6],
      screenY        : e[7],
      clientX        : e[8],
      clientY        : e[9],
      target         : e[10],
      currentTarget  : e[11],
      relatedTarget  : e[12],
      altKey         : e[13],
      ctrlKey        : e[14],
      bubbles        : e[15],
      button         : e[16],
      cancelable     : e[17],
      charCode       : e[18],
      data           : e[19],
      detail         : e[20],
      eventPhase     : e[21],
      metaKey        : e[22],
      prevValue      : e[23],
      which          : e[24]
    };
  }

  $(window.dopplerToggles).each(function(i,e){
    $(window).on(e, function(e){
      var simpleEvent = extractEvent(e);
      localRadar.append(simpleEvent);
    });
  });

  $(window).unload(function(i,e){
    localRadar.stopTimers();
    localRadar.exportAll();
  });

  window.localRadar || (window.localRadar = new DopplarRadarLocal()); 
})(jQuery);
