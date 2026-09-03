
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

  var MAX_EDGE = 1600;
  var WEBP_QUALITY = 0.86;

  var PASS_THROUGH = { "image/gif": ".gif", "image/svg+xml": ".svg" };

  var EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif"
  };

  var images = Object.create(null);
  var pendingBytes = false;
  var working = false;
  var lastCaret = 0;

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


  var mirrorPending = false;

  function paintMirrorSoon() {
    if (mirrorPending) return;
    mirrorPending = true;
    requestAnimationFrame(function () {
      mirrorPending = false;
      paintMirror(el.body.value);
      syncScroll();
    });
  }

  var refresh = window.Lyceum.debounce(function () {
    var d = draft();
    var out = window.LyceumIssue.render(issueMarkdown(d), { resolveImage: resolveImage });
    var top = el.preview.scrollTop;
    el.preview.innerHTML = defuse(out.html);
    el.preview.scrollTop = top;
    showChecks(d, out.warnings);
  }, 220);

  var persist = window.Lyceum.debounce(save, 1200);

  function render() {
    paintMirrorSoon();
    refresh();
    persist();
  }

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

    var seen = Object.create(null);
    var missing = [];
    window.LyceumIssue.localImages(d.body).forEach(function (n) {
      if (images[n] || seen[n]) return;
      seen[n] = true;
      missing.push(n);
    });
    if (missing.length) {
      problems.push(missing.join(", ") + (missing.length === 1 ? " is" : " are") +
        " referenced but not held here. Drop the file in again before saving, or " +
        "the published issue will point at nothing. Reloading this page clears " +
        "held images; the words survive, the bytes do not.");
    }

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



  function replaceRange(start, end, text) {
    var t = el.body;
    t.focus();
    t.setSelectionRange(start, end);

    var native = false;
    try { native = document.execCommand("insertText", false, text); }
    catch (e) { native = false; }

    if (!native) {
      t.setRangeText(text, start, end, "end");
      render();
    }
    return start + text.length;
  }

  function surround(before, after, placeholder) {
    var t = el.body;
    var s = t.selectionStart, e = t.selectionEnd;
    var chosen = t.value.slice(s, e) || placeholder || "";
    replaceRange(s, e, before + chosen + after);
    t.setSelectionRange(s + before.length, s + before.length + chosen.length);
    lastCaret = t.selectionStart;
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
    lastCaret = replaceRange(lineStart, lineEnd, prefix + text);
  }

  function insertBlock(text, at) {
    var t = el.body;
    var s = (at === null || at === undefined) ? t.selectionStart : Math.min(at, t.value.length);
    var e = (at === null || at === undefined) ? t.selectionEnd : s;

    var before = t.value.slice(0, s).replace(/\n*$/, "");
    var afterAt = e + (/^\n*/.exec(t.value.slice(e)) || [""])[0].length;

    var lead = before ? "\n\n" : "";
    var tail = afterAt < t.value.length ? "\n\n" : "\n";
    var caret = replaceRange(before.length, afterAt, lead + text + tail);

    caret = before.length + lead.length + text.length;
    t.setSelectionRange(caret, caret);
    lastCaret = caret;
    return caret;
  }

  function extFor(file) {
    if (EXT[file.type]) return EXT[file.type];
    var m = /(\.[a-z0-9]{1,5})$/i.exec(file.name || "");
    return m ? m[1].toLowerCase() : ".img";
  }

  function baseName(file) {
    var raw = String(file.name || "image").replace(/\.[^.]+$/, "");
    return window.Lyceum.slug(raw).slice(0, 40) || "image";
  }

  function uniqueName(base, ext) {
    var name = base + ext;
    var n = 2;
    while (images[name]) { name = base + "-" + n + ext; n++; }
    return name;
  }

  function weigh(bytes) {
    return bytes >= 1048576
      ? (bytes / 1048576).toFixed(1) + " MB"
      : Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  function loadBitmap(file) {
    if (typeof createImageBitmap === "function") return createImageBitmap(file);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, type, quality);
    });
  }

  async function convert(file) {
    if (PASS_THROUGH[file.type]) {
      return { blob: file, ext: PASS_THROUGH[file.type], note: "" };
    }

    var bmp;
    try { bmp = await loadBitmap(file); }
    catch (e) { return { blob: file, ext: extFor(file), note: "" }; }

    var w = bmp.width;
    var h = bmp.height;
    var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));

    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext("2d").drawImage(bmp, 0, 0, cw, ch);
    if (bmp.close) bmp.close();

    var out = await canvasBlob(canvas, "image/webp", WEBP_QUALITY);
    if (!out || out.type !== "image/webp") {
      return { blob: file, ext: extFor(file), note: "" };
    }
    if (scale === 1 && out.size >= file.size) {
      return { blob: file, ext: extFor(file), note: "" };
    }

    var note = weigh(file.size) + " to " + weigh(out.size);
    if (cw !== w || ch !== h) note += ", " + w + "×" + h + " to " + cw + "×" + ch;
    return { blob: out, ext: ".webp", note: note };
  }

  function askAbout(name, url) {
    return new Promise(function (resolve) {
      var dlg = $("img-dialog");
      if (!dlg || typeof dlg.showModal !== "function") {
        var typed = window.prompt("Describe this image for a reader who cannot see it.", "");
        resolve(typed && typed.trim() ? { alt: typed.trim(), caption: "" } : null);
        return;
      }

      var form = $("img-form");
      var altField = $("img-alt");
      var capField = $("img-caption");
      var note = $("img-note");
      var cancel = $("img-cancel");

      altField.value = "";
      capField.value = "";
      note.hidden = true;
      $("img-file").textContent = name;
      $("img-preview").src = url;

      function finish(value) {
        form.removeEventListener("submit", onSubmit);
        dlg.removeEventListener("cancel", onCancel);
        cancel.removeEventListener("click", onCancel);
        $("img-preview").removeAttribute("src");
        if (dlg.open) dlg.close();
        resolve(value);
      }

      function onSubmit(e) {
        e.preventDefault();
        if (!altField.value.trim()) {
          note.textContent = "Alt text is required. Say what a reader who cannot see " +
            "the image would need to know from it.";
          note.hidden = false;
          altField.focus();
          return;
        }
        finish({ alt: altField.value.trim(), caption: capField.value.trim() });
      }

      function onCancel(e) {
        if (e) e.preventDefault();
        finish(null);
      }

      form.addEventListener("submit", onSubmit);
      dlg.addEventListener("cancel", onCancel);
      cancel.addEventListener("click", onCancel);
      dlg.showModal();
      altField.focus();
    });
  }

  function insertImage(name, alt, caption, at) {
    var label = alt.replace(/[\[\]]/g, "");
    var title = caption ? ' "' + caption.replace(/"/g, "”") + '"' : "";
    return insertBlock("![" + label + "](" + encodeURI(name) + title + ")", at);
  }

  function caretFromPoint(x, y) {
    var t = el.body;
    try {
      if (document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(x, y);
        if (p && (p.offsetNode === t || t.contains(p.offsetNode))) return p.offset;
      }
      if (document.caretRangeFromPoint) {
        var r = document.caretRangeFromPoint(x, y);
        if (r && (r.startContainer === t || t.contains(r.startContainer))) return r.startOffset;
      }
    } catch (e) {}
    return null;
  }

  async function addOne(file, at) {
    status("Preparing " + (file.name || "image") + "…");

    var made;
    try { made = await convert(file); }
    catch (e) {
      status("Could not read that image (" + (e.name || "error") + ").", true);
      return at;
    }

    var name = uniqueName(baseName(file), made.ext);
    var url = URL.createObjectURL(made.blob);
    var answer = await askAbout(name, url);

    if (!answer) {
      URL.revokeObjectURL(url);
      status("Image not inserted.");
      return at;
    }

    images[name] = { blob: made.blob, url: url };
    pendingBytes = true;
    status("Added " + name + (made.note ? " — " + made.note : "") +
           ". It is written into the issue folder when you save.");
    return insertImage(name, answer.alt, answer.caption, at);
  }

  async function addImages(files, caret) {
    if (working) return;
    var list = Array.prototype.filter.call(files || [], function (f) {
      return f && /^image\//i.test(f.type || "");
    });
    if (!list.length) return;

    working = true;
    var at = (caret === null || caret === undefined) ? lastCaret : caret;
    at = Math.max(0, Math.min(at, el.body.value.length));
    try {
      for (var i = 0; i < list.length; i++) at = await addOne(list[i], at);
    } finally {
      working = false;
    }
  }

  function resolveImage(src) {
    if (!src) return null;
    var name;
    try { name = decodeURIComponent(String(src).replace(/^\.\//, "")); }
    catch (e) { name = String(src); }
    var rec = images[name];
    return rec ? rec.url : null;
  }

  function referenced(body) {
    var used = Object.create(null);
    window.LyceumIssue.localImages(body).forEach(function (n) { used[n] = true; });
    return used;
  }

  function prune(used) {
    Object.keys(images).forEach(function (n) {
      if (used[n]) return;
      URL.revokeObjectURL(images[n].url);
      delete images[n];
    });
  }

  function hasFiles(e) {
    var dt = e.dataTransfer;
    if (!dt || !dt.types) return false;
    return Array.prototype.indexOf.call(dt.types, "Files") !== -1;
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
      replaceRange(s, s, "[^" + id + "]");

      var tail = /\s*$/.exec(t.value);
      var end = replaceRange(tail.index, t.value.length,
        "\n\n[^" + id + "]: The note text.\n");

      var at = t.value.lastIndexOf("The note text.");
      t.setSelectionRange(at, at + "The note text.".length);
      lastCaret = at;
      return end;
    },
    figure: function () {
      var picker = $("img-file-input");
      if (!picker) return;
      picker.value = "";
      picker.click();
    }
  };



  var canPickFolder = typeof window.showDirectoryPicker === "function";

  async function chooseFolder() {
    try {
      dirHandle = await window.showDirectoryPicker({ id: "lyceum-newsletter", mode: "readwrite" });
      el.folder.textContent = dirHandle.name;
      el.folder.hidden = false;

      var seat = await resolveIssues(dirHandle);
      status("Folder set. Issues will be written to " + seat.where + "/." +
             (seat.fresh ? " That folder did not exist yet and has been created — " +
              "if you meant to point at an existing one, choose again." : ""));
    } catch (e) {
    }
  }

  async function resolveIssues(root) {
    try {
      var child = await root.getDirectoryHandle("issues", { create: false });
      return { dir: child, where: root.name + "/issues" };
    } catch (e) {}

    if (String(root.name).toLowerCase() === "issues") {
      return { dir: root, where: root.name };
    }

    var made = await root.getDirectoryHandle("issues", { create: true });
    return { dir: made, where: root.name + "/issues", fresh: true };
  }

  async function writeFile(handle, name, contents) {
    var fh = await handle.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    await w.write(contents);
    await w.close();
  }

  function downloadBlob(name, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function download(name, contents, type) {
    downloadBlob(name, new Blob([contents], { type: type || "text/plain;charset=utf-8" }));
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

    var used = referenced(d.body);
    var pictures = Object.keys(images).filter(function (n) { return used[n]; });
    var tally = pictures.length
      ? " and " + pictures.length + (pictures.length === 1 ? " image" : " images")
      : "";

    if (dirHandle) {
      try {
        var seat = await resolveIssues(dirHandle);
        var issues = seat.dir;
        var folder = await issues.getDirectoryHandle(d.slug, { create: true });
        await writeFile(folder, "issue.md", md);
        if (shell) await writeFile(folder, "index.html", shell);
        for (var i = 0; i < pictures.length; i++) {
          await writeFile(folder, pictures[i], images[pictures[i]].blob);
        }
        await writeFile(issues, "index.json", manifestJson);
        prune(used);
        pendingBytes = false;
        status("Saved to " + seat.where + "/" + d.slug + "/ — issue.md, index.html" +
               tally + ", and the manifest. Commit in GitHub Desktop when you are ready.");
        return;
      } catch (e) {
        status("Could not write to that folder (" + e.name + "). Downloading instead.", true);
      }
    }

    download(d.slug + "--issue.md", md, "text/markdown;charset=utf-8");
    if (shell) download(d.slug + "--index.html", shell, "text/html;charset=utf-8");
    pictures.forEach(function (n) { downloadBlob(n, images[n].blob); });
    download("index.json", manifestJson, "application/json;charset=utf-8");
    pendingBytes = false;
    status("Downloaded " + (3 + pictures.length) + " files. Put issue.md, index.html" +
           (pictures.length ? ", and the image" + (pictures.length === 1 ? "" : "s") : "") +
           " in newsletter/issues/" + d.slug + "/, and index.json in newsletter/issues/.");
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
    prune(Object.create(null));
    pendingBytes = false;
    lastCaret = 0;
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
      lastCaret = el.body.value.length;
      render();
      if (had) status("Picked up where you left off.");
    });

    ["number", "date", "title", "dek", "tags", "slug"].forEach(function (k) {
      el[k].addEventListener("input", render);
    });
    el.audience.addEventListener("change", render);
    el.body.addEventListener("input", render);
    el.body.addEventListener("scroll", syncScroll);

    el.preview.addEventListener("click", function (e) {
      if (e.target.closest("a[href]")) e.preventDefault();
    });

    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") save();
    });
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

    var picker = $("img-file-input");
    if (picker) {
      picker.addEventListener("change", function () {
        addImages(picker.files, null);
        picker.value = "";
      });
    }

    el.body.addEventListener("dragover", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      el.body.classList.add("is-dropping");
    });

    el.body.addEventListener("dragleave", function () {
      el.body.classList.remove("is-dropping");
    });

    el.body.addEventListener("drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      el.body.classList.remove("is-dropping");
      var dropped = caretFromPoint(e.clientX, e.clientY);
      addImages(e.dataTransfer.files, dropped === null ? el.body.selectionStart : dropped);
    });

    el.body.addEventListener("paste", function (e) {
      var data = e.clipboardData;
      if (!data) return;

      var text = data.getData("text/plain");
      if (text && text.trim()) return;

      var files = data.files;
      if (!files || !files.length) return;
      var picture = Array.prototype.some.call(files, function (f) {
        return /^image\//i.test(f.type || "");
      });
      if (!picture) return;

      e.preventDefault();
      addImages(files, el.body.selectionStart);
    });

    ["keyup", "mouseup", "input", "select", "focus"].forEach(function (evt) {
      el.body.addEventListener(evt, function () { lastCaret = el.body.selectionStart; });
    });

    window.addEventListener("beforeunload", function (e) {
      if (!pendingBytes || !Object.keys(images).length) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  function boot() {
    unlock().then(init);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
