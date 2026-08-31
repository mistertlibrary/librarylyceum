#!/usr/bin/env node
/* LIBRARY LYCEUM: BUILD
 *
 * One command for the whole site.
 *
 *   node build.js                  regenerate everything, then validate
 *   node build.js --check          validate only; write nothing; exit 1 if
 *                                  anything is stale, drifted, or broken
 *   node build.js --allow-shrink   accept that a collection has fewer rows
 *                                  than last time, because you removed them
 *
 * The individual scripts still run on their own if you want to work on one
 * thing in isolation. This exists so you do not have to remember the set or the
 * order.
 *
 *   check-csv.js       the collections themselves, before anything reads them
 *   build-chrome.js    shared header, footer, nav, panel -> every page
 *   build-index.js     the collections -> search-index.json
 *   check-issues.js    newsletter front matter vs. the manifest
 *   test-prefs.js      the preference shim, against every guide's storage shape
 *
 * Link checking is deliberately not here. It lives in build/Check-Links.ps1,
 * which runs on the work machine — where Node does not — and which has to be
 * run twice anyway, on the school network and off it.
 *
 * Nothing here runs at deploy time. Output is committed; the served site is the
 * repository exactly as it sits.
 */

"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");   /* the repository root, one level up */
const HERE = __dirname;                    /* build/, where the scripts live */
const check = process.argv.includes("--check");
const allowShrink = process.argv.includes("--allow-shrink");

/* Generators accept --check and report staleness rather than writing.
   Validators only ever read, so they run identically in both modes. */
/* check-csv.js runs first and everything else depends on it. build-index.js is
   deliberately forgiving — a row missing a URL is warned about and skipped, and
   the index is still written — so a damaged spreadsheet would otherwise produce
   a smaller site rather than an error. The gate goes before the generators, not
   beside them. */
const STEPS = [
  { script: "check-csv.js",    label: "collections",  passCheck: true, passShrink: true },
  { script: "build-chrome.js", label: "chrome",     passCheck: true },
  { script: "build-index.js",  label: "search index", passCheck: true },
  { script: "check-issues.js", label: "newsletter", passCheck: false },
  { script: "test-prefs.js",   label: "preferences", passCheck: false },
];

const width = STEPS.reduce((n, s) => Math.max(n, s.label.length), 0);
const results = [];

console.log(check ? "Checking the Lyceum\n" : "Building the Lyceum\n");

for (const step of STEPS) {
  const args = [path.join(HERE, step.script)];
  if (check && step.passCheck) args.push("--check");
  if (allowShrink && step.passShrink) args.push("--allow-shrink");

  const run = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });

  const out = ((run.stdout || "") + (run.stderr || ""))
    .split("\n")
    .filter(line => line.trim())
    .map(line => "    " + line)
    .join("\n");

  const failed = run.status !== 0;
  results.push({ label: step.label, failed });

  console.log(`  ${failed ? "FAIL" : "ok  "}  ${step.label}`);
  if (out) console.log(out);
  console.log("");
}

const failures = results.filter(r => r.failed);

if (failures.length) {
  console.error(
    `${failures.length} step(s) failed: ${failures.map(f => f.label).join(", ")}` +
    (check ? "\nRun: node build.js" : "")
  );
  process.exit(1);
}

console.log(
  check
    ? "Everything is current."
    : "Build complete. Review the diff, then commit."
);
