(function () {
  'use strict';

  var AUDIENCE_LABELS = {
    students: 'For students',
    faculty: 'For faculty',
    both: 'For everyone'
  };

  // PLACEHOLDER: your standing colophon copy. Leave as an empty string to omit
  // the block entirely. Plain HTML, since it is injected into every issue.
  var COLOPHON_HTML = '';

  function splitFrontMatter(text) {
    var meta = {};
    var body = text;
    var m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
    if (m) {
      body = text.slice(m[0].length);
      m[1].split(/\r?\n/).forEach(function (line) {
        if (!line.trim() || /^\s*#/.test(line)) return;
        var i = line.indexOf(':');
        if (i < 0) return;
        var key = line.slice(0, i).trim();
        var val = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
        meta[key] = val;
      });
    }
    return { meta: meta, body: body };
  }

  function extractFootnotes(body) {
    var notes = [];
    var seen = {};
    body = body.replace(/^\[\^([^\]]+)\]:[ \t]*([\s\S]*?)(?=\n{2,}|\n\[\^|$)/gm,
      function (_, id, text) {
        seen[id] = notes.push({ id: id, text: text.trim() });
        return '';
      });
    var order = [];
    body = body.replace(/\[\^([^\]]+)\]/g, function (match, id) {
      if (!seen[id]) return match;
      var n = order.indexOf(id);
      if (n < 0) n = order.push(id) - 1;
      n += 1;
      return '<sup class="fn-ref" id="fnref-' + n + '"><a href="#fn-' + n +
        '" aria-label="Footnote ' + n + '">' + n + '</a></sup>';
    });
    var ordered = order.map(function (id) {
      return notes[seen[id] - 1];
    });
    return { body: body, notes: ordered };
  }

  function renderFootnotes(notes) {
    if (!notes.length) return '';
    var items = notes.map(function (note, i) {
      var n = i + 1;
      return '<li id="fn-' + n + '">' + window.marked.parseInline(note.text) +
        ' <a class="fn-back" href="#fnref-' + n + '" aria-label="Back to text">&#8617;</a></li>';
    }).join('');
    return '<section class="footnotes" aria-label="Footnotes"><ol>' + items + '</ol></section>';
  }

  function buildContents(container) {
    var headings = container.querySelectorAll('h2');
    if (headings.length < 2) return '';
    var items = [];
    Array.prototype.forEach.call(headings, function (h) {
      var raw = h.textContent;
      var gloss = '';
      var m = /\{([^}]*)\}\s*$/.exec(raw);
      if (m) {
        gloss = m[1].trim();
        h.textContent = raw.slice(0, m.index).trim();
      }
      var id = window.Lyceum.slug(h.textContent);
      h.id = id;
      items.push('<li><a href="#' + id + '">' + window.Lyceum.escHtml(h.textContent) + '</a>' +
        (gloss ? '<span class="gloss">: ' + window.Lyceum.escHtml(gloss) + '</span>' : '') + '</li>');
    });
    return '<div class="issue-contents" role="navigation" aria-label="Contents">' +
      '<h2>In this issue</h2><ol>' + items.join('') + '</ol></div>';
  }

  function formatDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!parts) return iso || '';
    var d = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
    return d.toLocaleDateString('en-US', {
      timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function fail(root, message) {
    root.innerHTML = '<p class="load-error">' + window.Lyceum.escHtml(message) + '</p>';
  }

  function init() {
    var root = document.getElementById('issue-root');
    if (!root) return;

    window.marked.use({ gfm: true, breaks: false });

    fetch('issue.md', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.text();
    }).then(function (text) {
      var parsed = splitFrontMatter(text);
      var meta = parsed.meta;
      var fn = extractFootnotes(parsed.body);

      var article = document.createElement('article');
      article.className = 'issue-body';
      article.innerHTML = window.marked.parse(fn.body);

      var contents = buildContents(article);
      var audience = (meta.audience || 'both').toLowerCase();

      var head = '<div class="issue-masthead">' +
        '<p class="issue-meta">' +
        (meta.number ? '<span>Issue ' + window.Lyceum.escHtml(meta.number) + '</span><span class="meta-sep" aria-hidden="true">&#183;</span>' : '') +
        '<span>' + window.Lyceum.escHtml(formatDate(meta.date)) + '</span>' +
        '<span class="audience-badge">' + window.Lyceum.escHtml(AUDIENCE_LABELS[audience] || AUDIENCE_LABELS.both) + '</span>' +
        '</p>' +
        '<h1>' + window.Lyceum.escHtml(meta.title || '') + '</h1>' +
        (meta.dek ? '<p class="issue-dek">' + window.Lyceum.escHtml(meta.dek) + '</p>' : '') +
        '</div>';

      root.innerHTML = head + contents;
      root.appendChild(article);
      root.insertAdjacentHTML('beforeend', renderFootnotes(fn.notes));
      if (COLOPHON_HTML) {
        root.insertAdjacentHTML('beforeend', '<div class="colophon">' + COLOPHON_HTML + '</div>');
      }

      renderIssueNav(meta.number);
    }).catch(function () {
      fail(root, 'Could not load issue.md. Ensure it sits beside this page, and note that this page must be served over http rather than opened directly from the file system.');
    });
  }

  function renderIssueNav(number) {
    var n = parseInt(number, 10);
    if (!n) return;
    fetch('../index.json', { cache: 'no-cache' }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (data) {
      if (!data || !data.issues) return;
      var list = data.issues.slice().sort(function (a, b) { return a.number - b.number; });
      var i = list.findIndex(function (x) { return x.number === n; });
      if (i < 0) return;
      var prev = list[i - 1];
      var next = list[i + 1];
      var html = '';
      html += prev ? '<a href="../' + prev.slug + '/"><span class="nav-label">Previous</span>' +
        window.Lyceum.escHtml(prev.title) + '</a>' : '<span></span>';
      html += next ? '<a href="../' + next.slug + '/"><span class="nav-label">Next</span>' +
        window.Lyceum.escHtml(next.title) + '</a>' : '<span></span>';
      var nav = document.createElement('div');
      nav.className = 'issue-nav';
      nav.setAttribute('role', 'navigation');
      nav.setAttribute('aria-label', 'Other issues');
      nav.innerHTML = html;
      document.getElementById('issue-root').appendChild(nav);
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', init);
})();
