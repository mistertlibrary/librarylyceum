
(function () {
  "use strict";

  function fail(root, message) {
    root.innerHTML = '<p class="load-error">' + window.Lyceum.escHtml(message) + "</p>";
  }

  function init() {
    var root = document.getElementById("issue-root");
    if (!root) return;

    window.marked.use({ gfm: true, breaks: false });

    fetch("issue.md", { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.text();
    }).then(function (text) {
      var out = window.LyceumIssue.render(text);
      root.innerHTML = out.html;
      renderIssueNav(out.meta.number);
    }).catch(function () {
      fail(root, "Could not load issue.md. Ensure it sits beside this page, and note " +
        "that this page must be served over http rather than opened directly from the " +
        "file system.");
    });
  }

  function renderIssueNav(number) {
    var n = parseInt(number, 10);
    if (!n) return;
    fetch("../index.json", { cache: "no-cache" }).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (data) {
      if (!data || !data.issues) return;
      var list = data.issues.slice().sort(function (a, b) { return a.number - b.number; });
      var i = list.findIndex(function (x) { return x.number === n; });
      if (i < 0) return;
      var prev = list[i - 1];
      var next = list[i + 1];
      if (!prev && !next) return;
      var html = "";
      html += prev ? '<a href="../' + prev.slug + '/"><span class="nav-label">Previous</span>' +
        window.Lyceum.escHtml(prev.title) + "</a>" : "<span></span>";
      html += next ? '<a href="../' + next.slug + '/"><span class="nav-label">Next</span>' +
        window.Lyceum.escHtml(next.title) + "</a>" : "<span></span>";
      var nav = document.createElement("div");
      nav.className = "issue-nav";
      nav.setAttribute("role", "navigation");
      nav.setAttribute("aria-label", "Other issues");
      nav.innerHTML = html;
      document.getElementById("issue-root").appendChild(nav);
    }).catch(function () {});
  }

  document.addEventListener("DOMContentLoaded", init);
})();
