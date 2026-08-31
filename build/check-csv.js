#!/usr/bin/env node
/* LIBRARY LYCEUM: COLLECTION DATA CHECK
 *
 * The gate the collections pass through before anything is built from them.
 *
 *   node check-csv.js                 validate, then update the baseline
 *   node check-csv.js --check         validate only; write nothing
 *   node check-csv.js --allow-shrink  accept that rows were deliberately removed
 *
 * WHY THIS EXISTS
 *
 * build-index.js is forgiving by design: a row with no name or no URL is
 * warned about and skipped, and the build still succeeds. That is the right
 * behaviour for a generator — one bad row should not cost you the whole search
 * index — but it means a damaged spreadsheet produces a smaller site rather
 * than an error, and a smaller site looks exactly like a correct one.
 *
 * On 28 August 2026 that cost real work. Two separate encoding faults, four
 * databases entered twice under names differing only by a leading "The", and a
 * file that had quietly lost rows between one save and the next. Every one of
 * those is caught here, at the door, before a single file is generated.
 *
 * WHAT IT REFUSES
 *
 *   1. Bytes that are not valid UTF-8.
 *   2. Text that decodes but carries the signature of a double encoding —
 *      the Ã, Â and â€ sequences left behind when UTF-8 is read as Windows-1252
 *      and saved again. This is what actually happened, twice, and it survives
 *      a validity check because the result is still well-formed UTF-8.
 *   3. A header that is not the header this collection is supposed to have.
 *   4. A row with the wrong number of fields.
 *   5. A row with no name, or no URL, or a URL that is not http(s).
 *   6. Two rows with the same name, comparing case-insensitively and ignoring
 *      a leading article. "The Chronicle" and "Chronicle" are one database.
 *   7. Two rows with the same URL.
 *   8. Fewer rows than the last time this ran.
 *
 * THE BASELINE
 *
 * data/csv-baseline.json holds, per file, the row count, a hash of the bytes,
 * and the list of names. It is committed, so the comparison means the same
 * thing on every machine and does not depend on git being on the PATH.
 *
 * Names rather than a count alone, because a count says "four rows went
 * missing" and a list says which four. That is the difference between knowing
 * something is wrong and knowing what to put back.
 *
 * A file that grows, or whose rows are edited, updates the baseline silently.
 * A file that shrinks stops the build and names what vanished; --allow-shrink
 * is how you say the weeding was deliberate. One extra flag on the day you
 * remove a database, and no accidental deletion can ever pass unremarked.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const BASELINE = path.join(ROOT, "data", "csv-baseline.json");

const check = process.argv.includes("--check");
const allowShrink = process.argv.includes("--allow-shrink");

/* Each collection, its required header, and which column is its identity.
   The header is compared exactly: a renamed or reordered column changes what
   every downstream reader sees, and is never a harmless edit. */
const COLLECTIONS = [
  {
    file: "databases.csv",
    header: ["Name", "URL", "Description", "Subjects", "Primary"],
    key: "Name"
  },
  {
    file: "guides.csv",
    header: ["Title", "URL", "Description", "Course", "Subjects", "Series"],
    key: "Title"
  }
];

const problems = [];
const notes = [];


/* ── READING ──────────────────────────────────────────────
   Read as bytes and decode deliberately, so an invalid file is an error rather
   than a string full of replacement characters. fatal:true is the whole point:
   the default decoder never fails, it just substitutes U+FFFD and carries on. */

function readText(file) {
  const buf = fs.readFileSync(file);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch (e) {
    return { error: "is not valid UTF-8. Re-save it as UTF-8 from the spreadsheet." };
  }
  return { text: text.replace(/^﻿/, ""), hadBom: buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF };
}

/* A table of known-bad sequences would be a guess. This undoes the damage
   instead and checks whether the result makes sense: take a suspicious run,
   encode it back to the Windows-1252 bytes it must have come from, and read
   those bytes as UTF-8. If that succeeds and yields a single character, the run
   was that character all along — so the message can say exactly what the text
   ought to read, rather than describing the symptom. */

/* Windows-1252's own assignments in 0x80-0x9F, where it departs from Latin-1.
   Every other code point below 0x100 maps to the byte of the same value. */
