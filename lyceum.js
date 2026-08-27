/* LIBRARY LYCEUM: SHARED BEHAVIOUR
   Reader preferences, the accessibility panel, and small helpers.
   The pre-paint snippet in each page's <head> is separate. */

(function () {
  "use strict";

  var STORE = { size: "lyceum-size", font: "lyceum-font", theme: "lyceum-theme" };
  var DEFAULTS = { size: "small", font: "serif", theme: "light" };

  function read(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, value); }
    catch (e) {}
  }


  /* ── PREFERENCES ──────────────────────────────────────── */

  var root = document.documentElement;

  function applySize(val) {
    if (val === "small") delete root.dataset.size;
    else root.dataset.size = val;
  }

  /* OpenDyslexic lives in its own stylesheet so that its ~130KB is fetched only
     by readers who choose it, rather than by everyone on every page. The URL is
     derived from the canonical fonts link rather than hard-coded, so this keeps
     working at any directory depth and in any repository that vendors the
     chrome. The pre-paint snippet in the head injects the same link when the
     stored preference is already "dyslexic", so a reader who needs the face
     does not get a flash of the fallback first. */
  function ensureDyslexicCss() {
    if (document.getElementById("lyceum-dyslexic")) return;
    var base = document.querySelector('link[href*="lyceum-fonts.css"]');
    var href = base
      ? base.getAttribute("href").replace("lyceum-fonts.css", "lyceum-dyslexic.css")
      : "lyceum-dyslexic.css";
    var link = document.createElement("link");
    link.id = "lyceum-dyslexic";
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function applyFont(val) {
    if (val === "dyslexic") ensureDyslexicCss();
    root.dataset.font = val;
  }

  /* A reader may arrive holding a theme this stylesheet cannot render — a value
     from a future palette, or a corrupted entry. Rather than discard the choice,
     which would silently reset it for every guide that CAN honour it, the stored
     value is left alone and only the rendering falls back. */
  var THEMES = ["light", "dark", "contrast"];
  function renderable(val) { return THEMES.indexOf(val) === -1 ? "light" : val; }

  function applyTheme(val) { root.dataset.theme = renderable(val); }

  function markActive(type, val) {
    var buttons = document.querySelectorAll(".a11y-btn[data-" + type + "]");
    Array.prototype.forEach.call(buttons, function (b) {
      var match = b.dataset[type] === val;
      b.classList.toggle("active", match);
      b.setAttribute("aria-pressed", String(match));
    });
  }

  function updateThemeButtons(val) {
    var shown = renderable(val);
    var buttons = document.querySelectorAll(".a11y-btn[data-theme-choice]");
    Array.prototype.forEach.call(buttons, function (b) {
      var match = b.dataset.themeChoice === shown;
      b.classList.toggle("active", match);
      b.setAttribute("aria-pressed", String(match));
    });
  }

  function setSize(val)  { applySize(val);  write(STORE.size, val);  markActive("size", val); }
  function setFont(val)  { applyFont(val);  write(STORE.font, val);  markActive("font", val); }
  function setTheme(val) { applyTheme(val); write(STORE.theme, val); updateThemeButtons(val); }


  /* ── ACCESSIBILITY PANEL ──────────────────────────────── */

  var trigger = null;
  var panel   = null;

  function panelIsOpen() { return panel && !panel.hasAttribute("hidden"); }

  function openPanel() {
    if (!panel) return;
    panel.removeAttribute("hidden");
    trigger.setAttribute("aria-expanded", "true");
    var first = panel.querySelector("button");
    if (first) first.focus();
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
  }

  function closePanel(returnFocus) {
    if (!panel) return;
    panel.setAttribute("hidden", "");
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    if (returnFocus) trigger.focus();
  }

  function togglePanel() {
    if (panelIsOpen()) closePanel(true); else openPanel();
  }

  function onKeydown(e) {
    if (e.key === "Escape") { e.preventDefault(); closePanel(true); return; }
    if (e.key !== "Tab") return;
    var focusables = panel.querySelectorAll("button");
    if (!focusables.length) return;
    var first = focusables[0];
    var last  = focusables[focusables.length - 1];
    if (!e.shiftKey && document.activeElement === last) closePanel(false);
    if (e.shiftKey  && document.activeElement === first) closePanel(true);
  }

  function onPointerDown(e) {
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    closePanel(false);
  }


  /* ── BOOT ─────────────────────────────────────────────── */

  function init() {
    var year = document.getElementById("yr");
    if (year) year.textContent = String(new Date().getFullYear());

    trigger = document.getElementById("a11y-trigger");
    panel   = document.getElementById("a11y-panel");

    if (trigger && panel) {
      trigger.addEventListener("click", togglePanel);
      panel.addEventListener("click", function (e) {
        var btn = e.target.closest(".a11y-btn");
        if (!btn) return;
        if (btn.dataset.size) setSize(btn.dataset.size);
        else if (btn.dataset.font) setFont(btn.dataset.font);
        else if (btn.dataset.themeChoice) setTheme(btn.dataset.themeChoice);
      });
    }

    /* The size scale was renamed to match the vocabulary every guide already
       used, so one choice now carries across the whole network. Anyone holding a
       value from the old scale is migrated rather than silently reset. */
    var LEGACY_SIZE = { "default": "small", "large": "medium", "larger": "large" };
    var stored = read(STORE.size, DEFAULTS.size);
    if (LEGACY_SIZE.hasOwnProperty(stored) && ["small","medium","large"].indexOf(stored) === -1) {
      stored = LEGACY_SIZE[stored];
      write(STORE.size, stored);
    }

    var size  = stored;
    var font  = read(STORE.font,  DEFAULTS.font);
    var theme = read(STORE.theme, DEFAULTS.theme);

    applySize(size); applyFont(font); applyTheme(theme);
    markActive("size", size);
    markActive("font", font);
    updateThemeButtons(theme);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();


  /* ── HELPERS ──────────────────────────────────────────── */

  window.Lyceum = {
    escHtml: function (str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    slug: function (str) {
      return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    },

    /* A CSV cell written with line breaks, rendered as the prose it is.
       A blank line starts a new paragraph; a single line break inside a
       paragraph stays a line break. Everything is escaped first, so the
       only markup that reaches the page is the markup this function
       makes — a description can contain angle brackets and be safe.
       Returns "" for empty input, so callers can test it as a condition. */
    paragraphs: function (text) {
      var esc = window.Lyceum.escHtml;
      var paras = String(text == null ? "" : text)
        .replace(/\r\n?/g, "\n")
        .trim()
        .split(/\n[ \t]*\n+/);
      var html = paras.map(function (p) {
        p = p.trim();
        if (!p) return "";
        return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>";
      }).join("");
      return html;
    },

    pipeList: function (cell) {
      return String(cell || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean);
    },

    debounce: function (fn, wait) {
      var t = null;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, wait);
      };
    },

    externalArrow:
      '<svg class="card-arrow" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">' +
        '<line x1="3" y1="15" x2="15" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
        '<polyline points="7,3 15,3 15,11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' +
      "</svg>",

    newTabNote: '<span class="visually-hidden"> (opens in a new tab)</span>'
  };
})();
