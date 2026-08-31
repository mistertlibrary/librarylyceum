
(function () {
  "use strict";

  var AUDIENCE_LABELS = {
    students: "For students",
    faculty: "For faculty",
    both: "For everyone"
  };

  var COLOPHON_HTML = "";



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

  function formatDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!parts) return iso || "";
    var d = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC", month: "long", day: "numeric", year: "numeric"
    });
  }



  function localImages(text) {
    var out = [], m;
    var re = /!\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
    while ((m = re.exec(text))) {
      if (!/^(https?:|data:|\/)/i.test(m[1])) out.push(decodeURIComponent(m[1]));
    }
    return out;
  }

  function dressImages(article, resolve) {
    var imgs = article.querySelectorAll("img");
    var unlabelled = 0;
    Array.prototype.forEach.call(imgs, function (img) {
      if (!img.getAttribute("alt")) unlabelled++;
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      if (resolve) {
        var mapped = resolve(img.getAttribute("src"));
        if (mapped) img.setAttribute("src", mapped);
      }
      var p = img.parentElement;
      if (!p || p.tagName !== "P") return;
      if (p.textContent.trim() !== "" ) return;
      if (p.querySelectorAll("img").length !== 1) return;
      var fig = article.ownerDocument.createElement("figure");
      fig.appendChild(img.cloneNode(true));
      var cap = img.getAttribute("title");
      if (cap) {
        var fc = article.ownerDocument.createElement("figcaption");
        fc.textContent = cap;
        fig.appendChild(fc);
      }
      fig.querySelector("img").removeAttribute("title");
      p.parentNode.replaceChild(fig, p);
    });
    return { count: imgs.length, unlabelled: unlabelled };
  }

  function render(text, opts) {
    opts = opts || {};
    var parsed = splitFrontMatter(text);
    var meta = parsed.meta;
    var fn = extractFootnotes(parsed.body);

    var doc = new DOMParser().parseFromString(
      '<article class="issue-body">' + window.marked.parse(fn.body) + "</article>",
      "text/html");
    var article = doc.body.firstElementChild;

    var pictures = dressImages(article, opts.resolveImage);

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
    if (pictures.unlabelled) {
      warnings.push(pictures.unlabelled + " image" + (pictures.unlabelled === 1 ? "" : "s") +
        " with no alt text. A reader using a screen reader gets nothing at all there.");
    }
    if (fn.orphans.length) {
      warnings.push("Footnote " + fn.orphans.map(function (n) { return "[^" + n.id + "]"; }).join(", ") +
        " defined but never referenced.");
    }

    return { html: html, meta: meta, warnings: warnings, notes: fn.notes, images: pictures.count };
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
    render: render,
    localImages: localImages
  };
})();
