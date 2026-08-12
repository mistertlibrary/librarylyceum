/* LIBRARY LYCEUM: DATABASE DIRECTORY
   Requires vendor-papaparse.js, vendor-fuse.js, subjects.js, lyceum.js. */

(function () {
  "use strict";

  var DEFAULT_VIEW = "az";

  var esc      = window.Lyceum.escHtml;
  var slug     = window.Lyceum.slug;
  var pipeList = window.Lyceum.pipeList;
  var debounce = window.Lyceum.debounce;
  var ARROW    = window.Lyceum.externalArrow;
  var NEWTAB   = window.Lyceum.newTabNote;

  var SUBJECTS      = window.SUBJECTS;
  var SUBJECT_DESCS = window.SUBJECT_DESCS;

  var allDatabases  = [];
  var dbFuse        = null;
  var activeSubject = "All";
  var searchQuery   = "";
  var activeView    = DEFAULT_VIEW;


  /* ── URL STATE ────────────────────────────────────────── */

  function readStateFromUrl() {
    var p = new URLSearchParams(window.location.search);
    var f = p.get("filter");
    activeSubject = (f && SUBJECTS.indexOf(f) !== -1) ? f : "All";
    searchQuery   = p.get("q") || "";
    var v = p.get("view");
    activeView    = (v === "grouped" || v === "az") ? v : DEFAULT_VIEW;
  }

  function writeStateToUrl(push) {
    var p = new URLSearchParams();
    if (activeSubject !== "All") p.set("filter", activeSubject);
    if (searchQuery) p.set("q", searchQuery);
    if (activeView !== DEFAULT_VIEW) p.set("view", activeView);
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
      return allDatabases.some(function (d) { return d.subjects.indexOf(s) !== -1; });
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

    addButton("All", "All");
    present.forEach(function (s) { addButton(s, s); });

    sel.addEventListener("change", function () { setFilter(this.value); });
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
  }


  /* ── TOOLBAR ──────────────────────────────────────────── */

  function effectiveView() {
    if (searchQuery.length >= 2) return "az";
    if (activeSubject !== "All") return "az";
    return activeView;
  }

  function syncToolbar() {
    var view = effectiveView();
    var az = document.getElementById("view-az");
    var gr = document.getElementById("view-grouped");
    var groupingAvailable = (activeSubject === "All" && searchQuery.length < 2);

    az.classList.toggle("active", view === "az");
    gr.classList.toggle("active", view === "grouped");
    az.setAttribute("aria-pressed", String(view === "az"));
    gr.setAttribute("aria-pressed", String(view === "grouped"));
    gr.disabled = !groupingAvailable;
    gr.title = groupingAvailable ? "" : "Available when browsing all subjects without a search";

    var filtering = (activeSubject !== "All" || searchQuery.length > 0);
    document.getElementById("state-wrap").style.display = filtering ? "flex" : "none";
    document.getElementById("state-sep").style.display  = filtering ? "block" : "none";
  }

  function setFilter(subject) {
    activeSubject = subject;
    writeStateToUrl(true);
    syncFilterControls();
    syncToolbar();
    render();
  }

  function setView(view) {
    activeView = view;
    writeStateToUrl(true);
    syncToolbar();
    render();
  }

  function clearAll() {
    activeSubject = "All";
    searchQuery = "";
    document.getElementById("search-input").value = "";
    writeStateToUrl(true);
    syncFilterControls();
    syncToolbar();
    render();
    document.getElementById("search-input").focus();
  }

  function copyLink() {
    var url = window.location.href;
    var btn = document.getElementById("copy-btn");
    function confirmCopy() {
      btn.textContent = "Link copied!";
      btn.classList.add("copied");
      setTimeout(function () {
        btn.textContent = "Copy link to this view";
        btn.classList.remove("copied");
      }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(confirmCopy, function () { prompt("Copy this link:", url); });
    } else {
      prompt("Copy this link:", url);
    }
  }


  /* ── RENDERING ────────────────────────────────────────── */

  function cardHtml(db) {
    var tags = db.subjects.map(function (s) {
      return '<span class="db-tag">' + esc(s) + "</span>";
    }).join("");

    return '<article class="db-card">' +
      '<div class="db-card-header">' +
        '<a class="db-card-name" href="' + esc(db.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(db.name) + NEWTAB +
        "</a>" +
        ARROW +
      "</div>" +
      '<p class="db-card-desc">' + esc(db.desc) + "</p>" +
      (tags ? '<div class="db-card-tags">' + tags + "</div>" : "") +
      "</article>";
  }

  function matchingResults() {
    var results = allDatabases;
    if (searchQuery.length >= 2 && dbFuse) {
      results = dbFuse.search(searchQuery).map(function (r) { return r.item; });
    }
    if (activeSubject !== "All") {
      results = results.filter(function (d) { return d.subjects.indexOf(activeSubject) !== -1; });
    }
    return results;
  }

  function groupFor(results, subject) {
    var group = results.filter(function (d) { return d.subjects.indexOf(subject) !== -1; });
    var pinned = group.filter(function (d) { return d.primary === subject; });
    var rest   = group.filter(function (d) { return d.primary !== subject; });
    return pinned.concat(rest);
  }

  function measureIndex() {
    var index = document.getElementById("subject-index");
    var h = index.hidden ? 0 : index.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--index-height", Math.round(h) + "px");
  }

  function render() {
    var grid  = document.getElementById("db-grid");
    var meta  = document.getElementById("results-meta");
    var index = document.getElementById("subject-index");
    var results = matchingResults();
    var view = effectiveView();

    var total = allDatabases.length;
    var shown = results.length;

    meta.innerHTML = (searchQuery || activeSubject !== "All")
      ? "Showing <strong>" + shown + "</strong> of " + total + " databases"
      : total + " databases in the collection";

    if (results.length === 0) {
      index.hidden = true;
      measureIndex();
      grid.className = "";
      grid.innerHTML =
        '<div class="empty-state"><p>Nothing matched that search. Try different keywords, or clear the filter and browse by subject.</p></div>';
      return;
    }

    if (view === "grouped") {
      var html = "";
      var links = "";

      SUBJECTS.forEach(function (subject) {
        var group = groupFor(results, subject);
        if (group.length === 0) return;

        var id = "subject-" + slug(subject);
        links += '<a class="subject-index-link" href="#' + id + '">' + esc(subject) + "</a>";

        html += '<section class="subject-group" id="' + id + '" aria-labelledby="' + id + '-h">' +
          '<h2 class="subject-group-heading" id="' + id + '-h">' + esc(subject) +
            '<span class="subject-group-count">' + group.length + "</span>" +
          "</h2>" +
          '<div class="subject-group-grid">' + group.map(cardHtml).join("") + "</div>" +
        "</section>";
      });

      var orphans = results.filter(function (d) {
        return !d.subjects.some(function (s) { return SUBJECTS.indexOf(s) !== -1; });
      });
      if (orphans.length) {
        html += '<section class="subject-group" id="subject-other" aria-labelledby="subject-other-h">' +
          '<h2 class="subject-group-heading" id="subject-other-h">Other' +
            '<span class="subject-group-count">' + orphans.length + "</span>" +
          "</h2>" +
          '<div class="subject-group-grid">' + orphans.map(cardHtml).join("") + "</div>" +
        "</section>";
        links += '<a class="subject-index-link" href="#subject-other">Other</a>';
      }

      index.innerHTML = links;
      index.hidden = false;
      grid.className = "";
      grid.innerHTML = html;
      measureIndex();
    } else {
      index.hidden = true;
      measureIndex();
      grid.className = "db-grid";
      grid.innerHTML = results.map(cardHtml).join("");
    }
  }


  /* ── LOAD ─────────────────────────────────────────────── */

  function boot() {
    readStateFromUrl();

    var input = document.getElementById("search-input");
    input.value = searchQuery;
    input.addEventListener("input", debounce(function () {
      searchQuery = this.value.trim();
      writeStateToUrl(false);
      syncToolbar();
      render();
    }, 150));

    document.getElementById("view-az").addEventListener("click", function () { setView("az"); });
    document.getElementById("view-grouped").addEventListener("click", function () { setView("grouped"); });
    document.getElementById("clear-btn").addEventListener("click", clearAll);
    document.getElementById("copy-btn").addEventListener("click", copyLink);

    window.addEventListener("resize", debounce(measureIndex, 120));

    window.addEventListener("popstate", function () {
      readStateFromUrl();
      document.getElementById("search-input").value = searchQuery;
      syncFilterControls();
      syncToolbar();
      render();
    });

    Papa.parse("databases.csv", {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        var seen = {};
        allDatabases = results.data.map(function (row) {
          return {
            name:     (row.Name        || "").trim(),
            url:      (row.URL         || "").trim(),
            desc:     (row.Description || "").trim(),
            subjects: pipeList(row.Subjects),
            primary:  (row.Primary     || "").trim()
          };
        }).filter(function (d) {
          if (!d.name || !d.url) return false;
          var key = d.name.toLowerCase();
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });

        allDatabases.sort(function (a, b) { return a.name.localeCompare(b.name); });

        dbFuse = new Fuse(allDatabases, {
          keys: [
            { name: "name",     weight: 3 },
            { name: "desc",     weight: 1 },
            { name: "subjects", weight: 1 }
          ],
          threshold: 0.35,
          ignoreLocation: true
        });

        buildFilterControls();
        syncFilterControls();
        syncToolbar();
        render();
      },
      error: function () {
        document.getElementById("db-grid").innerHTML =
          '<div class="empty-state"><p>Could not load databases.csv.</p></div>';
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
