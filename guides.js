/* LIBRARY LYCEUM: RESEARCH GUIDE DIRECTORY
   Requires vendor-papaparse.js, vendor-fuse.js, subjects.js, lyceum.js. */

(function () {
  "use strict";

  var EMPTY_COLLECTION_HTML =
    '<div class="empty-state">' +
      "<p>The guide gallery is under construction! In the interim, " +
      '<a href="mailto:sthompson@westex.org">email Mr. Thompson</a> ' +
      "if you need help with a specific assignment.</p>" +
    "</div>";

  var esc      = window.Lyceum.escHtml;
  var ARROW    = window.Lyceum.externalArrow;
  var NEWTAB   = window.Lyceum.newTabNote;
  var pipeList = window.Lyceum.pipeList;
  var debounce = window.Lyceum.debounce;

  var SUBJECTS      = window.SUBJECTS;
  var SUBJECT_DESCS = window.SUBJECT_DESCS;

  var allGuides     = [];
  var guideFuse     = null;
  var activeSubject = "All";
  var searchQuery   = "";


  /* ── URL STATE ────────────────────────────────────────── */

  function readStateFromUrl() {
    var p = new URLSearchParams(window.location.search);
    var f = p.get("filter");
    activeSubject = (f && SUBJECTS.indexOf(f) !== -1) ? f : "All";
    searchQuery   = p.get("q") || "";
  }

  function writeStateToUrl(push) {
    var p = new URLSearchParams();
    if (activeSubject !== "All") p.set("filter", activeSubject);
    if (searchQuery) p.set("q", searchQuery);
    var qs = p.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "");
    if (push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }


  /* ── FILTER CONTROLS ──────────────────────────────────── */

  function buildFilterControls() {
    var bar = document.getElementById("filter-bar");
    var sel = document.getElementById("filter-select");
    bar.innerHTML = "";
    sel.innerHTML = "";

    var present = SUBJECTS.filter(function (s) {
      return allGuides.some(function (g) { return g.subjects.indexOf(s) !== -1; });
    });

    function addButton(value, label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.dataset.subject = value;
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = label;
      btn.addEventListener("click", function () { setFilter(value); });
      bar.appendChild(btn);

      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      sel.appendChild(opt);
    }

    addButton("All", "All Guides");
    present.forEach(function (s) { addButton(s, s); });

    sel.addEventListener("change", function () { setFilter(this.value); });

    document.getElementById("controls").hidden = (allGuides.length === 0);
  }

  function syncFilterControls() {
    var buttons = document.querySelectorAll(".filter-btn");
    Array.prototype.forEach.call(buttons, function (b) {
      var match = b.dataset.subject === activeSubject;
      b.classList.toggle("active", match);
      b.setAttribute("aria-pressed", String(match));
    });

    var sel = document.getElementById("filter-select");
    if (sel) sel.value = activeSubject;

    var panel = document.getElementById("subject-desc-panel");
    if (activeSubject !== "All" && SUBJECT_DESCS[activeSubject]) {
      panel.textContent = SUBJECT_DESCS[activeSubject];
      panel.classList.add("visible");
    } else {
      panel.textContent = "";
      panel.classList.remove("visible");
    }

    var filtering = (activeSubject !== "All" || searchQuery.length > 0);
    document.getElementById("state-wrap").style.display = filtering ? "flex" : "none";
  }

  function setFilter(subject) {
    activeSubject = subject;
    writeStateToUrl(true);
    syncFilterControls();
    render();
  }

  function clearAll() {
    activeSubject = "All";
    searchQuery = "";
    document.getElementById("search-input").value = "";
    writeStateToUrl(true);
    syncFilterControls();
    render();
    document.getElementById("search-input").focus();
  }


  /* ── RENDERING ────────────────────────────────────────── */

  function cardHtml(g) {
    var tags = g.subjects.map(function (s) {
      return '<span class="guide-tag">' + esc(s) + "</span>";
    }).join("");

    return '<a class="guide-card" href="' + esc(g.url) + '" target="_blank" rel="noopener noreferrer">' +
      (g.series ? '<span class="guide-series-badge">' + esc(g.series) + "</span>" : "") +
      '<div class="guide-card-header">' +
        '<span class="guide-title">' + esc(g.title) + NEWTAB + "</span>" +
        ARROW +
      "</div>" +
      (g.course ? '<p class="guide-course">' + esc(g.course) + "</p>" : "") +
      (g.desc ? '<p class="guide-desc">' + esc(g.desc) + "</p>" : "") +
      (tags ? '<div class="guide-tags">' + tags + "</div>" : "") +
    "</a>";
  }

  function render() {
    var grid = document.getElementById("guide-grid");
    var meta = document.getElementById("results-meta");

    if (allGuides.length === 0) {
      meta.textContent = "";
      grid.innerHTML = EMPTY_COLLECTION_HTML;
      return;
    }

    var results = allGuides;
    if (searchQuery.length >= 2 && guideFuse) {
      results = guideFuse.search(searchQuery).map(function (r) { return r.item; });
    }
    if (activeSubject !== "All") {
      results = results.filter(function (g) { return g.subjects.indexOf(activeSubject) !== -1; });
    }

    var total = allGuides.length;
    meta.innerHTML = (searchQuery || activeSubject !== "All")
      ? "Showing <strong>" + results.length + "</strong> of " + total + " guides"
      : total + " guide" + (total === 1 ? "" : "s") + " in the collection";

    if (results.length === 0) {
      grid.innerHTML =
        '<div class="empty-state"><p>Nothing matched that search. Try different keywords, or clear the filter and browse the full collection.</p></div>';
      return;
    }

    grid.innerHTML = results.map(cardHtml).join("");
  }


  /* ── LOAD ─────────────────────────────────────────────── */

  function boot() {
    readStateFromUrl();

    var input = document.getElementById("search-input");
    input.value = searchQuery;
    input.addEventListener("input", debounce(function () {
      searchQuery = this.value.trim();
      writeStateToUrl(false);
      syncFilterControls();
      render();
    }, 150));

    document.getElementById("clear-btn").addEventListener("click", clearAll);

    window.addEventListener("popstate", function () {
      readStateFromUrl();
      document.getElementById("search-input").value = searchQuery;
      syncFilterControls();
      render();
    });

    Papa.parse("data/guides.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        var seen = {};
        allGuides = results.data.map(function (row) {
          return {
            title:    (row.Title       || "").trim(),
            url:      (row.URL         || "").trim(),
            desc:     (row.Description || "").trim(),
            course:   (row.Course      || "").trim(),
            subjects: pipeList(row.Subjects),
            series:   (row.Series      || "").trim()
          };
        }).filter(function (g) {
          if (!g.title || !g.url) return false;
          var key = g.title.toLowerCase();
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });

        allGuides.sort(function (a, b) { return a.title.localeCompare(b.title); });

        guideFuse = new Fuse(allGuides, {
          keys: [
            { name: "title",    weight: 3 },
            { name: "course",   weight: 2 },
            { name: "desc",     weight: 1 },
            { name: "series",   weight: 1 },
            { name: "subjects", weight: 1 }
          ],
          /* 0.20, tightened from 0.35. Measured against exact-substring ground
             truth over ten queries: mean precision rose 0.42 -> 0.85 with recall
             unchanged at 1.00, so the looser setting was adding only noise. */
          threshold: 0.20,
          ignoreLocation: true
        });

        buildFilterControls();
        syncFilterControls();
        render();
      },
      error: function () {
        document.getElementById("guide-grid").innerHTML =
          '<div class="empty-state"><p>Could not load data/guides.csv.</p></div>';
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
