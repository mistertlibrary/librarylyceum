# Library Lyceum

The West Essex High School Library's digital home: a curated database
collection, a network of research guides, and the *Knightly Muse* newsletter.

Live at <https://mistertlibrary.github.io/librarylyceum/>.

Three documents: this one to get oriented, `REFERENCE.md` for the four
subsystems, `ROADMAP.md` for the plan.

---

## The one rule

**Nothing is built at deploy time.** Every file in this repository is exactly
what gets served. The scripts run somewhere else and their output is committed.

A generated site fails to deploy when its build breaks; this one cannot, because
there is no build in the path. If the scripts ever become more trouble than they
are worth, delete them and edit the HTML by hand — the site is unaffected and
there is no migration to undo.

It is also what makes the absence of Node on the work machine survivable rather
than fatal. The repository *is* the finished site.

The corollary: **the build has to run somewhere before generated output is
committed**, or that output drifts from its sources. `--check` is the guard.

---

## One command

```
node build/build.js
```

Regenerates what is generated, validates what can be validated, and reports what
changed. Then review the diff and commit.

```
node build/build.js --check    verify only; writes nothing; exits 1 if anything
                               is stale, drifted, or broken
```

## Link checking

Separate, and deliberately so: `build/Check-Links.ps1` asks every URL in
`data/databases.csv` and `data/guides.csv` whether it is still there. It is
PowerShell rather than Node because it is the one check that has to run on the
work machine, and the work machine has PowerShell.

Open PowerShell in the repository root and either dot-source the file or — if
script files are not permitted there — select the whole file, copy it, and paste
it at the prompt. Execution policy governs script *files*; pasted commands are
unaffected by it, which is why the script carries no `param()` block that would
make it unpasteable.

Run it twice: once on the school network and once off it. EBSCO profile links
resolve differently on and off campus, so a link that fails at home may be
perfectly healthy in the building.

**Where it runs.** Not on the work machine, which has no Node. A change to
`data/databases.csv`, `data/guides.csv`, or anything in `chrome/` needs the
build run somewhere before it reaches a page. Today that somewhere is a working
session. Everything else — writing HTML, editing a newsletter issue, committing,
pushing — needs nothing but GitHub Desktop.

## What the build does

| Step | Reads | Writes |
| --- | --- | --- |
| chrome | `chrome/` | the marked blocks in every `.html` |
| search index | `data/*.csv`, the newsletter manifest, each guide's `lyceum.json` | `data/search-index.json` |
| newsletter | `newsletter/issues/*/issue.md` and the manifest | nothing; reports disagreements |
| sitemap | every page and issue | `sitemap.xml`, `robots.txt` |
| preferences | `lyceum-prefs.js` | nothing; runs its test suite |

Each step is also its own script in `build/`, if you want to work on one in
isolation. Each resolves its paths against its own location, so it gives the
same answer wherever it is invoked from.

---

## Editing common things

| To change | Edit | Then |
| --- | --- | --- |
| A navigation item | `chrome/chrome.json` | rebuild |
| The header, footer, or settings panel | the partial in `chrome/` | rebuild |
| A database entry | `data/databases.csv` | rebuild |
| A research guide entry | `data/guides.csv` | rebuild |
| A guide's sections in search | that guide's own `lyceum.json` | rebuild |
| Page copy | the page itself | nothing |
| Colours, type, spacing | `lyceum.css` | nothing |
| A single page's own styles | that page's `<style>` block | nothing |

Anything between `<!-- lyceum:… -->` markers is generated. Hand edits there are
overwritten on the next build.

---

## Layout

```
*.html             the pages themselves; their URLs are public, so they stay here
chrome/            the shared furniture
build/             every script; nothing here is ever served
data/              databases.csv, guides.csv, and the generated search-index.json
docs/              these three documents
vendor/            pinned third-party libraries, licences beside them
fonts/             self-hosted faces, the OFL beside them
newsletter/        the archive and its issues

lyceum.css         design tokens and shared components
lyceum.js          reader preferences and the settings panel
lyceum-prefs.js    preference sync across the guide network
lyceum-fonts.css   the @font-face declarations

mediumisthemassage.html   the newsletter drafting desk. Not linked from anywhere
                          and named unobviously; bookmark it
sitemap.xml        generated
robots.txt         generated
```

The four `lyceum-*` files and `fonts/` sit at the root and stay there: nine
satellite repositories address them absolutely, as `/librarylyceum/lyceum.css`
and the like. Those paths are public API — moving one means a coordinated edit
across ten repositories.

---

## Local preview

The canonical font path assumes the site is served at `/librarylyceum/`, so
serve this repository's *parent* directory:

```
cd ..
python -m http.server 8000
```

Then visit <http://localhost:8000/librarylyceum/>.

Serving this directory directly also works; fonts will 404 and the fallback
stack renders, which is a fair demonstration of the intended graceful
degradation.

---

## Dependencies

Node, for the build scripts only, and PowerShell — already on the work machine —
for the link check. Three vendored browser libraries — Papa Parse,
Fuse, and marked — pinned in the repository with their licences, fetched from
nobody at runtime. No package manager, no lockfile, no toolchain to maintain.

Nothing on this site calls a third-party server at page load. Fonts, scripts,
styles, and data all come from this repository.
