(function () {
  'use strict';

  var AUDIENCE_LABELS = {
    students: 'For students',
    faculty: 'For faculty',
    both: 'For everyone'
  };

  var issues = [];
  var state = { q: '', audience: 'all' };

  function formatDate(iso) {
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!parts) return iso || '';
    var d = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3]));
    return d.toLocaleDateString('en-US', {
      timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function matches(issue) {
    if (state.audience !== 'all') {
      if (issue.audience !== state.audience && issue.audience !== 'both') return false;
    }
    if (!state.q) return true;
    var hay = [issue.title, issue.dek, (issue.tags || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(state.q) > -1;
  }


  var NOT_YET  = 'The first issue is still being written.';
  var NO_MATCH = 'No issues match that search.';

  function render() {
    var list = document.getElementById('archive-list');
    var status = document.getElementById('archive-status');
    var visible = issues.filter(matches);

    if (!visible.length) {
      list.innerHTML = '';
      status.textContent = issues.length ? NO_MATCH : NOT_YET;
      return;
    }

    status.innerHTML = visible.length === issues.length
      ? ''
      : 'Showing <strong>' + visible.length + '</strong> of <strong>' + issues.length + '</strong> issues';

    list.innerHTML = visible.map(function (issue) {
      var esc = window.Lyceum.escHtml;
      return '<li class="archive-item">' +
        '<p class="archive-meta">' +
        (issue.number ? '<span>Issue ' + esc(String(issue.number)) + '</span><span class="meta-sep" aria-hidden="true">&#183;</span>' : '') +
        '<span>' + esc(formatDate(issue.date)) + '</span>' +
        '<span class="audience-badge">' + esc(AUDIENCE_LABELS[issue.audience] || AUDIENCE_LABELS.both) + '</span>' +
        '</p>' +
        '<h2><a href="issues/' + esc(issue.slug) + '/">' + esc(issue.title) + '</a></h2>' +
        (issue.dek ? '<p class="archive-dek">' + esc(issue.dek) + '</p>' : '') +
        '</li>';
    }).join('');
  }

  function writeUrl() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.audience !== 'all') params.set('for', state.audience);
    var qs = params.toString();
    history.replaceState(null, '', qs ? '?' + qs : location.pathname);
  }

  function readUrl() {
    var params = new URLSearchParams(location.search);
    state.q = (params.get('q') || '').toLowerCase();
    state.audience = params.get('for') || 'all';
  }

  function init() {
    var search = document.getElementById('archive-search');
    var select = document.getElementById('archive-audience');

    readUrl();
    if (search) search.value = state.q;
    if (select) select.value = state.audience;

    if (search) {
      search.addEventListener('input', window.Lyceum.debounce(function () {
        state.q = search.value.trim().toLowerCase();
        render();
        writeUrl();
      }, 120));
    }

    if (select) {
      select.addEventListener('change', function () {
        state.audience = select.value;
        render();
        writeUrl();
      });
    }

    fetch('issues/index.json', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }).then(function (data) {
      issues = (data.issues || []).slice().sort(function (a, b) {
        return b.number - a.number;
      });
      render();
    }).catch(function () {
      document.getElementById('archive-status').textContent =
        'Could not load issues/index.json. Ensure it is in place, and note that this page must be served over http rather than opened directly from the file system.';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
