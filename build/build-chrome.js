#!/usr/bin/env node
/* LIBRARY LYCEUM: CHROME BUILDER
 *
 * Injects the canonical shared chrome from chrome/ into every HTML file that
 * carries the marker comments. Output is committed; the deployed site never
 * builds anything.
 *
 *   node build-chrome.js            rewrite files in place
 *   node build-chrome.js --check    report drift, write nothing, exit 1 if any
 *   node build-chrome.js --diff     print a unified diff of what would change
 *
 * MARKERS
 *
 *   <!-- lyceum:head -->        ... <!-- /lyceum:head -->
 *   <!-- lyceum:skiplink target="#main-content" --> ... <!-- /lyceum:skiplink -->
 *   <!-- lyceum:a11y -->        ... <!-- /lyceum:a11y -->
 *   <!-- lyceum:header page="databases" --> ... <!-- /lyceum:header -->
 *   <!-- lyceum:footer -->      ... <!-- /lyceum:footer -->
 *
 * Attributes on the opening marker are preserved. Everything between the
 * markers is generated and must not be hand-edited.
 *
 * Relative asset paths are rewritten per file depth, so a page at
 * newsletter/issues/<slug>/ receives ../../../ automatically. The fonts
 * stylesheet is the one exception: it uses a single canonical absolute path
 * (chrome.json -> fontsUrl) so that every page in the Lyceum network shares
 * one cache entry rather than re-downloading ~200KB per site.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CHROME_DIR = path.join(ROOT, "chrome");
const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "chrome", ".cache"]);

const mode =
  process.argv.includes("--check") ? "check" :
  process.argv.includes("--diff")  ? "diff"  : "write";


/* ── CONFIG ───────────────────────────────────────────── */

const cfg = JSON.parse(fs.readFileSync(path.join(CHROME_DIR, "chrome.json"), "utf8"));

function partial(name) {
  return fs.readFileSync(path.join(CHROME_DIR, name), "utf8").replace(/\n$/, "");
}

const PARTIALS = {
  head:     partial("head.html"),
  skiplink: partial("skiplink.html"),
  a11y:     partial("a11y-panel.html"),
  header:   partial("header.html"),
  footer:   partial("footer.html")
};


/* ── HELPERS ──────────────────────────────────────────── */

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* Asset prefix for a file relative to the repo root: "" | "../" | "../../../"
 *
 * Files listed in chrome.json -> absoluteBaseFiles instead receive the
 * site-root path. 404.html is the case that matters: GitHub Pages serves it in
 * place of any missing URL, at any depth, so a relative prefix computed from
 * its own location would resolve wrongly for a visitor who mistyped a deep
 * path. Getting this wrong yields an unstyled, unnavigable 404. */
function basePrefix(relFile) {
  const posix = relFile.split(path.sep).join("/");
  if ((cfg.absoluteBaseFiles || []).includes(posix)) return cfg.absoluteBase;
  const depth = path.dirname(relFile).split(path.sep).filter(p => p && p !== ".").length;
  return "../".repeat(depth);
}

/* Parse key="value" pairs off an opening marker. */
function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = m[2];
  return attrs;
}

function buildNav(base, activePage) {
  return cfg.nav.map(item => {
    const isActive = item.id === activePage;
    const cls  = isActive ? ' class="active"' : "";
    const curr = isActive ? ' aria-current="page"' : "";
    return `      <a href="${escAttr(base + item.href)}"${cls}${curr}>${item.label}</a>`;
  }).join("\n");
}

