#!/usr/bin/env node
"use strict";

/*
  LIBRARY LYCEUM: TITLE SEPARATOR

  Replaces the em dash between page name and site name with a vertical rule,
  in the three places a page states its own title:

      <title>About &mdash; WEHS Library Lyceum</title>
      <meta property="og:title" content="About &mdash; WEHS Library Lyceum">
      <meta name="twitter:title" content="About &mdash; WEHS Library Lyceum">

  Nothing else is touched. An em dash inside a sentence stays an em dash: the
  about page's "anything&mdash;anything!" is prose, not a separator, and lives
  outside these three attributes.

  The match is deliberately narrow. Only a dash with a space on both sides
  counts, written either as the entity or as the literal character, and only
  inside the quoted content of one of those attributes or between the title
  tags. A page whose own title legitimately contains a dash keeps it.

  Dry run by default; --apply writes. Run from the repository root, or pass a
  directory:

      node build/fix-titles.js                 report what would change
      node build/fix-titles.js --apply         write it
      node build/fix-titles.js ../mla --apply  a satellite repository
*/

const fs = require("fs");
const path = require("path");

const SKIP = new Set([".git", "node_modules", "fonts", "img", "data"]);

const PATTERNS = [
  {
    what: "title",
    re: /(<title>)([^<]*)(<\/title>)/gi
  },
  {
    what: "og:title",
    re: /(<meta\s+property="og:title"\s+content=")([^"]*)(")/gi
  },
  {
    what: "twitter:title",
    re: /(<meta\s+name="twitter:title"\s+content=")([^"]*)(")/gi
  }
];

/* The separator, either spelling, with a space on each side. */
const SEP = /\s(?:&mdash;|—)\s/g;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const root = args.find(a => !a.startsWith("--")) || ".";

  if (!fs.existsSync(root)) {
    console.error(`No such directory: ${root}`);
    process.exit(2);
  }

  const files = walk(root, []);
  let changedFiles = 0;
  let changedTitles = 0;

  for (const file of files) {
    const before = fs.readFileSync(file, "utf8");
    let after = before;
    const notes = [];

    for (const p of PATTERNS) {
      after = after.replace(p.re, (whole, open, inner, close) => {
        SEP.lastIndex = 0;
        if (!SEP.test(inner)) return whole;
        const fixed = inner.replace(SEP, " | ");
        notes.push(`    ${p.what}: ${inner.trim()}\n         -> ${fixed.trim()}`);
        changedTitles++;
        return open + fixed + close;
      });
    }

    if (after !== before) {
      changedFiles++;
      console.log(path.relative(root, file) || file);
      console.log(notes.join("\n"));
      if (apply) fs.writeFileSync(file, after, "utf8");
    }
  }

  console.log("");
  if (changedTitles === 0) {
    console.log(`${files.length} files scanned. Nothing to change.`);
  } else if (apply) {
    console.log(`${changedTitles} titles rewritten across ${changedFiles} files.`);
  } else {
    console.log(`${changedTitles} titles in ${changedFiles} files would change. Re-run with --apply.`);
  }
}

main();
