# Library Lyceum — Architecture Roadmap

**Status:** Phases 1–4 shipped. Phase 5 (database detail pages) next.
**Date:** 23 August 2026
**Decisions taken:** vendored chrome with satellite descriptors; Node build scripts with committed output.

---

## 1. Decisions taken, and why

### Vendored chrome, not absorption

Guides remain independent repositories. Each vendors its own copy of the Lyceum's shared identity layer — the same pattern already used for `vendor-marked.js`, `vendor-fuse.js`, and `vendor-papaparse.js`, licenses kept beside them.

This preserves three properties that absorption would have cost:

- **Isolation.** A careless commit to shared CSS cannot break fifteen guides at once.
- **Portability.** Any guide remains a complete, standalone artifact that can be handed to another librarian, forked by a student, or archived on its own.
- **Extensibility.** A new spoke is a new repository plus two vendored files, not a negotiation with an existing codebase.

The cost is drift: vendored copies fall behind the canonical chrome unless resynced. This is addressed by a version stamp and a drift checker, described in §4.

### Node scripts with committed output, not Jekyll

The deciding property is that **the deployed repository is the complete site**. Every file served is a file in git; nothing is generated at deploy time. This means no build can fail, because no build occurs in the critical path.

Jekyll would have solved the chrome duplication idiomatically and given RSS for free, but it would have placed a build permanently between the repository and the served site — on a toolchain pinned to Jekyll 3.10 by GitHub, on GitHub's schedule, with custom plugins prohibited.

The scripts here are run locally, and their output is committed. If Node disappears, if the scripts rot, if they become tiresome — the site is unaffected and editing reverts to hand-editing HTML. There is no migration to undo.

---

## 2. Governing principles

These are the tests any future proposal should have to pass.

**1. Source equals output.** Every file in the repository is byte-for-byte what gets served. Build scripts produce committed artifacts, never deploy-time transformations.

**2. Dependencies may degrade; they may never halt.** A missing font falls back to the next stack entry and the page is fully usable. A missing stylesheet is not survivable. This distinction governs what may be centralized and what must be vendored.

**3. One index, many producers.** Databases, guides, guide sections, and newsletter issues all publish into a single committed search index. Search improves as a side effect of every other phase rather than requiring its own maintenance.

**4. Your voice, my scaffolding.** Every word a student reads is yours. I build structure, generation, and empty slots; prose that ships is written or explicitly approved by you.

---

## 3. Findings from the current codebase

Recorded here because they shape the plan and because a future session will need them.

| Finding | Consequence |
| --- | --- |
| All sites share one origin (`mistertlibrary.github.io`, differing only by path) | Satellite descriptor fetches are same-origin. No CORS handling required unless a guide moves to a custom domain. |
| Shared chrome (skip link, a11y panel, header, nav, footer) is duplicated verbatim across 8+ files | A nav change is currently an 8-file edit. This is the single largest maintenance tax and is addressed first. |
| `lyceum-fonts.css` is 204 KB: five base64-inlined variable woff2 faces, already subset | Browsers cache per-origin by URL. Vendoring fonts into each satellite is safe but wasteful; see Open Decision A. |
| `guides.csv` holds 3 rows, all pointing to independent sites with their own chrome | The "network anchored by this hub" is currently a link list. Phase 3 makes it real. |
| `databases.csv` holds 74 rows, all with descriptions and a `Primary` subject; 14 subjects in use | Sound data. Detail pages generate cleanly from it. |
| Newsletter ships two `sample-` placeholder issues and three `PLACEHOLDER` meta tags in production | Blocks launch. Phase 5. |
| `.nojekyll` present; `newsletter/issues/_template/` is underscore-prefixed | Consistent with the decision against Jekyll, which ignores underscore-prefixed directories by default. |
| `check-links.js` and `check-issues.js` exist but run only when invoked manually | Link rot is currently discovered by students. Addressed in the continuous track. *(27 Aug: `check-links.js` is now `build/Check-Links.ps1`. Still manual, deliberately — it is the one check that has to run on the work machine, where Node does not.)* |

---

## 4. The architecture

### 4.1 Canonical chrome

A `chrome/` directory in the Lyceum repository becomes the single source of the shared identity:

