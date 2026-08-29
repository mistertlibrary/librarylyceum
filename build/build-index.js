#!/usr/bin/env node
/* LIBRARY LYCEUM: SEARCH INDEX BUILDER
 *
 * Reads every collection in the Lyceum and writes one committed
 * search-index.json. search.html loads that single file and queries it with the
 * already-vendored Fuse.
 *
 *   node build-index.js            write search-index.json
 *   node build-index.js --check    rebuild in memory, report if the committed
 *                                  file is stale, write nothing, exit 1
 *
 * SOURCES
 *
 *   databases.csv                 -> type "database"
 *   guides.csv                    -> type "guide"
 *   newsletter/issues/index.json  -> type "issue"
 *
 * The index is built rather than fetched at page load so that search never
 * depends on a collection being reachable at the moment a student searches.
 * Later phases add records without changing this contract: guide sections
 * (type "section", carrying `parent`) once satellites publish lyceum.json, and
 * database annotations once databases/<slug>/notes.md exists. Each phase
 * deepens search as a side effect rather than as separate work.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "search-index.json");
const mode = process.argv.includes("--check") ? "check" : "write";

const warnings = [];


/* ── CSV ──────────────────────────────────────────────── */

/* Minimal RFC 4180 reader: quoted fields, escaped quotes, embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;

  text = text.replace(/^﻿/, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }

  const header = rows.shift().map(h => h.trim());
  return rows.map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] || "").trim(); });
    return o;
  });
}

const pipeList = s => String(s || "").split("|").map(x => x.trim()).filter(Boolean);


/* ── COLLECTIONS ──────────────────────────────────────── */

function readDatabases() {
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, "data", "databases.csv"), "utf8"));
  const seen = new Set();
  const out = [];

  for (const r of rows) {
    const title = r.Name, url = r.URL;
    if (!title || !url) { warnings.push(`databases.csv: row missing name or URL (${title || "?"})`); continue; }
    const key = title.toLowerCase();
    if (seen.has(key)) { warnings.push(`databases.csv: duplicate name "${title}"`); continue; }
    seen.add(key);

    out.push({
      type: "database",
      title,
      url,
      external: true,
      text: r.Description || "",
      subjects: pipeList(r.Subjects),
      primary: r.Primary || ""
    });
  }
  return out;
}

function readGuides() {
  const rows = parseCsv(fs.readFileSync(path.join(ROOT, "data", "guides.csv"), "utf8"));
  const seen = new Set();
  const out = [];

  for (const r of rows) {
    const title = r.Title, url = r.URL;
    if (!title || !url) { warnings.push(`guides.csv: row missing title or URL (${title || "?"})`); continue; }
    const key = title.toLowerCase();
    if (seen.has(key)) { warnings.push(`guides.csv: duplicate title "${title}"`); continue; }
    seen.add(key);

    out.push({
      type: "guide",
      title,
      url,
      external: /^https?:/i.test(url),
      text: r.Description || "",
      subjects: pipeList(r.Subjects),
      series: r.Series || "",
      course: r.Course || ""
    });
  }
  return out;
}


/* Classroom tools.
 *
 * Unlike the collections, this one has no CSV behind it: the prose on
 * tools.html is the source, hand-written and not tabular. Rather than keep a
 * second copy that could drift, the page is parsed. Each <article class="tool">
 * yields one record, deep-linked to its own id, with the "What it does" text as
 * the summary and everything else on the card folded into what Fuse can reach.
 * If the markup on that page changes shape, this returns nothing and the count
 * drops — which --check will surface rather than swallow. */
