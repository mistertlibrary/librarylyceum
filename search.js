
(function () {
  "use strict";

  var esc      = window.Lyceum.escHtml;
  var paras    = window.Lyceum.paragraphs;
  var debounce = window.Lyceum.debounce;
  var ARROW    = window.Lyceum.externalArrow;
  var NEWTAB   = window.Lyceum.newTabNote;

  var TYPES = [
    { id: "guide",    label: "Research Guides", heading: "Research Guides" },
    { id: "database", label: "Databases",       heading: "Databases" },
    { id: "tool",     label: "Classroom Tools", heading: "Classroom Tools" },
    { id: "issue",    label: "Newsletter",      heading: "Newsletter" }
  ];

  var MIN_QUERY = 2;

  var allRecords = [];
  var fuse       = null;
  var searchQuery = "";
  var activeType  = "all";



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



  function contextLine(r) {
    var bits = [];
    if (r.type === "guide") {
      if (r.series) bits.push(r.series);
      if (r.course) bits.push(r.course);
    } else if (r.type === "database") {
      if (r.primary) bits.push(r.primary);
    } else if (r.type === "tool") {
      if (r.band) bits.push(r.band);
      if (r.vendor) bits.push(r.vendor.split("\u00b7")[0].trim());
    } else if (r.type === "issue") {
      if (r.number) bits.push("Issue " + r.number);
      if (r.date) bits.push(longDate(r.date));
      if (r.audience && r.audience !== "both") {
        bits.push(r.audience === "students" ? "For students" : "For faculty");
      }
    }
    return bits.length ? '<p class="result-context">' + esc(bits.join(" &middot; ")).replace(/&amp;middot;/g, "&middot;") + "</p>" : "";
  }

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

  function matchingSections(r) {
    if (!r.sections || !r.sections.length) return [];
    if (searchQuery.length < MIN_QUERY) return [];

    var q = searchQuery.toLowerCase();

    var STOP = ["and", "the", "for", "with", "of", "in", "on", "to", "a", "an", "or", "at", "by"];
    var terms = q.split(/\s+/).filter(function (w) {
      return w.length > 1 && STOP.indexOf(w) === -1;
    });
    if (!terms.length) return [];

    var hits = r.sections.filter(function (s) {
      var hay = (s.title + " " + (s.keywords || []).join(" ")).toLowerCase();
      return terms.some(function (term) { return hay.indexOf(term) !== -1; });
    });

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

    return '<li class="result-item">' +
      '<a class="result' + (sections ? " result-has-sections" : "") + '" href="' +
        esc(r.url) + '"' + attrs + '>' +
        contextLine(r) +
        '<div class="result-head">' +
          '<span class="result-title">' + esc(r.title) + (ext ? NEWTAB : "") + "</span>" +
          (ext ? ARROW : "") +
        "</div>" +
        (r.text ? '<div class="result-desc">' + paras(r.text) + "</div>" : "") +
        tagsHtml(r) +
      "</a>" +
      sections +
    "</li>";
  }

  var QUERY_STOP = ["and", "the", "for", "with", "of", "in", "on", "to", "a",
                    "an", "or", "at", "by", "is", "it", "my", "i", "about",
                    "what", "should", "how"];

  function queryWords(q) {
    return q.toLowerCase().split(/\s+/).filter(function (w) {
      return w.length > 1 && QUERY_STOP.indexOf(w) === -1;
    });
  }

  /* Fuse compares the whole typed string against each field, so a multi-word
     query only matches a span where those words sit together. "ancient rome"
     therefore missed "Ancient and Medieval History", which contains both. The
     phrase pass runs first and keeps its ranking; a second pass then adds any
     record matching every word somewhere, ranked behind. */
  function everyWordHits(words, phraseSeen) {
    var counts = [], scores = [], out = [];
    var i, j, hits, at;

    for (i = 0; i < allRecords.length; i++) { counts[i] = 0; scores[i] = 0; }

    for (j = 0; j < words.length; j++) {
      hits = fuse.search(words[j]);
      for (i = 0; i < hits.length; i++) {
        at = hits[i].refIndex;
        if (at === undefined) at = allRecords.indexOf(hits[i].item);
        if (at < 0) continue;
        counts[at]++;
        scores[at] += (typeof hits[i].score === "number" ? hits[i].score : 0);
      }
    }

    for (i = 0; i < allRecords.length; i++) {
      if (counts[i] === words.length && !phraseSeen[i]) {
        out.push({ at: i, score: scores[i] });
      }
    }
    out.sort(function (a, b) { return a.score - b.score; });

    return out.map(function (x) { return allRecords[x.at]; });
  }

  function searchRecords(q) {
    var phrase = fuse.search(q);
    var seen = {}, results = [], i, at;

    for (i = 0; i < phrase.length; i++) {
      at = phrase[i].refIndex;
      if (at === undefined) at = allRecords.indexOf(phrase[i].item);
      if (at >= 0) seen[at] = true;
      results.push(phrase[i].item);
    }

    var words = queryWords(q);
    if (words.length < 2) return results;

    return results.concat(everyWordHits(words, seen));
  }

  function matching() {
    var results;
    if (searchQuery.length >= MIN_QUERY && fuse) {
      results = searchRecords(searchQuery);
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

        fuse = new Fuse(allRecords, {
          keys: [
            { name: "title",    weight: 3 },
            { name: "course",   weight: 2 },
            { name: "series",   weight: 1.5 },
            { name: "text",        weight: 1 },
            { name: "sectionText", weight: 1.5 },
            { name: "keywords",    weight: 1.5 },
            { name: "subjects",    weight: 1 },
            { name: "vendor",      weight: 1 },
            { name: "tags",        weight: 1 }
          ],
          threshold: 0.20,
          ignoreLocation: true,
          includeScore: true
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