function render(block, base, attrs) {
  let out = PARTIALS[block];

  /* A page with its own search field gets a second skip link. Both are
   * off-screen until focused and share one focused position, so only the
   * focused link is ever visible and no extra CSS is needed. The label must
   * describe the destination: a link announced as "skip to main content" that
   * drops the reader into a form field is a mislabelled control. */
  const searchLink = attrs.search
    ? `\n  <a class="skip-link" href="${escAttr(attrs.search)}">Skip to search</a>`
    : "";

  const subs = {
    base:           base,
    fonts:          cfg.fontsUrl,
    dyslexicFonts:  cfg.fontsUrl.replace("lyceum-fonts.css", "lyceum-dyslexic.css"),
    target:         attrs.target || "#main-content",
    searchLink:     searchLink,
    brandHomeHref:  cfg.brand.homeHref,
    brandAriaLabel: cfg.brand.ariaLabel,
    brandSchool:    cfg.brand.school,
    brandName:      cfg.brand.name,
    footerName:     cfg.footer.name,
    footerSchool:   cfg.footer.school,
    contactEmail:   cfg.footer.contactEmail,
    contactName:    cfg.footer.contactName,
    nav:            block === "header" ? buildNav(base, attrs.page || "") : ""
  };

  out = out.replace(/\{\{(\w+)\}\}/g, (full, key) => {
    if (!(key in subs)) throw new Error(`Unknown placeholder {{${key}}} in ${block}.html`);
    return subs[key];
  });

  return out;
}


/* ── FILE WALK ────────────────────────────────────────── */

function htmlFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") {
      if (SKIP_DIRS.has(entry.name)) continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      htmlFiles(full, acc);
    } else if (entry.name.endsWith(".html")) {
      acc.push(full);
    }
  }
  return acc;
}


/* ── TRANSFORM ────────────────────────────────────────── */

function processFile(absFile) {
  const rel  = path.relative(ROOT, absFile);
  const base = basePrefix(rel);
  const src  = fs.readFileSync(absFile, "utf8");

  let out = src;
  let blocksFound = 0;

  for (const block of Object.keys(PARTIALS)) {
    const re = new RegExp(
      `([ \\t]*<!--\\s*lyceum:${block}([^>]*?)-->)([\\s\\S]*?)([ \\t]*<!--\\s*/lyceum:${block}\\s*-->)`,
      "g"
    );

    out = out.replace(re, (full, open, rawAttrs, _body, close) => {
      blocksFound++;
      const attrs = parseAttrs(rawAttrs);
      const rendered = render(block, base, attrs);
      return `${open}\n${rendered}\n${close}`;
    });
  }

  return { rel, src, out, blocksFound, changed: src !== out };
}


/* ── DIFF ─────────────────────────────────────────────── */

function unifiedDiff(rel, a, b) {
  const al = a.split("\n"), bl = b.split("\n");
  const lines = [];
  let i = 0, j = 0;
  while (i < al.length || j < bl.length) {
    if (al[i] === bl[j]) { i++; j++; continue; }
    // find resync point
    let k = 1, sync = null;
    while (k < 60 && !sync) {
      if (bl[j + k] !== undefined && al[i] === bl[j + k]) sync = { di: 0, dj: k };
      else if (al[i + k] !== undefined && al[i + k] === bl[j]) sync = { di: k, dj: 0 };
      else k++;
    }
    if (!sync) sync = { di: al.length - i, dj: bl.length - j };
    for (let x = 0; x < sync.di; x++) lines.push(`  -  ${al[i + x]}`);
    for (let x = 0; x < sync.dj; x++) lines.push(`  +  ${bl[j + x]}`);
    i += sync.di; j += sync.dj;
  }
  return lines.length ? `\n--- ${rel}\n${lines.join("\n")}` : "";
}


/* ── MAIN ─────────────────────────────────────────────── */

const files = htmlFiles(ROOT).sort();
let changed = 0, touched = 0, skipped = [];

for (const abs of files) {
  const r = processFile(abs);

  if (r.blocksFound === 0) { skipped.push(r.rel); continue; }
  touched++;

  if (!r.changed) continue;
  changed++;

  if (mode === "write") {
    fs.writeFileSync(abs, r.out, "utf8");
    console.log(`updated  ${r.rel}  (${r.blocksFound} blocks)`);
  } else if (mode === "check") {
    console.log(`DRIFT    ${r.rel}`);
  } else {
    console.log(unifiedDiff(r.rel, r.src, r.out));
  }
}

console.log(
  `\nchrome ${cfg.version} — ${touched} file(s) carry markers, ` +
  `${changed} ${mode === "write" ? "rewritten" : "would change"}, ${skipped.length} without markers.`
);

if (skipped.length) console.log("no markers: " + skipped.join(", "));

if (mode === "check" && changed > 0) {
  console.error("\nChrome is stale. Run: node build.js");
  process.exit(1);
}
