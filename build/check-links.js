// Link checker for databases.csv and guides.csv.
// Run locally with: node check-links.js
// Reports any URL that does not return a 2xx/3xx status.
// Note: run from the school network as well, since EBSCO profile
// links may resolve differently on and off campus.
const fs = require("fs");
const path = require("path");

/* Resolved against this file, not the working directory, so the checker gives
   the same answer however it is invoked. */
const DATA = path.join(__dirname, "..", "data");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); if (row.some(f => f.trim())) rows.push(row); }
  return rows;
}

async function check(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(15000) });
      if (res.ok || (res.status >= 300 && res.status < 400)) return { ok: true, status: res.status };
      if (method === "GET") return { ok: false, status: res.status };
    } catch (e) {
      if (method === "GET") return { ok: false, status: e.message };
    }
  }
}

(async () => {
  let totalBad = 0;
  for (const name of ["databases.csv", "guides.csv"]) {
    const file = path.join(DATA, name);
    const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const rows = parseCsv(text);
    const header = rows[0].map(s => s.trim());
    const nameIdx = header.findIndex(s => /name|title/i.test(s));
    const urlIdx = header.findIndex(s => /url/i.test(s));
    console.log(`\n=== ${file}: ${rows.length - 1} entries ===`);
    let bad = 0;
    for (const row of rows.slice(1)) {
      const name = row[nameIdx], url = row[urlIdx];
      if (!url) { console.log(`MISSING URL  ${name}`); bad++; continue; }
      const r = await check(url);
      if (!r.ok) { console.log(`FAIL [${r.status}]  ${name}  ${url}`); bad++; }
    }
    console.log(bad === 0 ? "All links OK." : `${bad} problem link(s).`);
    totalBad += bad;
  }
  // Exit non-zero so this can gate a scheduled job. Previously it always
  // reported success regardless of what it found.
  if (totalBad > 0) process.exit(1);
})();
