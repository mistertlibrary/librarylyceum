/* LIBRARY LYCEUM: ISSUE COMPOSER
 *
 * A drafting desk for Knightly Muse. Front matter is a form, prose is a plain
 * textarea with a toolbar so no syntax has to be remembered, and the preview is
 * rendered by newsletter-render.js — the same function the published page uses,
 * over the same stylesheet. What you approve here is what publishes.
 *
 * Nothing is sent anywhere. The draft lives in this browser until you save it.
 */

(function () {
  "use strict";

  var SITE = "https://mistertlibrary.github.io/librarylyceum";
  var DRAFT_KEY = "lyceum-compose-draft";
  var UNLOCK_KEY = "lyceum-compose-unlocked";


  /* ── THE LOCK ─────────────────────────────────────────────
   *
   * Paste the line the page gives you here. Leave it empty and the page will
   * offer to make one; it never leaves your browser and is never sent anywhere.
   *
   *     var PASSPHRASE = "sha256-....";
   */

  var PASSPHRASE = "";

  /* WHAT THIS IS, AND WHAT IT IS NOT
   *
   * This is a lock on a cupboard door, not a lock on a vault. The page and this
   * script are public files on a public site; anyone determined enough to read
   * the source can walk around the check. Storing a hash rather than the word
   * itself means the passphrase is not sitting in plain view, and nothing more.
   *
   * That is enough, because there is nothing here worth taking. The composer
   * cannot publish. It writes files to whichever folder the person at the
   * keyboard has personally granted through a browser permission prompt — their
   * own machine, their own Downloads folder. A student who got past this could
   * write a fake issue and save it to their own laptop. The repository, and
   * therefore the site, is untouched.
   *
   * So the lock is for clarity, not defence: it says "this is not the page you
   * are looking for" to anyone who wanders in. The real protection is that the
   * tool has no power over anything but the disk of whoever is using it.
   */

  async function sha256(text) {
    var bytes = new TextEncoder().encode(text);
    var digest = await crypto.subtle.digest("SHA-256", bytes);
    return "sha256-" + Array.prototype.map
      .call(new Uint8Array(digest), function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  /* Remembered for a working day, in localStorage rather than sessionStorage:
     sessionStorage is per-tab, so a new tab meant answering again, which is a
     nuisance without being a protection. The stamp holds the hash, so changing
     the passphrase invalidates every remembered unlock at once. */

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

  /* Resolves when the desk should open. Rejects nothing — a wrong passphrase
     simply asks again, because there is no attacker to rate-limit. */
  function unlock() {
    return new Promise(function (resolve) {
      var gate = $("gate");
      /* No passphrase set is the default state, and the default state should not
         make him click past a door that is already open. The desk opens; a quiet
         line in the actions row offers to set one. */
      /* Hidden, not removed: the offer in the actions row reopens it in setup
         mode, and it cannot reopen what is no longer there. */
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

  /* Opened from the desk, not on the way in: help him make a passphrase without
     ever seeing it. */
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


  /* ── THE DRAFT ────────────────────────────────────────── */

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

  /* The issue shell, with the per-issue meta filled in. Hand-editing seven meta
     lines was the most error-prone step in publishing; this removes it. */
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


  /* ── SLUG ─────────────────────────────────────────────────
     Suggested from the title, but editable: the folder name is the URL, and a
     URL is worth choosing deliberately. Once touched, it stops following. */

  var slugTouched = false;

  function suggestSlug() {
    if (slugTouched) return;
    el.slug.value = window.Lyceum.slug(el.title.value).slice(0, 60);
  }


  /* ── PREVIEW ──────────────────────────────────────────── */

  /* ── THE MIRROR ───────────────────────────────────────────
     The structural marks are dimmed rather than hidden. Hiding them would mean
     the caret moving through characters that are not there, which is worse than
     seeing a faint hash. Only colour changes: any difference in weight, size or
     spacing between the two layers would put the text out of register with the
     caret. */

  var MARK = [
    /* heading marks and the gloss braces that trail them */
    [/^(#{1,6})(\s+)/gm,            function (m, h, sp) { return tok("mk", h) + sp; }],
    /* [ \t]*$ rather than \s*$: \s swallows the newline itself, which deleted a
       blank line from the mirror and put every following row out of register. */
    [/(\{)([^}\n]*)(\})[ \t]*$/gm, function (m, a, inner, b) { return tok("gloss-mk", a + inner + b); }],
    /* footnote references and definitions */
    [/(\[\^[^\]\n]+\]:?)/g,        function (m) { return tok("note-mk", m); }],
    /* block marks at the start of a line */
    [/^(&gt;)(\s+)/gm,              function (m, q, sp) { return tok("mk", q) + sp; }],
    [/^([-*+])(\s+)/gm,            function (m, b, sp) { return tok("mk", b) + sp; }],
    [/^(\d+\.)(\s+)/gm,           function (m, b, sp) { return tok("mk", b) + sp; }],
    [/^(---+)$/gm,                function (m) { return tok("mk", m); }],
    /* emphasis: dim the asterisks, leave the words alone */
    [/(\*\*)([^*\n]+)(\*\*)/g,     function (m, a, t, b) { return tok("mk", a) + t + tok("mk", b); }],
    [/(?<![*\w])(\*)([^*\n]+)(\*)(?!\w)/g, function (m, a, t, b) { return tok("mk", a) + t + tok("mk", b); }],
    /* links: the label stays, the plumbing recedes */
    [/(\[)([^\]\n]*)(\]\()([^)\n]*)(\))/g,
      function (m, a, label, mid, url, close) {
        return tok("mk", a) + label + tok("url-mk", mid + url + close);
      }]
  ];

  function tok(cls, text) { return '\u0001' + cls + '\u0002' + text + '\u0003'; }

  function paintMirror(text) {
    /* Escape first, so nothing in the draft can become markup, then mark, then
       turn the sentinels into real spans. */
    var out = window.Lyceum.escHtml(text);
    MARK.forEach(function (rule) { out = out.replace(rule[0], rule[1]); });
    out = out
      .replace(/\u0001([a-z-]+)\u0002/g, '<span class="$1">')
      .replace(/\u0003/g, "</span>");
    /* pre-wrap drops a single trailing newline, so a draft ending in one needs a
       companion to keep the last empty row. A draft that does NOT end in one must
       get nothing, or the mirror grows a phantom line and every scroll position
       after it is wrong by a row. */
    el.mirror.innerHTML = out + (/\n$/.test(text) ? "\n" : "");
  }

  /* Raw HTML passes through marked untouched, which is how the <figure> block in
     the template works. On a published page that is a convenience: the author is
     the only one who writes those files. Here it is not, because text arrives by
     paste, and this page holds both the saved draft and — once a folder has been
     chosen — permission to write into the newsletter directory. So the preview
     renders markup but refuses to run it.

     This is the single place the preview deliberately differs from the published
     page. Nothing that belongs in a newsletter is affected: images, figures,
     captions and links all render. An inline event handler would not fire here
     and would fire there, which is a good reason not to write one. */

  function defuse(html) {
    /* DOMParser, not a detached div. Assigning innerHTML on a div begins loading
       any <img> it contains, and a failed load fires the onerror handler before
       a single attribute can be stripped — which is exactly how the first
       attempt at this function was defeated. A DOMParser document has no
       browsing context: nothing loads, nothing runs, and the markup can be
       inspected at leisure. */
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
    /* Anchors inside the preview would navigate the composer away. */
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


  /* ── TOOLBAR ──────────────────────────────────────────────
     Every button wraps or inserts around the selection, then restores focus, so
     the caret never has to be hunted for. */

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
    /* Blocks need blank lines around them or Markdown folds them into the
       paragraph above. */
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


  /* ── SAVING ───────────────────────────────────────────────
     Chrome and Edge can be pointed at a folder once and then written to
     directly. Everywhere else, and if permission is refused, the same three
     files arrive as downloads. */

  var canPickFolder = typeof window.showDirectoryPicker === "function";

  async function chooseFolder() {
    try {
      dirHandle = await window.showDirectoryPicker({ id: "lyceum-newsletter", mode: "readwrite" });
      el.folder.textContent = dirHandle.name;
      el.folder.hidden = false;
      status("Folder set to " + dirHandle.name + ". Saving writes the issue folder inside it.");
    } catch (e) {
      /* The picker throws on cancel; that is not an error worth reporting. */
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


  /* ── LOCAL DRAFT ──────────────────────────────────────────
     One draft, in this browser, so a closed tab is not a lost afternoon. It is
     a convenience and not a store: the issue exists once it is saved to disk. */

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


  /* ── BOOT ─────────────────────────────────────────────── */

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
    /* The mirror scrolls with the text it sits under. */
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

    /* Ctrl/Cmd+B and +I, because muscle memory is real. */
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