```
chrome/
  chrome.json          version stamp and manifest
  head.html            pre-paint preference script, font and stylesheet links
  a11y-panel.html      display settings panel
  header.html          wordmark and navigation
  footer.html          contact and copyright
  lyceum-chrome.css    design tokens and shared component styles
  lyceum-chrome.js     preference logic, a11y panel behaviour, shared helpers
```

Each HTML page carries marker comments:

```html
<!-- lyceum:header -->
  ... generated, do not edit by hand ...
<!-- /lyceum:header -->
```

`build-chrome.js` reads `chrome/`, rewrites the content between markers in every file that has them, and adjusts relative asset paths by directory depth. It is idempotent, offers a `--check` mode that reports drift without writing, and a `--diff` mode for review before committing.

Navigation becomes a one-file edit. The a11y panel stops being maintained in eight places.

### 4.2 The satellite protocol

Each guide publishes `lyceum.json` at its root:

```json
{
  "lyceum": 1,
  "title": "Citation Station: MLA Format",
  "description": "A comprehensive overview of MLA 9.",
  "series": "Citation Station",
  "subjects": ["English Language Arts", "Social Studies"],
  "course": "",
  "updated": "2026-08-23",
  "chromeVersion": "1.0.0",
  "sections": [
    { "title": "Works Cited", "anchor": "#works-cited", "summary": "..." }
  ]
}
```

Two things follow from this. First, `chromeVersion` lets the hub report which satellites have fallen behind the canonical chrome — drift becomes visible rather than silent. Second, `sections` makes search *deep*: a student searching "hanging indent" lands on the relevant section of the MLA guide, not on its front door. This is the specific failure of LibGuides search that the Lyceum can beat.

### 4.3 The search index

`build-index.js` reads:

- `databases.csv` (and any per-database annotations, once Phase 4 lands)
- `guides.csv`, resolving each row to its satellite's `lyceum.json`
- `newsletter/issues/index.json`

It writes one committed `search-index.json`. The hub therefore never fetches satellites at page load — a satellite being unreachable degrades the index's freshness, never the search itself.

`search.html` loads the index and queries it with the already-vendored Fuse. The header search box is a plain form that submits to `search.html?q=`, so the markup remains meaningful without JavaScript even though results require it.

### 4.4 Database detail pages

`build-databases.js` generates `databases/<slug>/index.html` from `databases.csv`. Where `databases/<slug>/notes.md` exists, it is rendered into the page via the vendored `marked`.

Seventy-four pages exist immediately with the information already in the CSV. Annotation accrues at your pace, and each note enriches the search index automatically.

**Important UX constraint:** the primary link on a database card continues to go straight to the database. Detail pages are a secondary "About this database" action. Nothing is added to the path a student takes when they just need to get to EBSCO.

---

## 5. Phasing

Each phase leaves the site working, shippable, and better than before. Each phase deepens the search index as a side effect.

### Phase 1 — Chrome foundation
Extract canonical chrome; write `build-chrome.js`; insert markers and regenerate the five Lyceum pages, the newsletter archive, and the issue shells.

*Outcome:* nav and panel edits become one-file edits. Placeholder meta tags and duplicated panels are corrected once rather than eight times.
*Risk:* touches every HTML file. Mitigated by doing it on a branch, in one reviewable commit, with `--diff` output attached.

### Phase 2 — Unified search, shallow
`build-index.js` over `databases.csv`, `guides.csv`, and the newsletter manifest. New `search.html`. Header search box.

*Outcome:* your first-priority feature ships without waiting on satellite migration. Guides are indexed at whole-guide granularity for now.

### Phase 3 — Satellite protocol
Define `lyceum.json` v1. Vendor chrome into `/mla/`, `/apa/`, `/imageclearinghouse/`. Author section descriptors for each. Add drift reporting.

*Outcome:* the network becomes visually and structurally coherent; search deepens to section level automatically.

### Phase 4 — Network weight
Extract inlined base64 to real files across all nine guides; deduplicate; verify
byte-identical rendering per guide.

*Why here, ahead of the phases originally numbered 4 and 5:* 6.59 MB of the
guide network's 7.33 MB of HTML is base64. The encoding overhead alone wastes
1.65 MB, and that is the smaller half of the cost — an inlined asset can never
be cached separately, so every visit to the MLA guide re-downloads 4.8 MB in
full. Detail pages and the newsletter are enhancements to things that already
work; this is a cost students are paying today, on the guide most likely to be
opened mid-assignment on a phone.

