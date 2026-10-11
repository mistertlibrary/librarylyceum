(function () {
  "use strict";

  if (window.LyceumShelve) return;

  var COLORS = ["#C52122", "#2F1414", "#D9A441", "#2E6E6A", "#26385C", "#7A3B69", "#E07A3F", "#4F7A3A"];
  var MAX_SHELVES = 3;
  var SKIP = "a, button, input, select, textarea, label, summary, [role='button'], [contenteditable], #a11y-panel, #a11y-trigger";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;
  var root = document.documentElement;

  var CSS = [
    "html.lyceum-shelving.lyceum-shelving-fine, html.lyceum-shelving.lyceum-shelving-fine * { cursor: none !important; }",
    ".lyc-shelves { position: fixed; left: 0; right: 0; bottom: 0; z-index: 150; display: flex; flex-direction: column-reverse; padding: 10px 92px 0 1rem; pointer-events: none; background: linear-gradient(#EAD8BB, #DCC29C); border-top: 3px solid #5E3B20; box-shadow: 0 -4px 14px rgba(0,0,0,.18); }",
    ".lyc-shelf { height: 64px; display: flex; align-items: flex-end; gap: 2px; padding: 0 8px; border-bottom: 10px solid #8A5A34; box-shadow: 0 5px 0 #5E3B20; margin-bottom: 5px; }",
    ".lyc-spine { position: relative; flex: 0 0 auto; border-radius: 2px 2px 1px 1px; transform-origin: 50% 100%; box-shadow: inset -3px 0 0 rgba(0,0,0,.18), inset 2px 0 0 rgba(255,255,255,.18); }",
    ".lyc-spine::before, .lyc-spine::after { content: ''; position: absolute; left: 2px; right: 2px; height: 2px; background: rgba(255,255,255,.55); }",
    ".lyc-spine::before { top: 18%; } .lyc-spine::after { bottom: 18%; }",
    ".lyc-spine.lyc-hidden { visibility: hidden; }",
    ".lyc-spine.lyc-hop { animation: lycHop .55s ease-out; }",
    ".lyc-spine.lyc-lean { animation: lycLean 1.4s ease-in-out; }",
    "@keyframes lycHop { 0% { transform: translateY(0) scaleY(1); } 15% { transform: translateY(0) scaleY(.88); } 45% { transform: translateY(-20px) scaleY(1.04); } 75% { transform: translateY(0) scaleY(.94); } 100% { transform: translateY(0) scaleY(1); } }",
    "@keyframes lycLean { 0%, 100% { transform: rotate(0); } 30%, 70% { transform: rotate(-9deg); } }",
    ".lyc-flyer { position: fixed; left: 0; top: 0; z-index: 160; pointer-events: none; }",
    ".lyc-cursor { position: fixed; left: 0; top: 0; width: 46px; height: 38px; z-index: 300; pointer-events: none; will-change: transform; }",
    ".lyc-cursor .lyc-page { transform-origin: 23px 50%; animation: lycFlip 1.1s ease-in-out infinite; }",
    ".lyc-cursor.lyc-pressed svg { transform: scale(.86); }",
    "@keyframes lycFlip { 0% { transform: scaleX(1); } 50% { transform: scaleX(-1); } 100% { transform: scaleX(1); } }",
    "@media (prefers-reduced-motion: reduce) { .lyc-cursor .lyc-page, .lyc-spine.lyc-hop, .lyc-spine.lyc-lean { animation: none; } }",
    ".lyc-pointer { position: fixed; left: 1rem; z-index: 170; font: 600 0.62rem/1.2 var(--sans, system-ui, sans-serif); letter-spacing: 0.1em; text-transform: uppercase; color: #F3E7D2; background: #2F1414; border: 1px solid #C9A84C; padding: 0.45rem 0.7rem; cursor: pointer; }",
    ".lyc-pointer:focus-visible { outline: 3px solid #C9A84C; outline-offset: 2px; }",
    "html.lyceum-shelving.lyceum-shelving-fine .lyc-pointer { cursor: none !important; }",
    "@media print { .lyc-shelves, .lyc-cursor, .lyc-pointer { display: none !important; } }"
  ].join("\n");

  var BOOK_SVG =
    '<svg viewBox="0 0 46 38" width="46" height="38" aria-hidden="true">' +
    '<path d="M23 8 C16 3 7 3 2 5 L2 33 C7 31 16 31 23 36 Z" fill="#C52122" stroke="#2F1414" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M23 8 C30 3 39 3 44 5 L44 33 C39 31 30 31 23 36 Z" fill="#C52122" stroke="#2F1414" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M23 9 C17 5 9 5 5 6.5 L5 31 C9 29.5 17 30 23 34 Z" fill="#FFFFFF" stroke="#2F1414" stroke-width="1.2"/>' +
    '<path d="M23 9 C29 5 37 5 41 6.5 L41 31 C37 29.5 29 30 23 34 Z" fill="#FFFFFF" stroke="#2F1414" stroke-width="1.2"/>' +
    '<path class="lyc-page" d="M23 9 C29 6 35 6 39 7.5 L39 30 C35 29 29 30 23 33 Z" fill="#FBF5EA" stroke="#2F1414" stroke-width="1"/>' +
    '<path d="M9 12 H18 M9 16 H18 M9 20 H17 M28 12 H37 M28 16 H37" stroke="#2F1414" stroke-width="1" opacity=".35"/>' +
    '</svg>';

  var active = false;
  var styleEl = null, cursorEl = null, shelvesEl = null, pointerBtn = null;
  var POINTER_KEY = "lyceum-book-cursor";

  function bookCursorWanted() {
    try { return localStorage.getItem(POINTER_KEY) !== "off"; } catch (e) { return true; }
  }

  function setBookCursor(on) {
    root.classList.toggle("lyceum-shelving-fine", on);
    if (cursorEl) cursorEl.style.display = on ? "" : "none";
    if (pointerBtn) {
      pointerBtn.setAttribute("aria-pressed", String(on));
      pointerBtn.textContent = on ? "Book cursor: On" : "Book cursor: Off";
    }
    try { localStorage.setItem(POINTER_KEY, on ? "on" : "off"); } catch (e) {}
  }
  var shelves = [], books = [];
  var idleTimer = null, savedPadding = "";

  function rand(a, b) { return a + Math.random() * (b - a); }

  function syncPadding() {
    if (!shelvesEl) return;
    document.body.style.paddingBottom = shelvesEl.offsetHeight + "px";
    if (pointerBtn) pointerBtn.style.bottom = (shelvesEl.offsetHeight + 8) + "px";
  }

  function newShelf() {
    var s = document.createElement("div");
    s.className = "lyc-shelf";
    shelvesEl.appendChild(s);
    shelves.push(s);
    syncPadding();
    return s;
  }

  function room(s, width) {
    var used = 0;
    for (var i = 0; i < s.children.length; i++) used += s.children[i].offsetWidth + 2;
    return used + width + 18 <= s.clientWidth;
  }

  function shelfFor(width) {
    for (var i = 0; i < shelves.length; i++) if (room(shelves[i], width)) return shelves[i];
    if (shelves.length < MAX_SHELVES) return newShelf();
    var old = books.shift();
    var home = old.parentNode;
    old.remove();
    return home;
  }

  function makeSpine() {
    var el = document.createElement("div");
    el.className = "lyc-spine";
    el.style.width = Math.round(rand(12, 20)) + "px";
    el.style.height = Math.round(rand(36, 56)) + "px";
    el.style.background = COLORS[Math.floor(Math.random() * COLORS.length)];
    return el;
  }

  function shelve(x, y) {
    var spine = makeSpine();
    var w = parseInt(spine.style.width, 10);
    var shelf = shelfFor(w);
    spine.classList.add("lyc-hidden");
    shelf.appendChild(spine);
    books.push(spine);

    if (reduce || !spine.animate) { spine.classList.remove("lyc-hidden"); return; }

    var r = spine.getBoundingClientRect();
    var fly = spine.cloneNode(false);
    fly.className = "lyc-spine lyc-flyer";
    document.body.appendChild(fly);
    var sx = x - w / 2, sy = y - r.height / 2;
    var tx = r.left, ty = r.top;
    var peak = Math.min(sy, ty) - rand(80, 160);
    var spin = (Math.random() < 0.5 ? -1 : 1) * 360 * Math.round(rand(1, 2));
    var frames = [];
    for (var i = 0; i <= 12; i++) {
      var t = i / 12;
      var px = sx + (tx - sx) * t;
      var py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * peak + t * t * ty;
      frames.push({ transform: "translate(" + px + "px," + py + "px) rotate(" + (spin * (1 - t)) + "deg) scale(" + (0.6 + 0.4 * t) + ")" });
    }
    var anim = fly.animate(frames, { duration: Math.min(1300, 600 + Math.abs(ty - sy) * 0.6), easing: "cubic-bezier(.3,.1,.5,1)", fill: "forwards" });
    anim.onfinish = function () {
      fly.remove();
      spine.classList.remove("lyc-hidden");
      spine.classList.add("lyc-hop");
      setTimeout(function () { spine.classList.remove("lyc-hop"); }, 600);
    };
  }

  function onMove(e) {
    if (e.pointerType !== "mouse" || !cursorEl) return;
    cursorEl.style.transform = "translate(" + (e.clientX - 6) + "px," + (e.clientY - 4) + "px)";
  }

  function onDown(e) {
    if (cursorEl) cursorEl.classList.add("lyc-pressed");
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    shelve(e.clientX, e.clientY);
  }

  function onUp() { if (cursorEl) cursorEl.classList.remove("lyc-pressed"); }

  function idle() {
    if (!books.length || document.hidden) return;
    var b = books[Math.floor(Math.random() * books.length)];
    if (b.classList.contains("lyc-hidden") || b.classList.contains("lyc-hop") || b.classList.contains("lyc-lean")) return;
    var cls = Math.random() < 0.7 ? "lyc-hop" : "lyc-lean";
    b.classList.add(cls);
    setTimeout(function () { b.classList.remove(cls); }, cls === "lyc-hop" ? 600 : 1450);
  }

  function on() {
    if (active) return;
    active = true;
    styleEl = document.createElement("style");
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
    root.classList.add("lyceum-shelving");
    if (fine) {
      cursorEl = document.createElement("div");
      cursorEl.className = "lyc-cursor";
      cursorEl.innerHTML = BOOK_SVG;
      cursorEl.style.transform = "translate(-100px,-100px)";
      document.body.appendChild(cursorEl);
      pointerBtn = document.createElement("button");
      pointerBtn.type = "button";
      pointerBtn.className = "lyc-pointer";
      pointerBtn.addEventListener("click", function () {
        setBookCursor(pointerBtn.getAttribute("aria-pressed") !== "true");
      });
      document.body.appendChild(pointerBtn);
    }
    shelvesEl = document.createElement("div");
    shelvesEl.className = "lyc-shelves";
    shelvesEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(shelvesEl);
    savedPadding = document.body.style.paddingBottom;
    newShelf();
    if (fine) setBookCursor(bookCursorWanted());
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    window.addEventListener("resize", syncPadding);
    if (!reduce) idleTimer = setInterval(idle, 700);
  }

  function off() {
    if (!active) return;
    active = false;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerdown", onDown);
    document.removeEventListener("pointerup", onUp);
    window.removeEventListener("resize", syncPadding);
    clearInterval(idleTimer);
    Array.prototype.forEach.call(document.querySelectorAll(".lyc-flyer"), function (f) { f.remove(); });
    if (cursorEl) cursorEl.remove();
    if (pointerBtn) pointerBtn.remove();
    if (shelvesEl) shelvesEl.remove();
    if (styleEl) styleEl.remove();
    cursorEl = shelvesEl = styleEl = pointerBtn = null;
    shelves = []; books = [];
    root.classList.remove("lyceum-shelving", "lyceum-shelving-fine");
    document.body.style.paddingBottom = savedPadding;
  }

  window.LyceumShelve = {
    on: on,
    off: off,
    toggle: function () { if (active) off(); else on(); return active; },
    isActive: function () { return active; }
  };
})();