function readTools() {
  const file = path.join(ROOT, "tools.html");
  if (!fs.existsSync(file)) { warnings.push("tools.html not found; no tool records"); return []; }
  const html = fs.readFileSync(file, "utf8");

  const strip = h => h
    .replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsquo;/g, "\u2019")
    .replace(/&middot;/g, "\u00b7").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();

  const field = (card, label) => {
    const re = new RegExp('<span class="tool-field-label">' + label + "</span>([\\s\\S]*?)</div>");
    const m = re.exec(card);
    return m ? strip(m[1]) : "";
  };

  /* The page's identity and its keywords come from a descriptor, in the same
     shape the guide repositories publish, so a product name can stay a product
     name and still be found by what the thing does. Absent, the page still
     indexes; the lever is simply unavailable. */
  let desc = {};
  const dfile = path.join(ROOT, "tools.lyceum.json");
  if (fs.existsSync(dfile)) {
    try {
      const d = JSON.parse(fs.readFileSync(dfile, "utf8"));
      if (d.lyceum !== 1) warnings.push(`tools.lyceum.json: unexpected schema version ${d.lyceum}`);
      else for (const s of (d.sections || [])) if (s && s.anchor) desc[s.anchor.replace(/^#/, "")] = s;
    } catch (e) { warnings.push("tools.lyceum.json is not valid JSON: " + e.message); }
  } else {
    warnings.push("no tools.lyceum.json; tool records carry no keywords");
  }

  const out = [];
  const cards = html.match(/<article class="tool"[\s\S]*?<\/article>/g) || [];
  for (const card of cards) {
    const id    = (/<article class="tool" id="([^"]+)"/.exec(card) || [])[1];
    const title = strip((/<h2 class="tool-name">([\s\S]*?)<\/h2>/.exec(card) || [])[1] || "");
    if (!id || !title) { warnings.push("tools.html: a card is missing its id or name"); continue; }
    out.push({
      type: "tool",
      title,
      url: "tools.html#" + id,
      external: false,
      text: field(card, "What it does"),
      band: strip((/<span class="tool-band">([\s\S]*?)<\/span>/.exec(card) || [])[1] || ""),
      vendor: strip((/<span class="tool-vendor">([\s\S]*?)<\/span>/.exec(card) || [])[1] || ""),
      /* Not shown in a result, but a teacher searching "flipped" or "retrieval"
         should still land on the right card. */
      keywords: (desc[id] && Array.isArray(desc[id].keywords)) ? desc[id].keywords.map(String) : [],
      sectionText: [field(card, "In the classroom"),
                    strip((/<p class="tool-quote">([\s\S]*?)<\/p>/.exec(card) || [])[1] || "")]
                   .filter(Boolean).join(" ")
    });
  }
  if (!out.length) warnings.push("tools.html parsed but yielded no records");
  return out;
}


/* Satellite descriptors.
 *
 * Each guide repository publishes lyceum.json at its root. We read it from the
 * sibling directory rather than fetching it over the network: the guides live
 * beside this one in the same parent folder, a local read works offline, and it
 * keeps the build free of any runtime dependency on a site being reachable.
 *
 * A guide with no sibling directory, or no descriptor in it, is not an error —
 * it simply stays indexed at guide level, which is what happened before
 * descriptors existed. Warnings say which.
 *
 * Sections are attached to their parent guide record rather than emitted as
 * peers of it. Thirty-seven sections listed alongside seventy-four databases
 * would swamp a result list with near-identical rows; carried on the guide,
 * they show a student which part of a guide matched without fragmenting the
 * guide itself. */
function attachSections(guides) {
  let withSections = 0, sectionCount = 0;

  for (const g of guides) {
    const slug = g.url.replace(/\/+$/, "").split("/").pop();
    if (!slug) continue;

    const file = path.join(ROOT, "..", slug, "lyceum.json");
    if (!fs.existsSync(file)) {
      warnings.push(`no descriptor for "${g.title}" (looked for ../${slug}/lyceum.json)`);
      continue;
    }

    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { warnings.push(`../${slug}/lyceum.json is not valid JSON: ${e.message}`); continue; }

    if (doc.lyceum !== 1) {
      warnings.push(`../${slug}/lyceum.json has unexpected schema version ${doc.lyceum}`);
      continue;
    }

    const sections = (doc.sections || [])
      .filter(s => s && s.title && s.anchor)
      .map(s => ({
        title: String(s.title),
        anchor: String(s.anchor),
        /* keywords never render; they exist so an evocative title stays
           evocative and still gets found. */
        keywords: Array.isArray(s.keywords) ? s.keywords.filter(Boolean).map(String) : []
      }));

    if (!sections.length) continue;

    g.sections = sections;
    /* Fold section titles and keywords into the guide's searchable text so a
       query matching any section surfaces the guide that contains it. */
    g.sectionText = sections
      .map(s => [s.title].concat(s.keywords).join(" "))
      .join(" ");

    withSections++;
    sectionCount += sections.length;
  }

  return { withSections, sectionCount };
}

function readIssues() {
  const file = path.join(ROOT, "newsletter", "issues", "index.json");
  if (!fs.existsSync(file)) { warnings.push("newsletter/issues/index.json not found"); return []; }

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { warnings.push("newsletter/issues/index.json is not valid JSON: " + e.message); return []; }

  const out = [];
  for (const i of manifest.issues || []) {
    if (!i.slug || !i.title) { warnings.push(`newsletter manifest: issue missing slug or title`); continue; }
    out.push({
      type: "issue",
      title: i.title,
      url: `newsletter/issues/${i.slug}/`,
      external: false,
      text: i.dek || "",
      subjects: [],
      number: i.number,
      date: i.date || "",
      audience: i.audience || "both",
      tags: Array.isArray(i.tags) ? i.tags : []
    });
  }
  return out;
}


/* ── BUILD ────────────────────────────────────────────── */

const guides = readGuides();
const sectionStats = attachSections(guides);

const records = [
  ...readDatabases(),
  ...guides,
  ...readTools(),
  ...readIssues()
];