*Method:* proven on the hub's own fonts, which went from 204 KB inlined to real
files and cut 38% off every page load.

*Outcome:* measured before/after per guide, with pixel comparison as the gate.

### Phase 5 — Database detail pages
`build-databases.js`, 74 generated pages, `notes.md` annotation slots,
schema.org markup. Citation examples in MLA.

*Outcome:* deep-linkable database records with room for the teaching — when to
use a database, what it is bad at, how to read its records.

### Phase 6 — Knightly Muse
Strip sample issues and placeholder meta; write the colophon; generate
`newsletter/feed.xml` from the manifest; build `newsletter/compose.html`.

The compose tool is a single static page, entirely client-side: a split editor
with live preview rendered through the *actual* `newsletter.css` and the
*actual* vendored `marked` plus the footnote preprocessor, so the preview is
literally what publishes. It emits the finished `issue.md` with front matter and
the matching `index.json` entry.

*Outcome:* the newsletter launches, gains an RSS feed, and publishing stops
being tedious enough to abandon.

### Continuous — Maintenance automation
A weekly GitHub Action running `check-links.js`, `check-issues.js`, and the chrome drift check, opening a repository issue on failure. Lands any time after Phase 1.

*27 Aug — overtaken in part. The chrome drift check was dropped in the 25 August pruning. Link checking left Node entirely: it is `build/Check-Links.ps1` now, because it has to run on the work machine and has to be run twice, on the school network and off it, and neither of those is something a scheduled Action can do. What is left for an Action is `check-issues.js` alone, which is not obviously worth a workflow file.*

Note this does not violate the source-equals-output principle: the Action is a *monitor*, not a build. The site deploys whether or not it passes.

---

## 6. Open decisions

These need your call. I have a recommendation on each but have not acted on any.

### A. Fonts — vendor or reference?

204 KB, cached per-origin by URL. If each satellite vendors its own copy at its own path, a student visiting the hub plus two guides downloads the same font data three times.

- **Recommendation: reference one canonical path.** A font that fails to load degrades gracefully to the fallback stack, so this is a *degrading* dependency, not a halting one — permitted under Principle 2. The font file is also nearly static, so drift barely applies.
- **Alternative:** vendor it anyway for absolute independence, and accept roughly 150 KB of redundant transfer per additional guide visited on a cold cache.
- **Third option:** move shared assets to a dedicated `lyceum-chrome` repository so no guide depends on the *hub site*, only on a static asset path owned by neither.

### B. Citation style for database detail pages

If detail pages include "how to cite a source from this database," that needs a house style. MLA, APA, or Chicago — or all three, given that you already maintain both an MLA and an APA guide and the `Subjects` column implies discipline. Your call.

### C. Verification burden

Your standing instruction is that no claim ships without confirmation from at least two live authoritative sources. Detail pages invite claims your current cards do not make — coverage dates, publisher, embargo periods, what a database actually indexes.

- **Recommendation: verify on demand.** Generate all 74 pages from the CSV you have already vetted, and verify only when you add an annotation making a new factual claim. Bulk-verifying 74 databases up front is a large project that would stall everything behind it.

---

## 7. Standing constraints on my work

Recorded so they survive into future sessions.

- **I do not write student-facing prose.** Structure, generation, and empty slots are mine; the words a student reads are yours.
- **I do not alter your writing** without explicit permission, including the invocation, the mission statement, the about text, and every database description.
- **I do not ship claims I have not verified** against at least two live authoritative sources, preferring universities, libraries, museums, and established publications. Where I cannot verify, the claim is removed rather than softened.
- **I do not proceed between phases without your approval.**

---

## 7a. Deliberately not phases

- **Crusades description and og tags.** Ten minutes' work; do it next time that
  repository is open. It has no meta description and no og/twitter tags at all,
  so link previews of it are bare.
- **Babel overhaul.** Mr. Thompson's editorial project, on his schedule.

## 8. Immediate next step

Your approval, amendment, or rejection of this document — and a call on Open Decision A, which Phase 1 needs.

Nothing is built until then.
