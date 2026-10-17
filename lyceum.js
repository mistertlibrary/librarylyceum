
(function () {
  "use strict";

  var SELF_SRC = document.currentScript ? document.currentScript.src : "";

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



  var root = document.documentElement;

  function applySize(val) {
    if (val === "small") delete root.dataset.size;
    else root.dataset.size = val;
  }

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
    var focusables = Array.prototype.filter.call(panel.querySelectorAll("button"), function (b) {
      return !b.closest("[hidden]");
    });
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



  function loadShelve(done) {
    if (window.LyceumShelve) { done(); return; }
    var src = SELF_SRC ? SELF_SRC.replace(/lyceum\.js(\?.*)?$/, "shelve.js") : "shelve.js";
    var tag = document.createElement("script");
    tag.src = src;
    tag.onload = function () { if (window.LyceumShelve) done(); };
    document.head.appendChild(tag);
  }

  function initSecret() {
    var title  = document.getElementById("a11y-panel-title");
    var secret = document.getElementById("a11y-secret");
    var play   = document.getElementById("a11y-play");
    if (!title || !secret || !play) return;

    var clicks = 0, last = 0;
    title.addEventListener("click", function () {
      var now = Date.now();
      clicks = now - last < 600 ? clicks + 1 : 1;
      last = now;
      if (clicks < 3 || !secret.hasAttribute("hidden")) return;
      secret.removeAttribute("hidden");
      play.focus();
    });

    play.addEventListener("click", function () {
      loadShelve(function () {
        var on = window.LyceumShelve.toggle();
        play.classList.toggle("active", on);
        play.setAttribute("aria-pressed", String(on));
      });
    });
  }

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
      initSecret();
    }

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
(function(){if(window.__lyx)return;window.__lyx=2;
var css=".lyx{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:4vmin;background:rgba(8,10,12,.94);cursor:zoom-out;overflow:auto}.lyx[hidden]{display:none}.lyx>img{max-width:100%;max-height:calc(100vh - 8vmin - 4.5rem);object-fit:contain;background:#fff}.lyx .lyx-c{width:min(100%,80rem);max-height:calc(100vh - 8vmin - 4.5rem);overflow:auto;font-size:clamp(1rem,1.9vw,1.9rem)}.lyx .lyx-c>*{margin:0!important;max-width:none!important;width:100%!important;cursor:zoom-out}.lyx .lyx-c svg,.lyx .lyx-c video,.lyx .lyx-c img{display:block;width:100%!important;max-width:none!important;height:auto!important;max-height:calc(100vh - 12vmin - 4.5rem)!important;margin:0 auto}.lyx .lyx-c .lyx-pad{background:#fff;color:#111;padding:2rem}.lyx .lyx-cap{color:#f1f1f1;font:15px/1.45 system-ui,sans-serif;max-width:60ch;text-align:center;margin:0}.lyx .lyx-x{position:absolute;top:12px;right:14px;font:700 13px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:transparent;border:2px solid #fff;padding:6px 12px;cursor:pointer;z-index:1}.lyx .lyx-x:focus-visible{outline:3px solid #ffd54a;outline-offset:2px}.lyz{cursor:zoom-in}.lyz:focus-visible{outline:3px solid #ffd54a;outline-offset:3px}@media print{.lyx{display:none!important}}";
var st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
var box=document.createElement("div");box.className="lyx";box.hidden=true;box.setAttribute("role","dialog");box.setAttribute("aria-modal","true");box.setAttribute("aria-label","Full-size view");
box.innerHTML='<button type="button" class="lyx-x">Close</button><img alt="" hidden><div class="lyx-c" hidden></div><p class="lyx-cap"></p>';
var big=box.querySelector("img"),cl=box.querySelector(".lyx-c"),cap=box.querySelector(".lyx-cap"),last=null;
function ready(f){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",f):f()}
ready(function(){document.body.appendChild(box);mark(document)});
var IMG=/\.(jpe?g|png|gif|webp|avif|svg)([?#].*)?$/i,SKIP=".lyx,header,[role=banner],nav,.hero,.no-lightbox,.shot-btn,#lightbox,.lightbox,button,label";
function okImg(im){if(im.closest(SKIP))return false;if(im.getAttribute("alt")===""&&!im.hasAttribute("data-full"))return false;if(im.id==="lightbox-img"||im.id==="img-preview")return false;var a=im.closest("a[href]");if(a&&!IMG.test(a.getAttribute("href")))return false;return true}
function okDraw(el){if(el.closest(SKIP)||el.closest("a[href]")||el.closest(".lyz")&&el.closest(".lyz")!==el)return false;if(el.hasAttribute("data-lyx"))return true;if(el.matches("figure"))return !el.querySelector("img,input,textarea,select,button");if(el.matches("svg")){if(el.getAttribute("aria-hidden")==="true"||el.closest("figure,[data-lyx],h1,h2,h3,h4,h5,h6,.title"))return false;if(/crest|logo/i.test((el.getAttribute("aria-label")||"")+((el.querySelector("title")||{}).textContent||"")))return false;var v=(el.getAttribute("viewBox")||"").split(/[\s,]+/);return +v[2]>=150}return false}
function tag(el,label){el.classList.add("lyz");if(!el.closest("a,button")){el.tabIndex=0;el.setAttribute("role","button");el.setAttribute("aria-label",label)}}
function mark(root){root=root.querySelectorAll?root:document;
root.querySelectorAll("img").forEach(function(im){if(!im.classList.contains("lyz")&&okImg(im))tag(im,(im.alt?im.alt+". ":"")+"Open full size")});
root.querySelectorAll("[data-lyx],figure,svg[role=img]").forEach(function(el){if(el.classList.contains("lyz")||!okDraw(el))return;if(el.matches("figure")&&!el.querySelector("svg,[role=img]"))return;var l=el.getAttribute("aria-label")||(el.querySelector("[aria-label]")||{getAttribute:function(){return""}}).getAttribute("aria-label")||(el.querySelector("title")||{}).textContent||"";if(!el.matches("[role=img],svg")||el.hasAttribute("data-lyx"))tag(el,(l?l+". ":"")+"Open full size");else{el.classList.add("lyz");el.tabIndex=0;el.setAttribute("data-lyx-svg","")}})}
if(window.MutationObserver)new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1&&!box.contains(n))mark(n.tagName==="IMG"?n.parentNode:n)})})}).observe(document.documentElement,{childList:true,subtree:true});
function show(){box.hidden=false;document.documentElement.style.overflow="hidden";box.querySelector(".lyx-x").focus()}
function open(el){last=el;cap.textContent="";cl.innerHTML="";cl.hidden=true;big.hidden=true;
if(el.tagName==="IMG"){var a=el.closest("a[href]");big.src=el.getAttribute("data-full")||(a&&IMG.test(a.getAttribute("href"))?a.href:(el.currentSrc||el.src));big.alt=el.alt||"";big.hidden=false;var f=el.closest("figure"),c=f&&f.querySelector("figcaption");cap.textContent=c?c.textContent.trim():""}
else{var k=el.cloneNode(true);k.classList.remove("lyz");k.removeAttribute("tabindex");k.removeAttribute("role");k.removeAttribute("aria-label");k.querySelectorAll("[id]").forEach(function(x){x.removeAttribute("id")});k.removeAttribute("id");var bg=getComputedStyle(el).backgroundColor;if(!bg||bg==="rgba(0, 0, 0, 0)"||bg==="transparent"){var w=document.createElement("div");w.className="lyx-pad";w.style.background=getComputedStyle(document.body).backgroundColor||"#fff";w.style.color=getComputedStyle(el).color;w.appendChild(k);k=w}cl.appendChild(k);cl.hidden=false}
cap.hidden=!cap.textContent;show()}
function close(){box.hidden=true;big.removeAttribute("src");cl.innerHTML="";document.documentElement.style.overflow="";if(last&&last.focus)last.focus()}
document.addEventListener("click",function(e){if(!box.hidden){if(box.contains(e.target)&&!(e.target.closest&&e.target.closest("a[href]")))close();return}var el=e.target.closest&&e.target.closest(".lyz");if(!el)return;var ctl=e.target.closest("button,input,textarea,select,summary"),lk=e.target.closest("a[href]");if(ctl&&ctl!==el&&el.contains(ctl))return;if(lk&&!IMG.test(lk.getAttribute("href"))&&lk!==el)return;e.preventDefault();e.stopPropagation();open(el)},true);
document.addEventListener("keydown",function(e){if(!box.hidden){if(e.key==="Escape"){e.preventDefault();close()}else if(e.key==="Tab"){e.preventDefault();box.querySelector(".lyx-x").focus()}return}var el=e.target.classList&&e.target.classList.contains("lyz")?e.target:null;if(el&&(e.key==="Enter"||e.key===" ")){e.preventDefault();open(el)}});
})();