const counts = records.reduce((a, r) => { a[r.type] = (a[r.type] || 0) + 1; return a; }, {});

const index = {
  "_comment": "Generated by build-index.js. Do not edit by hand; edit the source collections and rebuild.",
  generated: new Date().toISOString().slice(0, 10),
  counts,
  records
};

const json = JSON.stringify(index, null, 2) + "\n";

for (const w of warnings) console.log("warning: " + w);

if (mode === "check") {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  /* `generated` changes daily; compare only the records themselves. */
  const strip = s => { try { const o = JSON.parse(s); return JSON.stringify(o.records); } catch (e) { return null; } };
  if (strip(current) !== JSON.stringify(records)) {
    console.error("\nsearch-index.json is stale. Run: node build.js");
    process.exit(1);
  }
  console.log(`search-index.json is current — ${records.length} records, `
              + `${sectionStats.sectionCount} sections.`);
} else {
  fs.writeFileSync(OUT, json, "utf8");
  console.log(
    `\nsearch-index.json written — ${records.length} records ` +
    `(${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}), ` +
    `plus ${sectionStats.sectionCount} sections on ${sectionStats.withSections} guide(s).`
  );
}

if (warnings.length) console.log(`${warnings.length} warning(s) above.`);

/* ── SITEMAP AND ROBOTS ───────────────────────────────────
   A public library resource that search engines cannot enumerate is a library
   with the lights off. Both files are generated here rather than by a script of
   their own: this step already knows every page and every newsletter issue.

   Only pages that belong in an index are listed. The drafting desk is not a
   destination — it carries a noindex meta tag and is left out, as is 404.html.
   Each guide keeps its own URL under its own repository; the sitemap lists them
   because the hub is what points a crawler at them. */

const SITE = "https://mistertlibrary.github.io/librarylyceum";

function lastModified(rel) {
  const file = path.join(ROOT, rel);
  try { return fs.statSync(file).mtime.toISOString().slice(0, 10); }
  catch (e) { return null; }
}

function buildSitemap() {
  const pages = [
    { loc: "/",                 file: "index.html",           priority: "1.0" },
    { loc: "/databases.html",   file: "databases.html",       priority: "0.9" },
    { loc: "/guides.html",      file: "guides.html",          priority: "0.9" },
    { loc: "/tools.html",       file: "tools.html",           priority: "0.8" },
    { loc: "/search.html",      file: "search.html",          priority: "0.6" },
    { loc: "/about.html",       file: "about.html",           priority: "0.5" },
    { loc: "/newsletter/",      file: "newsletter/index.html", priority: "0.7" },
  ];

  /* Reuse the issue records already gathered above rather than re-reading the
     manifest, which would double every warning it produces. */
  for (const issue of records.filter(r => r.type === "issue")) {
    pages.push({
      loc: "/" + issue.url,
      file: issue.url + "index.html",
      priority: "0.6",
      date: issue.date || null
    });
  }

  const entries = pages.map(p => {
    const mod = p.date || lastModified(p.file);
    return "  <url>\n" +
           `    <loc>${SITE}${p.loc}</loc>\n` +
           (mod ? `    <lastmod>${mod}</lastmod>\n` : "") +
           `    <priority>${p.priority}</priority>\n` +
           "  </url>";
  }).join("\n");

  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
         '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
         entries + "\n</urlset>\n";
}

/* No Disallow lines, deliberately, and for two reasons.

   The mechanism is wrong. Disallow stops a crawler fetching a page; it does not
   stop the page being indexed from a link elsewhere, and a page a crawler may
   not fetch is a page whose noindex it can never read. Google's own guidance is
   that the two must not be combined: to keep a page out of results, let it be
   crawled and let it say noindex. The drafting desk does exactly that.

   And robots.txt is public. Listing a page here as one nobody should visit is a
   short directory of the interesting parts of a site — which would undo the
   point of giving that page an unobvious name in the first place. */

const ROBOTS = [
  "# West Essex High School Library Lyceum",
  "User-agent: *",
  "Allow: /",
  "",
  `Sitemap: ${SITE}/sitemap.xml`,
  ""
].join("\n");

const SITEMAP_OUT = path.join(ROOT, "sitemap.xml");
const ROBOTS_OUT = path.join(ROOT, "robots.txt");

const sitemap = buildSitemap();
const staleFiles = [];

for (const [file, contents] of [[SITEMAP_OUT, sitemap], [ROBOTS_OUT, ROBOTS]]) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (current === contents) continue;
  if (mode === "check") { staleFiles.push(path.basename(file)); continue; }
  fs.writeFileSync(file, contents, "utf8");
  console.log(`${path.basename(file)} written.`);
}

if (mode === "check" && staleFiles.length) {
  console.error(`${staleFiles.join(" and ")} stale. Run: node build/build.js`);
  process.exit(1);
}

