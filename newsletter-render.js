/* LIBRARY LYCEUM: ISSUE RENDERING
 *
 * The single implementation of how an issue.md becomes a rendered issue.
 * Two pages load it:
 *
 *   newsletter/issues/<slug>/index.html   via newsletter-issue.js — the published issue
 *   mediumisthemassage.html               via its own script — the live preview
 *
 * That sharing is the point. The preview is not an approximation of what
 * publishes; it is the same function, over the same stylesheet, with the same
 * vendored marked. A change to footnote handling or contents building changes
 * both at once, so the preview cannot drift into a comfortable lie.
 *
 * Pure functions only. Nothing here fetches, and nothing here touches the
 * document except the detached element buildContents is handed.
 */

(function () {
  "use strict";

  var AUDIENCE_LABELS = {
    students: "For students",
    faculty: "For faculty",
    both: "For everyone"
  };

  /* Your standing colophon. An empty string omits the block entirely. Plain
     HTML, since it is injected into every issue and into every preview. */
  var COLOPHON_HTML = "";


  /* ── FRONT MATTER ─────────────────────────────────────── */

  function splitFrontMatter(text) {
    var meta = {};
    var body = text;
    var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (m) {
      body = text.slice(m[0].length);
      m[1].split(/\r?\n/).forEach(function (line) {
        if (!line.trim() || /^\s*#/.test(line)) return;
        var i = line.indexOf(":");
        if (i < 0) return;
        var key = line.slice(0, i).trim();
        var val = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        meta[key] = val;
      });
    }
    return { meta: meta, body: body };
  }

  /* The inverse, for the compose tool: form fields back to a front matter
     block. Values are written bare; a value containing a colon followed by a
     space would otherwise re-parse wrongly, so those are quoted. */
  function buildFrontMatter(meta) {
    var order = ["number", "date", "title", "dek", "audience", "tags"];
    var lines = order.filter(function (k) {
      return meta[k] !== undefined && String(meta[k]).trim() !== "";
    }).map(function (k) {
      var v = String(meta[k]).trim();
      if (/:\s/.test(v) || /^["'#]/.test(v)) v = '"' + v.replace(/"/g, '\\"') + '"';
      return k + ": " + v;
    });
    return "---\n" + lines.join("\n") + "\n---\n";
  }


  /* ── FOOTNOTES ────────────────────────────────────────────
     marked has no footnote support, so references and definitions are handled
     before it ever sees the text. Notes are renumbered in order of first
     appearance, so definitions may sit anywhere in the file. */

  function extractFootnotes(body) {
    var notes = [];
    var seen = {};
    body = body.replace(/^\[\^([^\]]+)\]:[ \t]*([\s\S]*?)(?=\n{2,}|\n\[\^|$)/gm,
      function (_, id, text) {
        seen[id] = notes.push({ id: id, text: text.trim() });
        return "";
      });
    var order = [];
    body = body.replace(/\[\^([^\]]+)\]/g, function (match, id) {
      if (!seen[id]) return match;
      var n = order.indexOf(id);
      if (n < 0) n = order.push(id) - 1;
      n += 1;
      return '<sup class="fn-ref" id="fnref-' + n + '"><a href="#fn-' + n +
        '" aria-label="Footnote ' + n + '">' + n + "</a></sup>";
    });
    var ordered = order.map(function (id) { return notes[seen[id] - 1]; });
    /* A definition nothing refers to is a typo worth surfacing rather than
       silently dropping. */
    var orphans = notes.filter(function (n) { return order.indexOf(n.id) < 0; });
    return { body: body, notes: ordered, orphans: orphans };
  }

  function renderFootnotes(notes) {
    if (!notes.length) return "";
    var items = notes.map(function (note, i) {
      var n = i + 1;
      return '<li id="fn-' + n + '">' + window.marked.parseInline(note.text) +
        ' <a class="fn-back" href="#fnref-' + n + '" aria-label="Back to text">&#8617;</a></li>';
    }).join("");
    return '<section class="footnotes" aria-label="Footnotes"><ol>' + items + "</ol></section>";
  }


  /* ── CONTENTS ─────────────────────────────────────────────
     A brace at the end of an H2 becomes the gloss and is stripped from the
     heading. Built only when an issue has two or more sections. */

  function buildContents(container) {
    var headings = container.querySelectorAll("h2");
    if (headings.length < 2) return "";
    var items = [];
    Array.prototype.forEach.call(headings, function (h) {
      var raw = h.textContent;
      var gloss = "";
      var m = /\{([^}]*)\}\s*$/.exec(raw);
      if (m) {
        gloss = m[1].trim();
        h.textContent = raw.slice(0, m.index).trim();
      }
      var id = window.Lyceum.slug(h.textContent);
      h.id = id;
      items.push('<li><a href="#' + id + '">' + window.Lyceum.escHtml(h.textContent) + "</a>" +
        (gloss ? '<span class="gloss">: ' + window.Lyceum.escHtml(gloss) + "</span>" : "") + "</li>");
    });
    return '<div class="issue-contents" role="navigation" aria-label="Contents">' +
      "<h2>In this issue</h2><ol>" + items.join("") + "</ol></div>";
  }

  /* Parsed as UTC so the date does not slip a day for readers west of the
     meridian. */
  function formatDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!parts) return iso || "";
    var d = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC", month: "long", day: "numeric", year: "numeric"
    });
  }


  /* ── RENDER ───────────────────────────────────────────────
     Returns the issue's complete inner HTML, plus what was parsed out of it,
     plus anything worth warning about. The caller decides where to put it. */

  function render(text) {
    var parsed = splitFrontMatter(text);
    var meta = parsed.meta;
    var fn = extractFootnotes(parsed.body);

    /* Parsed inertly rather than into a live element. Assigning innerHTML on an
       element made with document.createElement starts loading any <img> in the
       markup, and a failed load fires its onerror handler — so the issue text
       would execute merely by being rendered, before any caller could inspect
       it. A DOMParser document has no browsing context: nothing loads and
       nothing runs. The published page still inserts the result normally; this
       only removes a place where code could run that nobody was watching. */
    var doc = new DOMParser().parseFromString(
      '<article class="issue-body">' + window.marked.parse(fn.body) + "</article>",
      "text/html");
    var article = doc.body.firstElementChild;

    var contents = buildContents(article);
    var audience = (meta.audience || "both").toLowerCase();

    var masthead = '<div class="issue-masthead">' +
      '<p class="issue-meta">' +
      (meta.number ? "<span>Issue " + window.Lyceum.escHtml(meta.number) +
        '</span><span class="meta-sep" aria-hidden="true">&#183;</span>' : "") +
      "<span>" + window.Lyceum.escHtml(formatDate(meta.date)) + "</span>" +
      '<span class="audience-badge">' +
        window.Lyceum.escHtml(AUDIENCE_LABELS[audience] || AUDIENCE_LABELS.both) +
      "</span></p>" +
      "<h1>" + window.Lyceum.escHtml(meta.title || "") + "</h1>" +
      (meta.dek ? '<p class="issue-dek">' + window.Lyceum.escHtml(meta.dek) + "</p>" : "") +
      "</div>";

    var html = masthead + contents + article.outerHTML + renderFootnotes(fn.notes) +
      (COLOPHON_HTML ? '<div class="colophon">' + COLOPHON_HTML + "</div>" : "");

    var warnings = [];
    if (!meta.title) warnings.push("No title in the front matter.");
    if (!meta.dek) warnings.push("No dek. The archive card and the meta description both use it.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || "")) warnings.push("Date should be YYYY-MM-DD.");
    if (!meta.number) warnings.push("No issue number. Previous and next links need it.");
    if (fn.orphans.length) {
      warnings.push("Footnote " + fn.orphans.map(function (n) { return "[^" + n.id + "]"; }).join(", ") +
        " defined but never referenced.");
    }

    return { html: html, meta: meta, warnings: warnings, notes: fn.notes };
  }


  window.LyceumIssue = {
    AUDIENCE_LABELS: AUDIENCE_LABELS,
    COLOPHON_HTML: COLOPHON_HTML,
    splitFrontMatter: splitFrontMatter,
    buildFrontMatter: buildFrontMatter,
    extractFootnotes: extractFootnotes,
    renderFootnotes: renderFootnotes,
    buildContents: buildContents,
    formatDate: formatDate,
    render: render
  };
})();
