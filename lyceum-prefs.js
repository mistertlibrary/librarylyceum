/* LIBRARY LYCEUM: PREFERENCE SYNC SHIM
 *
 * Every site in the network is served from mistertlibrary.github.io, so they
 * all share one localStorage. What they do not share is a vocabulary: the hub
 * stores three plain keys, the Citation Stations store a JSON blob, the
 * Research Basics guides use a gs_ prefix, the Image Clearinghouse uses ic_,
 * and On Annotation uses ann_ with numbered sizes. A student who chooses dark
 * mode and large type on one site meets defaults on the next.
 *
 * This file reconciles them without touching a line of any guide's own code.
 * It does two things:
 *
 *   READ   Before a guide's script runs, translate the hub's stored preference
 *          into that guide's vocabulary and write it under that guide's own
 *          key. The guide's existing restore logic then finds what it always
 *          expected to find and behaves exactly as it always has.
 *
 *   WRITE  Wrap localStorage.setItem so that when a guide saves a preference,
 *          the equivalent hub key is updated too. The guide is unaware; only
 *          its own keys are ever intercepted, and every other key it stores —
 *          citation-game state, saved worksheet fields, cached book covers —
 *          passes through untouched.
 *
 * USAGE — one line in the <head> of each guide, before its own scripts:
 *
 *     <script src="/librarylyceum/lyceum-prefs.js" data-guide="mla"></script>
 *
 * The adapter table below is the single place any of this is described. Adding
 * a guide, or correcting a vocabulary, is a hub edit — no satellite changes.
 *
 * DEGRADATION. If this file fails to load, every guide keeps its own
 * preferences exactly as it does today. Nothing depends on the sync; the sync
 * depends on nothing.
 */

(function () {
  "use strict";

  /* ── HUB VOCABULARY ───────────────────────────────────────
     The canonical values. "contrast" is included because eight of the nine
     guides already offer a high-contrast theme; the hub's own stylesheet does
     not implement one yet, so a hub page renders it as light while preserving
     the stored choice for the guides that can honour it. */

  var HUB = {
    size:  { key: "lyceum-size",  values: ["small", "medium", "large"] },
    font:  { key: "lyceum-font",  values: ["serif", "sans", "dyslexic"] },
    theme: { key: "lyceum-theme", values: ["light", "dark", "contrast"] }
  };


  /* ── ADAPTERS ─────────────────────────────────────────────
     Each entry maps a guide's stored values to the hub vocabulary. A dimension
     the guide does not offer is simply absent, and is then neither read nor
     written for that guide: the Image Clearinghouse ships no dyslexic face, so
     a reader who chooses OpenDyslexic elsewhere keeps it everywhere else and
     sees the Clearinghouse's own typeface there, rather than a broken
     reference to a font that does not exist.

     "blob"     one JSON object under a single key, e.g. cs_a11y
     "prefixed" one plain key per dimension, e.g. gs_theme */

  var SMALL_MEDIUM_LARGE = { s: "small", m: "medium", l: "large" };
  var SERIF_SANS_DYS     = { serif: "serif", sans: "sans", dys: "dyslexic" };
  var LIGHT_DARK_CONTRAST = { light: "light", dark: "dark", contrast: "contrast" };

  var CITATION_STATION = {
    kind: "blob",
    key: "cs_a11y",
    map: { size: SMALL_MEDIUM_LARGE, font: SERIF_SANS_DYS, theme: LIGHT_DARK_CONTRAST }
  };

  /* The two Research Basics guides share a vocabulary but NOT a prefix:
     Getting Started stores preferences under gs_, Searches & Sources under rb_.
     (Searches & Sources also uses gs_ — for its saved worksheet fields, which
     are none of this file's business.) They look like one shape and are two. */
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
      /* No dyslexic option on this guide; the font dimension carries only the
         two faces it actually ships. */
      map: {
        size:  SMALL_MEDIUM_LARGE,
        font:  { serif: "serif", sans: "sans" },
        theme: LIGHT_DARK_CONTRAST
      }
    },

    annotation: {
      kind: "prefixed",
      prefix: "ann_",
      /* Numbered sizes and a differently spelled dyslexic face. */
      map: {
        size:  { "1": "small", "2": "medium", "3": "large" },
        font:  { serif: "serif", sans: "sans", dyslexia: "dyslexic" },
        theme: LIGHT_DARK_CONTRAST
      }
    },

    babel: {
      kind: "prefixed",
      prefix: "cat-",
      /* Theme only. Babel's own default is time-of-day, which is left intact:
         the hub seeds this key only when a reader has actually chosen a theme
         somewhere in the network. */
      map: { theme: { light: "light", dark: "dark" } }
    }
  };


  /* ── PLUMBING ─────────────────────────────────────────────
     Native handles are captured before anything is wrapped, so the shim's own
     reads and writes never re-enter its interceptor. */

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

  /* The guide's own key for a dimension. */
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


  /* ── READ: hub → guide ────────────────────────────────────
     Runs once, before the guide's own scripts. Where the hub holds a value the
     guide can express, that value is written into the guide's own key. Where
     the hub holds nothing, the guide's existing value seeds the hub instead —
     so a reader's established choice is adopted rather than overwritten the
     first time this ships. */

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


  /* ── WRITE: guide → hub ───────────────────────────────────
     setItem is wrapped rather than each guide's save function, because that
     keeps every guide's own code untouched and covers all five storage shapes
     with one code path. Only this guide's preference keys are inspected;
     everything else is handed straight to the native implementation. */

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
        /* A malformed write is the guide's business, not ours. It has already
           been stored; the hub simply does not learn about it. */
      }
    };
  }


  /* ── BOOT ─────────────────────────────────────────────────
     Order matters. Reconcile first, so the guide reads a settled value.
     Arm the interceptor only once the document has been parsed.

     That delay is the important part. Every guide applies its own defaults
     synchronously while the page is parsing — Searches & Sources writes
     rb_font="sans" on load whether or not a reader ever asked for sans. Mirror
     those and the first guide a student happens to open silently becomes the
     network default, overriding, say, On Annotation's deliberate serif. A
     stored value is a choice; a freshly applied default is not. Choices reach
     the hub through reconcile(), which reads what was already saved; only
     writes made after the page has settled — which is to say, clicks — are
     mirrored. */

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
    /* Any failure here leaves the guide exactly as it was before this file
       existed. That is the intended worst case. */
  }
})();