const CP1252_HIGH = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F
};

function toCp1252(run) {
  const bytes = [];
  for (const ch of run) {
    const code = ch.codePointAt(0);
    if (CP1252_HIGH[code] !== undefined) bytes.push(CP1252_HIGH[code]);
    else if (code <= 0xFF && !(code >= 0x80 && code <= 0x9F)) bytes.push(code);
    else return null;
  }
  return Buffer.from(bytes);
}

/* U+00C3, U+00C2 and U+00E2 are the three characters a mangled UTF-8 sequence
   can begin with, followed by one or two characters Windows-1252 can
   represent. A match is only a candidate; the round trip above decides. */
const SUSPECT = new RegExp(
  "[\\u00C3\\u00C2\\u00E2]" +
  "[\\u00A0-\\u00FF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6" +
  "\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022" +
  "\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]{1,2}", "g");

function mojibakeIn(text) {
  const found = new Map();
  let m;
  SUSPECT.lastIndex = 0;
  while ((m = SUSPECT.exec(text))) {
    const run = m[0];
    const bytes = toCp1252(run);
    if (!bytes) continue;
    let meant;
    try { meant = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch (e) { continue; }
    if (Array.from(meant).length !== 1 || meant === run) continue;
    const seen = found.get(run);
    if (seen) seen.count++;
    else found.set(run, { saw: run, meant: meant, count: 1 });
  }
  return Array.from(found.values());
}

/* RFC 4180, with line numbers kept. The parser in build-index.js discards
   them; here the line number is most of the value of the message. */
function parseCsv(text) {
  const rows = [];
  let fields = [], field = "", inQuotes = false, line = 1, startLine = 1;

  const endRow = () => {
    fields.push(field);
    field = "";
    if (fields.some(f => f.trim() !== "")) rows.push({ fields, line: startLine });
    fields = [];
    startLine = line;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else { if (c === "\n") line++; field += c; }
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { fields.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      endRow();
    } else field += c;
  }
  if (field !== "" || fields.length) endRow();

  if (inQuotes) return { error: "ends inside an unclosed quotation mark." };
  return { rows };
}

/* "The Chronicle of Higher Education" and "Chronicle of Higher Education" are
   the same subscription entered twice. Four pairs exactly like this were found
   on 28 August, and none of them collide under a plain lowercase comparison. */
function identity(name) {
  return String(name)
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrl(url) {
  return String(url).trim().replace(/\/+$/, "").toLowerCase();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}


/* ── CHECKING ─────────────────────────────────────────────

   Every problem is collected rather than thrown, so one run tells you
   everything that is wrong with the file instead of the first thing. */

function checkCollection(spec, baseline) {
  const file = path.join(ROOT, "data", spec.file);
  const at = msg => `${spec.file}: ${msg}`;

  if (!fs.existsSync(file)) {
    problems.push(at("missing entirely."));
    return null;
  }

  const read = readText(file);
  if (read.error) { problems.push(at(read.error)); return null; }
  if (read.hadBom) notes.push(at("starts with a byte-order mark. Harmless; readers strip it."));

  for (const m of mojibakeIn(read.text)) {
    problems.push(at(
      `${m.count} occurrence${m.count === 1 ? "" : "s"} of "${m.saw}"` +
      (m.meant ? `, which should be "${m.meant}"` : "") +
      ". The file has been through a Windows-1252 round trip. Re-save as UTF-8."
    ));
  }

  const parsed = parseCsv(read.text);
  if (parsed.error) { problems.push(at(parsed.error)); return null; }
  if (!parsed.rows.length) { problems.push(at("is empty.")); return null; }

  const header = parsed.rows.shift().fields.map(h => h.trim());
  if (header.join("|") !== spec.header.join("|")) {
    problems.push(at(
      `header is "${header.join(", ")}" but should be "${spec.header.join(", ")}".`
    ));
    return null;
  }

  const width = spec.header.length;
  const keyAt = spec.header.indexOf(spec.key);
  const urlAt = spec.header.indexOf("URL");

  const byName = new Map();
  const byUrl = new Map();
  const names = [];

  for (const row of parsed.rows) {
    const where = `${spec.file} line ${row.line}`;

    if (row.fields.length !== width) {
      problems.push(`${where}: ${row.fields.length} field${row.fields.length === 1 ? "" : "s"}, ` +
        `expected ${width}. A comma inside an unquoted cell will do this.`);
      continue;
    }

    const name = row.fields[keyAt].trim();
    const url = row.fields[urlAt].trim();

    if (!name) { problems.push(`${where}: no ${spec.key}.`); continue; }
    if (!url) { problems.push(`${where}: "${name}" has no URL.`); continue; }
    if (!/^https?:\/\/\S+$/i.test(url)) {
      problems.push(`${where}: "${name}" has "${url}", which is not an http or https address.`);
    }

    const id = identity(name);
    if (byName.has(id)) {
      problems.push(`${where}: "${name}" is already on line ${byName.get(id).line} ` +
        `as "${byName.get(id).name}". Same entry, two rows.`);
    } else {
      byName.set(id, { line: row.line, name });
    }

    const u = normalizeUrl(url);
    if (byUrl.has(u)) {
      problems.push(`${where}: "${name}" points at the same address as ` +
        `"${byUrl.get(u).name}" on line ${byUrl.get(u).line}.`);
    } else {
      byUrl.set(u, { line: row.line, name });
    }

    names.push(name);
  }

  /* ── The regression check ──
     A file that has lost a row it used to have is the failure mode that has
     actually bitten, and the only one that leaves no trace in the file itself. */
  const was = baseline && baseline.files && baseline.files[spec.file];
  if (!was) {
    notes.push(at(`no baseline yet — recording ${names.length} rows.`));
  } else {
    const have = new Set(names.map(identity));
    const gone = (was.names || []).filter(n => !have.has(identity(n)));

    if (gone.length) {
      const list = gone.map(n => `      ${n}`).join("\n");
      const msg = at(
        `${gone.length} row${gone.length === 1 ? "" : "s"} present at the last check ` +
        `and absent now:\n${list}`
      );
      if (allowShrink) notes.push(msg + "\n    Accepted: --allow-shrink.");
      else problems.push(msg + "\n    If you removed these deliberately, run again with --allow-shrink.");
    }

    if (names.length < was.rows && !gone.length) {
      problems.push(at(`${was.rows} rows at the last check, ${names.length} now.`));
    }

    if (names.length > was.rows) {
      notes.push(at(`${names.length} rows, up from ${was.rows}.`));
    }
  }

  return { rows: names.length, sha256: sha256(file), names };
}


/* ── RUN ──────────────────────────────────────────────── */

let baseline = null;
if (fs.existsSync(BASELINE)) {
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  } catch (e) {
    notes.push("data/csv-baseline.json could not be read, so nothing is compared " +
      "against it this run. Delete it and build to start a fresh one.");
  }
}

const next = { generated: new Date().toISOString().slice(0, 10), files: {} };
let total = 0;

for (const spec of COLLECTIONS) {
  const result = checkCollection(spec, baseline);
  if (result) {
    next.files[spec.file] = result;
    total += result.rows;
  }
}

for (const n of notes) console.log(n);

if (problems.length) {
  console.error(`${problems.length} problem${problems.length === 1 ? "" : "s"}:`);
  problems.forEach(p => console.error("  " + p));
  process.exit(1);
}

/* Nothing is written in --check mode, including the baseline. A validation
   pass that quietly moves the goalposts is not a validation pass: the next run
   would compare against a file that had already accepted the loss. */
const changed = !baseline || COLLECTIONS.some(spec => {
  const was = baseline.files && baseline.files[spec.file];
  const now = next.files[spec.file];
  return !was || !now || was.sha256 !== now.sha256;
});

if (check) {
  if (changed) {
    console.error(`${total} rows, all sound, but data/csv-baseline.json no longer ` +
      "matches the collections. Run: node build.js");
    process.exit(1);
  }
  console.log(`${total} rows across ${Object.keys(next.files).length} collections, all sound.`);
} else {
  if (changed) fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
  console.log(`${total} rows across ${Object.keys(next.files).length} collections, all sound.` +
    (changed ? " Baseline updated." : ""));
}
