#!/usr/bin/env node
/* Exercises lyceum-prefs.js against a simulated localStorage for every guide,
   in both directions, including the cases the shim is meant to refuse. */

"use strict";

const fs = require("fs");
const vm = require("vm");
const SRC = fs.readFileSync(require("path").join(__dirname, "..", "lyceum-prefs.js"), "utf8");

let pass = 0, fail = 0;

function makeStore(seed) {
  const data = Object.assign({}, seed);
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; }
  };
}

/* Run the shim as a given guide against a seeded store, then hand back the
   store so a test can inspect it and go on writing through it. */
function run(guide, seed, settle = true) {
  const store = makeStore(seed);
  const tag = { getAttribute: n => (n === "data-guide" ? guide : null) };
  const listeners = [];
  const ctx = {
    window: { localStorage: store },
    document: {
      currentScript: tag,
      querySelectorAll: () => [tag],
      readyState: "loading",
      addEventListener: (evt, fn) => { if (evt === "DOMContentLoaded") listeners.push(fn); }
    }
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);

  /* The shim mirrors writes only after the document is parsed, so that a
     guide's own start-up defaults are not mistaken for a reader's choice.
     Tests that exercise the write path have to reach that point first. */
  store.settle = () => { ctx.document.readyState = "interactive"; listeners.forEach(fn => fn()); };
  if (settle) store.settle();
  return store;
}

