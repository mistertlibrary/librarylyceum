/* LIBRARY LYCEUM: UNIFIED SEARCH
   Requires vendor-fuse.js and lyceum.js.
   Reads search-index.json, built by build-index.js. */

(function () {
  "use strict";

  var esc      = window.Lyceum.escHtml;
  var debounce = window.Lyceum.debounce;
  var ARROW    = window.Lyceum.externalArrow;
  var NEWTAB   = window.Lyceum.newTabNote;

  /* Guides first. A student searching a topic is best served by the resource
     built for their assignment before the general collection, which is also the
     order the homepage recommends. Databases outnumber guides roughly 25 to 1,
     so ordering by count would bury the bespoke work. */
  var TYPES = [
    { id: "guide",    label: "Research Guides", heading: "Research Guides" },
    { id: "database", label: "Databases",       heading: "Databases" },
    { id: "issue",    label: "Newsletter",      heading: "Newsletter" }
  ];

  var MIN_QUERY = 2;

  var allRecords = [];
  var fuse       = null;
  var searchQuery = "";
  var activeType  = "all";


  /* ── URL STATE ────────────────────────────────────────── */

  function readStateFromUrl() {
    var p = new URLSearchParams(window.location.search);
    searchQuery = p.get("q") || "";
    var t = p.get("type");
    activeType = TYPES.some(function (x) { return x.id === t; }) ? t : "all";
  }

  function writeStateToUrl(push) {
    var p = new URLSearchParams();
    if (searchQuery) p.set("q", searchQuery);
    if (activeType !== "all") p.set("type", activeType);
    var qs = p.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "");
    if (push) history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }


  /* ── CONTROLS ─────────────────────────────────────────── */

  function buildTypeBar() {
    var bar = document.getElementById("type-bar");
    bar.innerHTML = "";

    function addButton(value, label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.dataset.type = value;
      btn.setAttribute("aria-pressed", "false");
      btn.textContent = label;
      btn.addEventListener("click", function () { setType(value); });
      bar.appendChild(btn);
    }

    addButton("all", "Everything");
    TYPES.forEach(function (t) {
      if (allRecords.some(function (r) { return r.type === t.id; })) addButton(t.id, t.label);
    });
  }

  function syncControls() {
    var buttons = document.querySelectorAll(".filter-btn");
    Array.prototype.forEach.call(buttons, function (b) {
      var match = b.dataset.type === activeType;
      b.classList.toggle("active", match);
      b.setAttribute("aria-pressed", String(match));
    });

    var active = searchQuery.length > 0 || activeType !== "all";
    document.getElementById("state-wrap").style.display = active ? "flex" : "none";
  }

  function setType(type) {
    activeType = type;
    writeStateToUrl(true);
    syncControls();
    render();
  }

  function clearAll() {
    searchQuery = "";
    activeType = "all";
    document.getElementById("search-input").value = "";
    writeStateToUrl(true);
    syncControls();
    render();
    document.getElementById("search-input").focus();
  }

  function copyLink() {
    var url = window.location.href;
    var btn = document.getElementById("copy-btn");
    function done() {
      btn.textContent = "Link copied!";
      btn.classList.add("copied");
      setTimeout(function () {
        btn.textContent = "Copy link to this search";
        btn.classList.remove("copied");
      }, 2000);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); });
    } else {
      prompt("Copy this link:", url);
    }
  }


  /* ── RENDERING ────────────────────────────────────────── */

  function contextLine(r) {
    var bits = [];
    if (r.type === "guide") {
      if (r.series) bits.push(r.series);
      if (r.course) bits.push(r.course);
    } else if (r.type === "database") {
      if (r.primary) bits.push(r.primary);
    } else if (r.type === "issue") {
      if (r.number) bits.push("Issue " + r.number);
      if (r.date) bits.push(longDate(r.date));
      if (r.audience && r.audience !== "both") {
        bits.push(r.audience === "students" ? "For students" : "For faculty");
      }
    }
    return bits.length ? '<p class="result-context">' + esc(bits.join(" &middot; ")).replace(/&amp;middot;/g, "&middot;") + "</p>" : "";
  }

  /* Parsed as UTC so the date does not slip a day west of the meridian,
     matching the newsletter's own handling. */
  function longDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" });
  }

  function tagsHtml(r) {
    var tags = (r.subjects || []).slice();
    if (r.type === "issue") tags = (r.tags || []).slice();
    if (!tags.length) return "";
    return '<div class="result-meta">' + tags.map(function (s) {
      return '<span class="db-tag">' + esc(s) + "</span>";
    }).join("") + "</div>";
  }

  /* Which of a guide's sections match the current query.
     Sections are not results in their own right — they are ways into the guide
     that contains them — so they render as jump links on the guide's own card
     rather than as sibling rows competing with it. */
  function matchingSections(r) {
    if (!r.sections || !r.sections.length) return [];
    if (searchQuery.length < MIN_QUERY) return [];

    var q = searchQuery.toLowerCase();

    /* Drop connectives before matching. Without this, "style and grammar" also
       lights up "Tables and Figures", because "and" occurs in both. */
    var STOP = ["and", "the", "for", "with", "of", "in", "on", "to", "a", "an", "or", "at", "by"];
    var terms = q.split(/\s+/).filter(function (w) {
      return w.length > 1 && STOP.indexOf(w) === -1;
    });
    if (!terms.length) return [];

    var hits = r.sections.filter(function (s) {
      var hay = (s.title + " " + (s.keywords || []).join(" ")).toLowerCase();
      return terms.some(function (term) { return hay.indexOf(term) !== -1; });
    });

    /* A query that matches the guide itself but no particular section — say the
       guide's title — should offer the whole contents rather than nothing. */
    if (!hits.length && r.title.toLowerCase().indexOf(q) !== -1) return r.sections;
    return hits;
  }

  function sectionsHtml(r) {
    var hits = matchingSections(r);
    if (!hits.length) return "";

    var links = hits.map(function (s) {
      return '<a class="result-section" href="' + esc(r.url + s.anchor) + '"' +
        (r.external ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" +
        esc(s.title) + (r.external ? NEWTAB : "") + "</a>";
    }).join("");

    if (!links) return "";
    return '<div class="result-sections">' + links + "</div>";
  }

  function resultHtml(r) {
    var ext = r.external;
    var attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
    var sections = sectionsHtml(r);

    /* The card is a link, so the section links cannot be nested inside it —
       an anchor inside an anchor is invalid and browsers unnest it. The card
       body is the link; the section row sits outside it, in the same list item. */
    return '<li class="result-item">' +
      '<a class="result' + (sections ? " result-has-sections" : "") + '" href="' +
        esc(r.url) + '"' + attrs + '>' +
        contextLine(r) +
        '<div class="result-head">' +
          '<span class="result-title">' + esc(r.title) + (ext ? NEWTAB : "") + "</span>" +
          (ext ? ARROW : "") +
        "</div>" +
        (r.text ? '<p class="result-desc">' + esc(r.text) + "</p>" : "") +
        tagsHtml(r) +
      "</a>" +
      sections +
    "</li>";
  }

  function matching() {
    var results;
    if (searchQuery.length >= MIN_QUERY && fuse) {
      results = fuse.search(searchQuery).map(function (x) { return x.item; });
    } else if (searchQuery.length >= MIN_QUERY) {
      results = [];
    } else {
      results = allRecords.slice();
    }
    if (activeType !== "all") {
      results = results.filter(function (r) { return r.type === activeType; });
    }
    return results;
  }

  function render() {
    var box  = document.getElementById("results");
    var meta = document.getElementById("results-meta");

    /* Idle state: no query yet. Show the way in rather than the whole index. */
    if (searchQuery.length < MIN_QUERY) {
      meta.textContent = "";
      box.innerHTML =
        '<div class="search-prompt">' +
          "<p>Start typing! Two letters and you&rsquo;re off to the races&hellip;</p>" +
          '<div class="search-prompt-links">' +
            '<a class="search-prompt-link" href="databases.html">Browse databases</a>' +
            '<a class="search-prompt-link" href="guides.html">Browse guides</a>' +
            '<a class="search-prompt-link" href="newsletter/">Read the newsletter</a>' +
          "</div>" +
        "</div>";
      return;
    }

    var results = matching();

    if (results.length === 0) {
      meta.innerHTML = "No matches for <strong>" + esc(searchQuery) + "</strong>";
      box.innerHTML =
        '<div class="empty-state">' +
          "<p>No retrievals, but no worries! Try a broader search, browse by subject, or " +
          '<a href="mailto:sthompson@westex.org">ask Mr. Thompson</a> ' +
          "for help getting started.</p>" +
        "</div>";
      return;
    }

    meta.innerHTML = "<strong>" + results.length + "</strong> result" +
      (results.length === 1 ? "" : "s") + " for <strong>" + esc(searchQuery) + "</strong>";

    var html = "";
    TYPES.forEach(function (t) {
      var group = results.filter(function (r) { return r.type === t.id; });
      if (!group.length) return;

      html += '<section class="result-group" aria-labelledby="group-' + t.id + '">' +
        '<h2 class="result-group-heading" id="group-' + t.id + '">' + esc(t.heading) +
          '<span class="result-group-count">' + group.length + "</span>" +
        "</h2>" +
        '<ul class="result-list">' + group.map(resultHtml).join("") + "</ul>" +
      "</section>";
    });

    box.innerHTML = html;
  }


  /* ── LOAD ─────────────────────────────────────────────── */

  function boot() {
    readStateFromUrl();

    var input = document.getElementById("search-input");
    input.value = searchQuery;

    input.addEventListener("input", debounce(function () {
      searchQuery = this.value.trim();
      writeStateToUrl(false);
      syncControls();
      render();
    }, 150));

    document.getElementById("clear-btn").addEventListener("click", clearAll);
    document.getElementById("copy-btn").addEventListener("click", copyLink);

    window.addEventListener("popstate", function () {
      readStateFromUrl();
      document.getElementById("search-input").value = searchQuery;
      syncControls();
      render();
    });

    fetch("data/search-index.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        allRecords = data.records || [];

        /* threshold 0.20, not the 0.35 used by the single-collection pages.
           Measured against exact-substring ground truth over ten representative
           queries, 0.35 yielded mean precision 0.42 and 0.20 yielded 0.85, with
           recall unchanged at 1.00 in both cases — the looser setting adds only
           noise. At 0.35 a search for "citation" returned 44 records of which 7
           were genuine, trailing off into JSTOR and Culturegrams. Fuzziness
           still earns its place: "biography" reaches "bibliography", which is a
           useful near-miss rather than a false positive. */
        fuse = new Fuse(allRecords, {
          keys: [
            { name: "title",    weight: 3 },
            { name: "course",   weight: 2 },
            { name: "series",   weight: 1.5 },
            { name: "text",        weight: 1 },
            { name: "sectionText", weight: 1.5 },
            { name: "subjects",    weight: 1 },
            { name: "tags",        weight: 1 }
          ],
          threshold: 0.20,
          ignoreLocation: true
        });

        buildTypeBar();
        syncControls();
        render();
      })
      .catch(function () {
        document.getElementById("results").innerHTML =
          '<div class="empty-state"><p>Could not load search-index.json.</p></div>';
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
