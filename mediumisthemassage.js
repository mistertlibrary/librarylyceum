
(function () {
  "use strict";

  var SITE = "https://mistertlibrary.github.io/librarylyceum";
  var DRAFT_KEY = "lyceum-compose-draft";
  var UNLOCK_KEY = "lyceum-compose-unlocked";



  var PASSPHRASE = "";


  async function sha256(text) {
    var bytes = new TextEncoder().encode(text);
    var digest = await crypto.subtle.digest("SHA-256", bytes);
    return "sha256-" + Array.prototype.map
      .call(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }


  var UNLOCK_HOURS = 12;

  function unlocked() {
    try {
      var raw = localStorage.getItem(UNLOCK_KEY);
      if (!raw) return false;
      var stamp = JSON.parse(raw);
      return stamp.hash === PASSPHRASE && Date.now() < stamp.until;
    } catch (e) { return false; }
  }

  function remember() {
    try {
      localStorage.setItem(UNLOCK_KEY, JSON.stringify({
        hash: PASSPHRASE,
        until: Date.now() + UNLOCK_HOURS * 3600 * 1000
      }));
    } catch (e) {}
  }

  function unlock() {
    return new Promise(function (resolve) {
      var gate = $("gate");
      if (!PASSPHRASE) { gate.hidden = true; resolve(); return; }
      if (unlocked()) { gate.remove(); resolve(); return; }

      gate.hidden = false;
      document.body.classList.add("is-locked");
      var form = $("gate-form");
      var input = $("gate-input");
      var note = $("gate-note");
      input.focus();

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var given = await sha256(input.value);
        if (given !== PASSPHRASE) {
          note.textContent = "That is not it. Try again.";
          note.hidden = false;
          input.select();
          return;
        }
        remember();
        document.body.classList.remove("is-locked");
        gate.remove();
        resolve();
      });
    });
  }

  function setupMode() {
    var gate = $("gate");
    if (!gate) return;
    gate.hidden = false;
    document.body.classList.add("is-locked");
    $("gate-title").textContent = "Set a passphrase";
    $("gate-blurb").innerHTML =
      "No passphrase is set, so the desk is open to anyone with the address. " +
      "Choose one below and this page will give you a line to paste into " +
      "<code>mediumisthemassage.js</code>. The passphrase itself is never stored, never " +
      "sent, and never shown again \u2014 only a hash of it goes in the file.";
    $("gate-submit").textContent = "Make the line";
    var skip = $("gate-skip");
    skip.hidden = false;

    $("gate-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var value = $("gate-input").value;
      if (value.length < 4) {
        $("gate-note").textContent = "A few more characters, at least.";
        $("gate-note").hidden = false;
        return;
      }
      var hash = await sha256(value);
      $("gate-output").hidden = false;
      $("gate-output").querySelector("code").textContent = 'var PASSPHRASE = "' + hash + '";';
      $("gate-note").hidden = true;
      $("gate-input").value = "";
    });

    skip.textContent = "Never mind";
    skip.addEventListener("click", function () {
      document.body.classList.remove("is-locked");
      gate.hidden = true;
    });
  }

  var el = {};
  var manifest = { issues: [] };
  var templateHtml = "";
  var dirHandle = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) { return window.Lyceum.escHtml(s); }



  function draft() {
    return {
      number: el.number.value.trim(),
      date: el.date.value.trim(),
      title: el.title.value.trim(),
      dek: el.dek.value.trim(),
      audience: el.audience.value,
      tags: el.tags.value.trim(),
      slug: el.slug.value.trim(),
      body: el.body.value
    };
  }

  function issueMarkdown(d) {
    return window.LyceumIssue.buildFrontMatter(d) + "\n" + d.body.replace(/\s*$/, "") + "\n";
  }

  function manifestEntry(d) {
    return {
      number: parseInt(d.number, 10) || 0,
      slug: d.slug,
      date: d.date,
      title: d.title,
      dek: d.dek,
      audience: d.audience,
      tags: d.tags ? d.tags.split(",").map(function (t) { return t.trim(); }).filter(Boolean) : []
    };
  }

  function issueShell(d) {
    if (!templateHtml) return null;
    var title = d.title || "Untitled";
    var dek = d.dek || "";
    return templateHtml
      .replace(/<title>[^<]*<\/title>/,
        "<title>" + esc(title) + " &mdash; WEHS Library Lyceum</title>")
      .replace(/(<meta name="description" content=")[^"]*(">)/,
        "$1" + esc(dek) + "$2")
      .replace(/(<meta property="og:title" content=")[^"]*(">)/,
        "$1" + esc(title) + " | Knightly Muse$2")
      .replace(/(<meta property="og:description" content=")[^"]*(">)/,
        "$1" + esc(dek) + "$2")
      .replace(/(<meta property="og:url" content=")[^"]*(">)/,
        "$1" + SITE + "/newsletter/issues/" + encodeURIComponent(d.slug) + "/$2")
      .replace(/(<meta name="twitter:title" content=")[^"]*(">)/,
        "$1" + esc(title) + " &mdash; WEHS Library Lyceum$2")
      .replace(/(<meta name="twitter:description" content=")[^"]*(">)/,
        "$1" + esc(dek) + "$2");
  }



  var slugTouched = false;

  function suggestSlug() {
    if (slugTouched) return;
    el.slug.value = window.Lyceum.slug(el.title.value).slice(0, 60);
  }




  var MARK = [
    [/^(#{1,6})(\s+)/gm,            function (m, h, sp) { return tok("mk", h) + sp; }],
    [/(\{)([^}\n]*)(\})[ \t]*$/gm, function (m, a, inner, b) { return tok("gloss-mk", a + inner + b); }],
    [/(\[\^[^\]\n]+\]:?)/g,        function (m) { return tok("note-mk", m); }],
    [/^(&gt;)(\s+)/gm,              function (m, q, sp) { return tok("mk", q) + sp; }],
    [/^([-*+])(\s+)/gm,            function (m, b, sp) { return tok("mk", b) + sp; }],
    [/^(\d+\.)(\s+)/gm,           function (m, b, sp) { return tok("mk", b) + sp; }],
    [/^(---+)$/gm,                function (m) { return tok("mk", m); }],
    [/(\*\*)([^*\n]+)(\*\*)/g,     function (m, a, t, b) { return tok("mk", a) + t + tok("mk", b); }],
    [/(?<![*\w])(\*)([^*\n]+)(\*)(?!\w)/g, function (m, a, t, b) { return tok("mk", a) + t + tok("mk", b); }],
    [/(\[)([^\]\n]*)(\]\()([^)\n]*)(\))/g,
      function (m, a, label, mid, url, close) {
        return tok("mk", a) + label + tok("url-mk", mid + url + close);
      }]
  ];

  function tok(cls, text) { return '\u0001' + cls + '\u0002' + text + '\u0003'; }

  function paintMirror(text) {
    var out = window.Lyceum.escHtml(text);
    MARK.forEach(function (rule) { out = out.replace(rule[0], rule[1]); });
    out = out
      .replace(/\u0001([a-z-]+)\u0002/g, '<span class="$1">')
      .replace(/\u0003/g, "</span>");
    el.mirror.innerHTML = out + (/\n$/.test(text) ? "\n" : "");
  }


  function defuse(html) {
    var frag = new DOMParser().parseFromString(html, "text/html").body;
    Array.prototype.forEach.call(frag.querySelectorAll("script, iframe, object, embed"),
      function (n) { n.remove(); });
    Array.prototype.forEach.call(frag.querySelectorAll("*"), function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var name = a.name.toLowerCase();
        var value = (a.value || "").replace(/\s+/g, "").toLowerCase();
        if (name.indexOf("on") === 0) n.removeAttribute(a.name);
        else if ((name === "href" || name === "src" || name === "xlink:href") &&
                 value.indexOf("javascript:") === 0) n.removeAttribute(a.name);
      });
    });
    return frag.innerHTML;
  }

  function syncScroll() {
    el.mirror.scrollTop = el.body.scrollTop;
    el.mirror.scrollLeft = el.body.scrollLeft;
  }


  var render = window.Lyceum.debounce(function () {
    var d = draft();
    paintMirror(d.body);
    var out = window.LyceumIssue.render(issueMarkdown(d));
    el.preview.innerHTML = defuse(out.html);
    Array.prototype.forEach.call(el.preview.querySelectorAll("a[href]"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); });
    });
    showChecks(d, out.warnings);
    save();
  }, 180);

  function showChecks(d, warnings) {
    var problems = warnings.slice();

    if (!d.slug) {
      problems.push("No folder name. The issue needs one to have a URL.");
    } else if (!/^[a-z0-9-]+$/.test(d.slug)) {
      problems.push("Folder name should be lowercase letters, numbers, and hyphens only.");
    }

    var n = parseInt(d.number, 10);
    manifest.issues.forEach(function (i) {
      if (i.number === n && i.slug !== d.slug) {
        problems.push("Issue " + n + " is already " + i.slug + ". Numbers drive previous and next links and must be unique.");
      }
      if (i.slug === d.slug && i.number !== n) {
        problems.push("A folder named " + d.slug + " already exists, as issue " + i.number + ".");
      }
    });

    var words = d.body.trim() ? d.body.trim().split(/\s+/).length : 0;
    el.count.textContent = words + (words === 1 ? " word" : " words");

    if (!problems.length) {
      el.checks.hidden = true;
      el.checks.innerHTML = "";
      return;
    }
    el.checks.hidden = false;
    el.checks.innerHTML = "<p class='checks-title'>Before you publish</p><ul>" +
      problems.map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + "</ul>";
  }



  function surround(before, after, placeholder) {
    var t = el.body;
    var s = t.selectionStart, e = t.selectionEnd;
    var chosen = t.value.slice(s, e) || placeholder || "";
    t.setRangeText(before + chosen + after, s, e, "select");
    if (!t.value.slice(s, e)) {
      t.selectionStart = s + before.length;
      t.selectionEnd = s + before.length + chosen.length;
    } else {
      t.selectionStart = s + before.length;
      t.selectionEnd = s + before.length + chosen.length;
    }
    t.focus();
    render();
  }

  function atLineStart(prefix, placeholder) {
    var t = el.body;
    var s = t.selectionStart;
    var lineStart = t.value.lastIndexOf("\n", s - 1) + 1;
    var lineEnd = t.value.indexOf("\n", s);
    if (lineEnd < 0) lineEnd = t.value.length;
    var line = t.value.slice(lineStart, lineEnd);
    var stripped = line.replace(/^(#{1,6}\s+|>\s+|-\s+)/, "");
    var text = stripped || placeholder || "";
    t.setRangeText(prefix + text, lineStart, lineEnd, "end");
    t.focus();
    render();
  }

  function insertBlock(text) {
    var t = el.body;
    var s = t.selectionStart;
    var before = t.value.slice(0, s).replace(/\n*$/, "");
    var after = t.value.slice(t.selectionEnd).replace(/^\n*/, "");
    var joined = (before ? before + "\n\n" : "") + text + "\n\n" + after;
    var caret = (before ? before.length + 2 : 0) + text.length;
    t.value = joined;
    t.selectionStart = t.selectionEnd = caret;
    t.focus();
    render();
  }

  var nextNote = 1;

  var TOOLBAR = {
    section: function () { atLineStart("## ", "Section title"); },
    gloss: function () {
      var t = el.body;
      var s = t.selectionStart;
      var lineStart = t.value.lastIndexOf("\n", s - 1) + 1;
      var lineEnd = t.value.indexOf("\n", s);
      if (lineEnd < 0) lineEnd = t.value.length;
      var line = t.value.slice(lineStart, lineEnd);
      if (!/^##\s/.test(line)) { atLineStart("## ", "Section title"); return; }
      if (/\{[^}]*\}\s*$/.test(line)) return;
      t.setRangeText(line.replace(/\s*$/, "") + " {a note for the contents list}", lineStart, lineEnd, "end");
      t.focus();
      render();
    },
    bold: function () { surround("**", "**", "bold text"); },
    italic: function () { surround("*", "*", "italic text"); },
    link: function () { surround("[", "](https://)", "link text"); },
    quote: function () { atLineStart("> ", "A pulled quote."); },
    list: function () { atLineStart("- ", "List item"); },
    rule: function () { insertBlock("---"); },
    note: function () {
      var t = el.body;
      var id = "n" + nextNote++;
      while (t.value.indexOf("[^" + id + "]") !== -1) id = "n" + nextNote++;
      var s = t.selectionEnd;
      t.setRangeText("[^" + id + "]", s, s, "end");
      t.value = t.value.replace(/\s*$/, "") + "\n\n[^" + id + "]: The note text.\n";
      t.selectionStart = t.selectionEnd = t.value.lastIndexOf("The note text.");
      t.setSelectionRange(t.selectionStart, t.selectionStart + "The note text.".length);
      t.focus();
      render();
    },
    figure: function () {
      insertBlock('<figure>\n  <img src="../../../img/FILE.jpg" alt="Describe the image for a screen reader.">\n  <figcaption>Caption text.</figcaption>\n</figure>');
    }
  };



  var canPickFolder = typeof window.showDirectoryPicker === "function";

  async function chooseFolder() {
    try {
      dirHandle = await window.showDirectoryPicker({ id: "lyceum-newsletter", mode: "readwrite" });
      el.folder.textContent = dirHandle.name;
      el.folder.hidden = false;
      status("Folder set to " + dirHandle.name + ". Saving writes the issue folder inside it.");
    } catch (e) {
    }
  }

  async function writeFile(handle, name, contents) {
    var fh = await handle.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    await w.write(contents);
    await w.close();
  }

  function download(name, contents, type) {
    var blob = new Blob([contents], { type: type || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function nextManifest(d) {
    var entry = manifestEntry(d);
    var issues = manifest.issues.filter(function (i) { return i.slug !== entry.slug; });
    issues.push(entry);
    issues.sort(function (a, b) { return a.number - b.number; });
    return JSON.stringify({ issues: issues }, null, 2) + "\n";
  }

  async function publish() {
    var d = draft();
    if (!d.slug || !/^[a-z0-9-]+$/.test(d.slug)) {
      status("Give the issue a folder name first — lowercase letters, numbers, and hyphens.", true);
      el.slug.focus();
      return;
    }

    var md = issueMarkdown(d);
    var shell = issueShell(d);
    var manifestJson = nextManifest(d);

    if (dirHandle) {
      try {
        var issues = await dirHandle.getDirectoryHandle("issues", { create: true });
        var folder = await issues.getDirectoryHandle(d.slug, { create: true });
        await writeFile(folder, "issue.md", md);
        if (shell) await writeFile(folder, "index.html", shell);
        await writeFile(issues, "index.json", manifestJson);
        status("Saved to issues/" + d.slug + "/ — issue.md, index.html, and the manifest. " +
               "Commit in GitHub Desktop when you are ready.");
        return;
      } catch (e) {
        status("Could not write to that folder (" + e.name + "). Downloading instead.", true);
      }
    }

    download(d.slug + "--issue.md", md, "text/markdown;charset=utf-8");
    if (shell) download(d.slug + "--index.html", shell, "text/html;charset=utf-8");
    download("index.json", manifestJson, "application/json;charset=utf-8");
    status("Downloaded three files. Put issue.md and index.html in " +
           "newsletter/issues/" + d.slug + "/, and index.json in newsletter/issues/.");
  }

  function status(msg, bad) {
    el.status.textContent = msg;
    el.status.className = "compose-status" + (bad ? " is-bad" : "");
  }



  function save() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft())); } catch (e) {}
  }

  function restore() {
    var raw;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      ["number", "date", "title", "dek", "tags", "slug", "body"].forEach(function (k) {
        if (d[k] !== undefined && el[k]) el[k].value = d[k];
      });
      if (d.audience) el.audience.value = d.audience;
      if (d.slug) slugTouched = true;
      return Boolean(d.title || d.body);
    } catch (e) { return false; }
  }

  function startFresh() {
    if (!confirm("Discard this draft and start a new issue?")) return;
    ["number", "title", "dek", "tags", "slug", "body"].forEach(function (k) { el[k].value = ""; });
    el.audience.value = "both";
    slugTouched = false;
    seedDefaults();
    render();
    el.title.focus();
  }



  function seedDefaults() {
    if (!el.date.value) {
      var t = new Date();
      el.date.value = [t.getFullYear(),
        String(t.getMonth() + 1).padStart(2, "0"),
        String(t.getDate()).padStart(2, "0")].join("-");
    }
    if (!el.number.value) {
      var highest = manifest.issues.reduce(function (a, i) { return Math.max(a, i.number || 0); }, 0);
      el.number.value = String(highest + 1);
    }
  }

  function init() {
    ["number", "date", "title", "dek", "audience", "tags", "slug", "body",
     "preview", "checks", "status", "count", "folder", "mirror"].forEach(function (id) {
      el[id] = $("f-" + id) || $(id);
    });
    if (!el.body || !el.preview) return;

    window.marked.use({ gfm: true, breaks: false });

    if (!canPickFolder) {
      $("choose-folder").hidden = true;
      $("save-note").textContent =
        "This browser cannot be pointed at a folder, so saving downloads the three files instead.";
    }

    Promise.all([
      fetch("newsletter/issues/index.json", { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : { issues: [] }; })
        .catch(function () { return { issues: [] }; }),
      fetch("newsletter/issues/_template/index.html", { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.text() : ""; })
        .catch(function () { return ""; })
    ]).then(function (both) {
      manifest = both[0] && both[0].issues ? both[0] : { issues: [] };
      templateHtml = both[1];
      if (!templateHtml) {
        status("Could not read the issue template, so index.html will not be generated. " +
               "issue.md and the manifest still will.", true);
      }
      var had = restore();
      seedDefaults();
      render();
      if (had) status("Picked up where you left off.");
    });

    ["number", "date", "title", "dek", "tags", "slug"].forEach(function (k) {
      el[k].addEventListener("input", render);
    });
    el.audience.addEventListener("change", render);
    el.body.addEventListener("input", render);
    el.body.addEventListener("scroll", syncScroll);
    window.addEventListener("resize", syncScroll);
    el.title.addEventListener("input", suggestSlug);
    el.slug.addEventListener("input", function () { slugTouched = true; });

    document.querySelector(".compose-toolbar").addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-tool]");
      if (!btn) return;
      var fn = TOOLBAR[btn.dataset.tool];
      if (fn) fn();
    });

    if (!PASSPHRASE) {
      var offer = $("set-passphrase");
      if (offer) {
        offer.hidden = false;
        offer.addEventListener("click", function (e) { e.preventDefault(); setupMode(); });
      }
    }

    $("choose-folder").addEventListener("click", chooseFolder);
    $("publish").addEventListener("click", publish);
    $("new-issue").addEventListener("click", startFresh);

    el.body.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); TOOLBAR.bold(); }
      if (k === "i") { e.preventDefault(); TOOLBAR.italic(); }
    });
  }

  function boot() {
    unlock().then(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
