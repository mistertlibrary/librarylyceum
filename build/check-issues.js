// Verifies that every newsletter issue on disk matches its entry in
// newsletter/issues/index.json. Run with: node check-issues.js

const fs = require('fs');
const path = require('path');

const ISSUES_DIR = path.join(__dirname, '..', 'newsletter', 'issues');
const MANIFEST = path.join(ISSUES_DIR, 'index.json');
const FIELDS = ['number', 'date', 'title', 'dek', 'audience'];
const AUDIENCES = ['students', 'faculty', 'both'];

const problems = [];
const note = (msg) => problems.push(msg);

function readFrontMatter(file) {
  const text = fs.readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return meta;
}

if (!fs.existsSync(MANIFEST)) {
  console.error('Missing ' + MANIFEST);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).issues || [];
const bySlug = new Map(manifest.map((i) => [i.slug, i]));

const dirs = fs.readdirSync(ISSUES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_template')
  .map((d) => d.name);

for (const slug of dirs) {
  const dir = path.join(ISSUES_DIR, slug);
  const md = path.join(dir, 'issue.md');
  const html = path.join(dir, 'index.html');

  if (!fs.existsSync(md)) { note(slug + ': no issue.md'); continue; }
  if (!fs.existsSync(html)) note(slug + ': no index.html');

  const meta = readFrontMatter(md);
  if (!meta) { note(slug + ': issue.md has no front matter block'); continue; }

  for (const f of FIELDS) {
    if (!meta[f]) note(slug + ': front matter missing "' + f + '"');
  }
  if (meta.audience && !AUDIENCES.includes(meta.audience)) {
    note(slug + ': audience "' + meta.audience + '" is not one of ' + AUDIENCES.join(', '));
  }
  if (meta.date && !/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
    note(slug + ': date "' + meta.date + '" is not YYYY-MM-DD');
  }

  const entry = bySlug.get(slug);
  if (!entry) { note(slug + ': on disk but absent from index.json'); continue; }
  bySlug.delete(slug);

  for (const f of FIELDS) {
    if (meta[f] === undefined) continue;
    const a = String(meta[f]);
    const b = String(entry[f]);
    if (a !== b) note(slug + ': "' + f + '" differs. issue.md has "' + a + '", index.json has "' + b + '"');
  }

  if (fs.existsSync(html)) {
    const page = fs.readFileSync(html, 'utf8');
    if (page.includes('ISSUE-SLUG') || page.includes('ISSUE TITLE') || page.includes('ISSUE DEK')) {
      note(slug + ': index.html still contains template placeholders');
    }
    if (!page.includes('/newsletter/issues/' + slug + '/')) {
      note(slug + ': og:url in index.html does not point at this slug');
    }
  }
}

for (const slug of bySlug.keys()) {
  note(slug + ': listed in index.json but no such directory');
}

const numbers = manifest.map((i) => i.number);
numbers.forEach((n, i) => {
  if (numbers.indexOf(n) !== i) note('Issue number ' + n + ' is used more than once');
});

if (problems.length) {
  console.error(problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ':');
  problems.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

console.log('All ' + dirs.length + ' issues match the manifest.');
