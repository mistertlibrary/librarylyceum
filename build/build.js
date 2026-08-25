#!/usr/bin/env node
/* LIBRARY LYCEUM: BUILD
 *
 * One command for the whole site.
 *
 *   node build.js            regenerate everything, then validate
 *   node build.js --check    validate only; write nothing; exit 1 if anything
 *                            is stale, drifted, or broken
 *   node build.js --links    also check every external URL (slow, needs the
 *                            network, and should be run on the school network
 *                            as well as off it, since EBSCO profile links can
 *                            resolve differently on and off campus)
 *
 * The individual scripts still run on their own if you want to work on one
 * thing in isolation. This exists so you do not have to remember the set or the
 * order.
 *
 *   build-chrome.js    shared header, footer, nav, panel -> every page
 *   build-index.js     the collections -> search-index.json
 *   check-issues.js    newsletter front matter vs. the manifest
 *   test-prefs.js      the preference shim, against every guide's storage shape
 *   check-links.js     every URL in databases.csv and guides.csv
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
const links = process.argv.includes("--links");

/* Generators accept --check and report staleness rather than writing.
   Validators only ever read, so they run identically in both modes. */
const STEPS = [
  { script: "build-chrome.js", label: "chrome",     passCheck: true },
  { script: "build-index.js",  label: "search index", passCheck: true },
  { script: "check-issues.js", label: "newsletter", passCheck: false },
  { script: "test-prefs.js",   label: "preferences", passCheck: false },
];

if (links) STEPS.push({ script: "check-links.js", label: "links", passCheck: false });

const width = STEPS.reduce((n, s) => Math.max(n, s.label.length), 0);
const results = [];

console.log(check ? "Checking the Lyceum\n" : "Building the Lyceum\n");

for (const step of STEPS) {
  const args = [path.join(HERE, step.script)];
  if (check && step.passCheck) args.push("--check");

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
