
(function () {
  "use strict";


  var HUB = {
    size:  { key: "lyceum-size",  values: ["small", "medium", "large"] },
    font:  { key: "lyceum-font",  values: ["serif", "sans", "dyslexic"] },
    theme: { key: "lyceum-theme", values: ["light", "dark", "contrast"] }
  };



  var SMALL_MEDIUM_LARGE = { s: "small", m: "medium", l: "large" };
  var SERIF_SANS_DYS     = { serif: "serif", sans: "sans", dys: "dyslexic" };
  var LIGHT_DARK_CONTRAST = { light: "light", dark: "dark", contrast: "contrast" };

  var CITATION_STATION = {
    kind: "blob",
    key: "cs_a11y",
    map: { size: SMALL_MEDIUM_LARGE, font: SERIF_SANS_DYS, theme: LIGHT_DARK_CONTRAST }
  };

  var RESEARCH_BASICS_MAP = {
    size: SMALL_MEDIUM_LARGE, font: SERIF_SANS_DYS, theme: LIGHT_DARK_CONTRAST
  };

  var ADAPTERS = {
    mla: CITATION_STATION,
    apa: CITATION_STATION,

    rbgettingstarted:     { kind: "prefixed", prefix: "gs_", map: RESEARCH_BASICS_MAP },
    rbsearchesandsources: { kind: "prefixed", prefix: "rb_", map: RESEARCH_BASICS_MAP },

    imageclearinghouse: {
      kind: "prefixed",
      prefix: "ic_",
      map: {
        size:  SMALL_MEDIUM_LARGE,
        font:  { serif: "serif", sans: "sans" },
        theme: LIGHT_DARK_CONTRAST
      }
    },

    annotation: {
      kind: "prefixed",
      prefix: "ann_",
      map: {
        size:  { "1": "small", "2": "medium", "3": "large" },
        font:  { serif: "serif", sans: "sans", dyslexia: "dyslexic" },
        theme: LIGHT_DARK_CONTRAST
      }
    },

    babel: {
      kind: "prefixed",
      prefix: "cat-",
      map: { theme: { light: "light", dark: "dark" } }
    }
  };



  var LS;
  try {
    LS = window.localStorage;
    if (!LS) return;
  } catch (e) { return; }

  var nativeGet = LS.getItem.bind(LS);
  var nativeSet = LS.setItem.bind(LS);

  function get(key) { try { return nativeGet(key); } catch (e) { return null; } }
  function set(key, value) { try { nativeSet(key, value); } catch (e) {} }

  function invert(table) {
    var out = {};
    for (var local in table) {
      if (Object.prototype.hasOwnProperty.call(table, local)) out[table[local]] = local;
    }
    return out;
  }

  function which() {
    var tag = document.currentScript;
    if (!tag) {
      var all = document.querySelectorAll("script[data-guide]");
      tag = all.length ? all[all.length - 1] : null;
    }
    return tag ? tag.getAttribute("data-guide") : null;
  }

  var name = which();
  var adapter = name && ADAPTERS[name];
  if (!adapter) return;

  var DIMENSIONS = ["size", "font", "theme"];

  function dimensionsOf(a) {
    return DIMENSIONS.filter(function (d) { return a.map[d]; });
  }

  function localKey(d) {
    return adapter.kind === "blob" ? adapter.key : adapter.prefix + d;
  }

  function readBlob() {
    try {
      var raw = get(adapter.key);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) { return {}; }
  }

  function readLocal(d) {
    return adapter.kind === "blob" ? (readBlob()[d] || null) : get(localKey(d));
  }

  function writeLocal(d, value) {
    if (adapter.kind === "blob") {
      var blob = readBlob();
      if (blob[d] === value) return;
      blob[d] = value;
      set(adapter.key, JSON.stringify(blob));
    } else {
      if (get(localKey(d)) === value) return;
      set(localKey(d), value);
    }
  }



  function reconcile() {
    dimensionsOf(adapter).forEach(function (d) {
      var toHub   = adapter.map[d];
      var fromHub = invert(toHub);

      var hubValue   = get(HUB[d].key);
      var localValue = readLocal(d);

      if (hubValue && HUB[d].values.indexOf(hubValue) !== -1) {
        var translated = fromHub[hubValue];
        if (translated) writeLocal(d, translated);
        return;
      }

      if (localValue && toHub[localValue]) set(HUB[d].key, toHub[localValue]);
    });
  }



  function mirror(d, localValue) {
    var hubValue = adapter.map[d][localValue];
    if (hubValue && get(HUB[d].key) !== hubValue) set(HUB[d].key, hubValue);
  }

  function intercept() {
    var watched = {};
    dimensionsOf(adapter).forEach(function (d) { watched[localKey(d)] = d; });

    LS.setItem = function (key, value) {
      nativeSet(key, value);

      if (!Object.prototype.hasOwnProperty.call(watched, key)) return;

      try {
        if (adapter.kind === "blob") {
          var blob = JSON.parse(String(value));
          if (blob && typeof blob === "object") {
            dimensionsOf(adapter).forEach(function (d) {
              if (blob[d]) mirror(d, blob[d]);
            });
          }
        } else {
          mirror(watched[key], String(value));
        }
      } catch (e) {
      }
    };
  }



  function arm() {
    try { intercept(); } catch (e) {}
  }

  try {
    reconcile();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", arm);
    } else {
      arm();
    }
  } catch (e) {
  }
})();