function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}\n          expected ${e}\n          actual   ${a}`); }
}

function blob(store) {
  try { return JSON.parse(store.getItem("cs_a11y") || "{}"); } catch (e) { return {}; }
}


console.log("\nHUB -> GUIDE  (a stored network choice reaches each guide's own keys)\n");

{
  const s = run("mla", { "lyceum-size": "large", "lyceum-font": "dyslexic", "lyceum-theme": "dark" });
  check("mla blob translated", blob(s), { size: "l", font: "dys", theme: "dark" });
}
{
  const s = run("rbgettingstarted", { "lyceum-size": "medium", "lyceum-theme": "contrast" });
  check("rbgettingstarted size", s.getItem("gs_size"), "m");
  check("rbgettingstarted theme", s.getItem("gs_theme"), "contrast");
  check("rbgettingstarted font untouched", s.getItem("gs_font"), null);
}
{
  const s = run("annotation", { "lyceum-size": "large", "lyceum-font": "dyslexic", "lyceum-theme": "dark" });
  check("annotation numeric size", s.getItem("ann_size"), "3");
  check("annotation font spelling", s.getItem("ann_font"), "dyslexia");
  check("annotation theme", s.getItem("ann_theme"), "dark");
}
{
  const s = run("imageclearinghouse", { "lyceum-font": "dyslexic", "lyceum-size": "small" });
  check("clearinghouse refuses a face it lacks", s.getItem("ic_font"), null);
  check("clearinghouse still takes size", s.getItem("ic_size"), "s");
}
{
  const s = run("babel", { "lyceum-theme": "dark", "lyceum-size": "large" });
  check("babel takes theme", s.getItem("cat-theme"), "dark");
  check("babel has no size key", s.getItem("cat-size"), null);
}


console.log("\nGUIDE -> HUB  (a choice made on a guide becomes the network choice)\n");

{
  const s = run("annotation", {});
  s.setItem("ann_size", "2");
  s.setItem("ann_font", "dyslexia");
  s.setItem("ann_theme", "contrast");
  check("annotation size mirrored", s.getItem("lyceum-size"), "medium");
  check("annotation font mirrored", s.getItem("lyceum-font"), "dyslexic");
  check("annotation contrast preserved", s.getItem("lyceum-theme"), "contrast");
}
{
  const s = run("apa", {});
  s.setItem("cs_a11y", JSON.stringify({ size: "s", theme: "dark", font: "sans" }));
  check("blob write mirrored", [s.getItem("lyceum-size"), s.getItem("lyceum-theme"), s.getItem("lyceum-font")],
        ["small", "dark", "sans"]);
}
{
  const s = run("rbsearchesandsources", {});
  s.setItem("rb_theme", "dark");
  check("rb_ write mirrored", s.getItem("lyceum-theme"), "dark");
  /* gs_ on this guide is worksheet-field storage, not a preference. */
  s.setItem("gs_theme", "light");
  check("gs_ on this guide is not a preference", s.getItem("lyceum-theme"), "dark");
}


console.log("\nSEEDING  (an established local choice is adopted, not overwritten)\n");

{
  const s = run("annotation", { "ann_size": "3", "ann_theme": "contrast" });
  check("hub seeded from guide", [s.getItem("lyceum-size"), s.getItem("lyceum-theme")], ["large", "contrast"]);
  check("guide value left alone", s.getItem("ann_size"), "3");
}
{
  const s = run("mla", { "lyceum-size": "small", "cs_a11y": JSON.stringify({ size: "l" }) });
  check("hub wins when both exist", blob(s).size, "s");
}
{
  const s = run("babel", {});
  check("babel time-of-day default preserved", s.getItem("cat-theme"), null);
}


console.log("\nNON-PREFERENCE KEYS  (everything else passes through untouched)\n");

{
  const s = run("mla", {});
  s.setItem("cs_cg", JSON.stringify({ score: 7 }));
  s.setItem("wehs.covers.v3", "{}");
  s.setItem("gs_rq_c4", "1");
  s.setItem("ann_annotations", "1");
  check("citation game state stored", s.getItem("cs_cg"), JSON.stringify({ score: 7 }));
  check("no hub keys invented", [s.getItem("lyceum-size"), s.getItem("lyceum-font"), s.getItem("lyceum-theme")],
        [null, null, null]);
}


console.log("\nHOSTILE INPUT  (nothing here may throw)\n");

{
  const s = run("mla", { "cs_a11y": "{not json" });
  check("malformed blob survived", typeof s.getItem("cs_a11y"), "string");
  s.setItem("cs_a11y", "still not json");
  check("malformed write still stored", s.getItem("cs_a11y"), "still not json");
  check("hub not corrupted", s.getItem("lyceum-size"), null);
}
{
  const s = run("mla", { "lyceum-size": "gigantic" });
  check("unknown hub value ignored", blob(s).size, undefined);
}
{
  const s = run("annotation", {});
  s.setItem("ann_size", "9");
  check("unknown guide value ignored", s.getItem("lyceum-size"), null);
}
{
  const s = run("chromebookrepair", { "lyceum-theme": "dark" });
  check("unregistered guide is inert", Object.keys(s.data), ["lyceum-theme"]);
}


console.log("\nSTART-UP DEFAULTS  (a guide's own default is not a reader's choice)\n");

{
  /* Searches & Sources writes rb_font="sans" on every load. Before the page has
     settled that must not reach the hub, or the first guide a student opens
     would quietly set the network typeface. */
  const s = run("rbsearchesandsources", {}, false);
  s.setItem("rb_font", "sans");
  check("default written during load is ignored", s.getItem("lyceum-font"), null);
  s.settle();
  s.setItem("rb_font", "dys");
  check("a choice made after load is mirrored", s.getItem("lyceum-font"), "dyslexic");
}
{
  /* A value the reader had already saved still seeds the hub, because that
     happens in reconcile() and not through the interceptor. */
  const s = run("rbsearchesandsources", { "rb_font": "dys" }, false);
  check("an established choice still seeds the hub", s.getItem("lyceum-font"), "dyslexic");
}


console.log("\nEXHAUSTIVE ROUND TRIP  (every option each guide actually offers)\n");

/* Ground truth, read off the live guides rather than off the shim, so a typo in
   the adapter table shows up as a failure instead of agreeing with itself.
   To re-derive after editing a guide's panel, list the values of its
   data-size / data-font / data-theme (or data-val) buttons. */

const OFFERED = {
  mla:                  { size: ["s","m","l"], font: ["serif","sans","dys"],      theme: ["light","dark","contrast"] },
  apa:                  { size: ["s","m","l"], font: ["serif","sans","dys"],      theme: ["light","dark","contrast"] },
  rbgettingstarted:     { size: ["s","m","l"], font: ["serif","sans","dys"],      theme: ["light","dark","contrast"] },
  rbsearchesandsources: { size: ["s","m","l"], font: ["serif","sans","dys"],      theme: ["light","dark","contrast"] },
  imageclearinghouse:   { size: ["s","m","l"], font: ["serif","sans"],            theme: ["light","dark","contrast"] },
  annotation:           { size: ["1","2","3"], font: ["serif","sans","dyslexia"], theme: ["light","dark","contrast"] },
  babel:                {                                                        theme: ["light","dark"] }
};

let covered = 0;
for (const [guide, dims] of Object.entries(OFFERED)) {
  for (const [dim, values] of Object.entries(dims)) {
    for (const value of values) {
      /* Guide -> hub: the option is saved, and the hub learns a real value. */
      const up = run(guide, {});
      if (guide === "mla" || guide === "apa") {
        up.setItem("cs_a11y", JSON.stringify({ [dim]: value }));
      } else {
        up.setItem(up.getItem === null ? "" : ({
          rbgettingstarted: "gs_", rbsearchesandsources: "rb_",
          imageclearinghouse: "ic_", annotation: "ann_", babel: "cat-"
        })[guide] + dim, value);
      }
      const hub = up.getItem({ size: "lyceum-size", font: "lyceum-font", theme: "lyceum-theme" }[dim]);
      if (!hub) { fail++; console.log(`  FAIL  ${guide}/${dim}="${value}" produced no hub value`); continue; }

      /* Hub -> guide: that hub value comes back as the same option. */
      const down = run(guide, { [{ size: "lyceum-size", font: "lyceum-font", theme: "lyceum-theme" }[dim]]: hub });
      const back = (guide === "mla" || guide === "apa")
        ? blob(down)[dim]
        : down.getItem(({
            rbgettingstarted: "gs_", rbsearchesandsources: "rb_",
            imageclearinghouse: "ic_", annotation: "ann_", babel: "cat-"
          })[guide] + dim);

      if (back !== value) {
        fail++;
        console.log(`  FAIL  ${guide}/${dim}: "${value}" -> "${hub}" -> "${back}"`);
      } else { covered++; }
    }
  }
}
if (!fail) console.log(`  ok    ${covered} option(s) survived a full round trip`);
pass += fail ? 0 : 1;

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
