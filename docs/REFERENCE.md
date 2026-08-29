# Reference

Four subsystems, in one file so there are four fewer files to keep true.
Orientation is in `README.md`; the plan is in `ROADMAP.md`.

- [Chrome](#chrome) — the shared furniture on every page
- [Search](#search) — one index across every collection
- [Preferences](#preferences) — one reader's choice across nine sites
- [Newsletter](#newsletter) — publishing an issue

---

# Chrome

Favicons, the pre-paint preference script, the skip link, the accessibility
panel, the header and navigation, the footer. One source, written into every
page by `build/build-chrome.js`.

| Path | Contents |
| --- | --- |
| `chrome/chrome.json` | Version, nav items, brand and footer strings, font path |
| `chrome/head.html` | Favicons, pre-paint preference script, stylesheet links |
| `chrome/skiplink.html` | The skip link; its target is per-page |
| `chrome/a11y-panel.html` | Display settings panel |
| `chrome/header.html` | Wordmark and navigation |
| `chrome/footer.html` | Contact line and copyright |

```
node build/build-chrome.js            rewrite every page from chrome/
node build/build-chrome.js --check    report drift, write nothing, exit 1
node build/build-chrome.js --diff     print what would change
```

Idempotent: run it twice and the second run writes nothing.

## Markers

Each page carries five marker pairs. Everything between a pair is generated and
is overwritten on the next run.

```html
<!-- lyceum:head -->                              ... <!-- /lyceum:head -->
<!-- lyceum:skiplink target="#main-content" -->   ... <!-- /lyceum:skiplink -->
<!-- lyceum:a11y -->                              ... <!-- /lyceum:a11y -->
<!-- lyceum:header page="databases" -->           ... <!-- /lyceum:header -->
<!-- lyceum:footer -->                            ... <!-- /lyceum:footer -->
```

Attributes on the opening marker survive across runs and steer the output:

- **`target`** on `skiplink` — where the skip link jumps. Defaults to
  `#main-content`.
- **`search`** on `skiplink` — adds a second link, "Skip to search". Both sit
  off-screen until focused and share one focused position, so only the focused
  link is ever visible. Use it on any page with a search field: one link
  labelled "Skip to main content" that lands a screen reader user inside a form
  field is a mislabelled control.
- **`page`** on `header` — which nav item gets `active` and
  `aria-current="page"`. Must match an `id` in `chrome.json`. Omit for pages
  that are not nav destinations, such as `404.html`.

A page with no markers is left alone and reported at the end of the run.

## Paths

Asset paths are rewritten per file depth, so a page at
`newsletter/issues/<slug>/` receives `../../../` without anyone thinking about
it. A page at a new depth needs no configuration. Two exceptions:

**Fonts.** `chrome.json` → `fontsUrl` is one canonical absolute path,
`/librarylyceum/lyceum-fonts.css`. Browsers cache by URL, so every page in the
network shares one cache entry. This is the only asset addressed this way,
because a font that fails to load falls back to the next stack entry and the
page stays usable. A stylesheet or script would not degrade so gracefully.

**Pages served from an unpredictable depth.** GitHub Pages returns `404.html`
in place of *any* missing URL, at any depth, so a relative prefix computed from
its own location resolves wrongly for a visitor who mistyped a deep path. Files
listed in `absoluteBaseFiles` get `absoluteBase` instead.

## Adding a nav item

Edit the `nav` array in `chrome/chrome.json`, run the build, commit. The item
appears on every page with the right relative path and the right active state.
Before this existed the same change meant editing nine files by hand.

---

# Search

One search across the databases, the research guides, and the newsletter.

| Path | Contents |
| --- | --- |
| `build/build-index.js` | Reads every collection, writes the index |
| `data/search-index.json` | The committed index. Generated — do not hand-edit |
| `search.html` | The page; its own styles are inline, as elsewhere |
| `search.js` | Query handling, grouping, URL state |

`search.js` needs `vendor/vendor-fuse.js` and `lyceum.js`. Not Papa Parse — the
CSVs are read at build time, not in the browser.

Run it after editing `data/databases.csv`, `data/guides.csv`, or the newsletter
manifest. `--check` compares records only, ignoring the generated date, so a
day passing is not a failure. Rows missing a URL or title, and duplicates, are
warned about rather than fatal.

## Why the index is built rather than fetched

The page loads one committed file instead of fetching each collection at search
time. A collection being briefly unreachable therefore makes the index stale,
never broken.

## Guide sections

Each guide publishes `lyceum.json` at its root, listing sections it already has
anchors for:

```json
{
  "lyceum": 1,
  "title": "Citation Station: MLA Format",
  "sections": [
    { "title": "Works Cited", "anchor": "#workscited", "keywords": [] }
  ]
}
```

These are read from the **sibling directory** (`../<slug>/lyceum.json`), not
over the network, so the build works offline and depends on no site being
reachable. A guide with no descriptor stays indexed at guide level.

**No guide's HTML was edited to make this work.** Every anchor already existed.
Two guides build their content from JavaScript templates, so there is nothing
static to anchor to; both remain searchable at guide level.

**Sections are not results.** Thirty-seven sections listed alongside
seventy-four databases would swamp the page — a search for "citation" would
return fourteen rows, half of them near-identical. Instead each guide appears
once and offers only the sections that matched, as jump links on its own card.
A query matching a guide's title but no particular section offers that guide's
whole contents rather than nothing.

**Keywords.** Sections may carry a `keywords` array. It never renders. It exists
so an evocative title can stay evocative and still be found — "The Familiar
Territories" reachable by a student typing "google". The arrays ship empty;
they are yours to fill.

**Connectives are ignored.** Matching drops `and`, `the`, `for`, `of` and
similar before comparing. Without that, "style and grammar" also lit up "Tables
and Figures".

## Result ordering

Fixed: **Research Guides, Databases, Newsletter.** Guides come first because a
student searching a topic is better served by the resource built for their
assignment than by the general collection. Databases outnumber guides
twenty-five to one, so ordering by count would bury the bespoke work. Empty
groups are omitted.

## Match tuning

All three implementations — `search.js`, `databases.js`, `guides.js` — use a
Fuse threshold of **0.20**, tightened from 0.35. Measured against exact-substring
ground truth across ten representative queries:

| threshold | mean precision | mean recall |
| --- | --- | --- |
| 0.35 | 0.42 | 1.00 |
| 0.30 | 0.54 | 1.00 |
| 0.20 | 0.85 | 1.00 |

Recall does not move; the looser setting adds only noise. At 0.35 a search for
"citation" returned 44 records of which 7 were genuine. At 0.20 it returns
exactly the 7. Fuzziness still earns its place — "biography" reaches
"bibliography" — so this is a tightening, not a switch to exact matching.

## URL state

`?q=` and `?type=` are reflected in the address bar and restored on load, so any
search is a shareable link. Typing uses `replaceState`; changing the type filter
uses `pushState`, so Back steps through filters rather than keystrokes.

## Copy

Three pieces of user-facing wording live outside the templates and are yours:
the page description in `search.html`, and the idle-state invitation and
no-results message in `search.js`.

---

# Preferences

Every site in the network is served from `mistertlibrary.github.io`, so they
share one `localStorage` — but not a vocabulary. Six shapes grew independently:

| Site | Storage | Sizes | Fonts | Themes |
| --- | --- | --- | --- | --- |
| Hub | `lyceum-size/font/theme` | `small` `medium` `large` | `serif` `sans` `dyslexic` | `light` `dark` `contrast` |
| MLA, APA | JSON blob under `cs_a11y` | `s` `m` `l` | `serif` `sans` `dys` | `light` `dark` `contrast` |
| RB: Getting Started | `gs_size/font/theme` | `s` `m` `l` | `serif` `sans` `dys` | `light` `dark` `contrast` |
| RB: Searches & Sources | `rb_size/font/theme` | `s` `m` `l` | `serif` `sans` `dys` | `light` `dark` `contrast` |
| Image Clearinghouse | `ic_size/font/theme` | `s` `m` `l` | `serif` `sans` | `light` `dark` `contrast` |
| On Annotation | `ann_size/font/theme` | `1` `2` `3` | `serif` `sans` `dyslexia` | `light` `dark` `contrast` |
| Babel | `cat-theme` | — | — | `light` `dark` |

The two Research Basics guides look like one shape and are two: Getting Started
uses `gs_`, Searches & Sources uses `rb_` for preferences and `gs_` for saved
worksheet fields.

`lyceum-prefs.js` reconciles them without editing a line of any guide's own
code. It reads the hub value, translates it into that guide's vocabulary, and
writes it under that guide's own key before the guide's script runs — so the
guide's existing restore logic finds what it always expected. It wraps
`localStorage.setItem` to mirror writes back. Only the three preference keys per
guide are intercepted; game state, worksheet fields, and cached covers pass
through.

**A stored value is a choice; a start-up default is not.** Guides apply their
own defaults on load through `localStorage` like anything else — Searches &
Sources writes `rb_font="sans"` on every visit. Mirroring those would let the
first guide a student happens to open set the network typeface. So the shim
arms its interceptor only after the document is parsed: defaults are applied
during parsing, choices arrive later as clicks.

**Three refusals.** The Image Clearinghouse ships no dyslexic face, so that
dimension is never pushed to it. Babel's time-of-day theme default survives
unless a reader has actually chosen a theme. And no guide's start-up default is
treated as a preference.

**Seeding.** If the hub holds a value it wins. If not, the guide's existing
value seeds the hub. An established choice is adopted, never overwritten.

## Installation

One line in each guide's `<head>`, before its own scripts, changing only
`data-guide`:

```html
<script src="/librarylyceum/lyceum-prefs.js" data-guide="mla"></script>
```

Installed in `mla`, `apa`, `annotation`, `rbgettingstarted`,
`rbsearchesandsources`, `imageclearinghouse`, and `babel`. `crusades` and
`summerreading2026` store no preferences and need nothing. An unrecognized
`data-guide` makes the shim inert rather than erroneous.

## Degradation

If the file fails to load, every guide keeps its own preferences exactly as
before. Nothing depends on the sync; the sync depends on nothing. A test blocks
the request mid-session and confirms each guide still restores unaided.

## Testing

`node build/test-prefs.js`, and it runs as part of the main build. Its last
section walks every option each guide's panel actually offers — 55 of them — and
asserts each survives a round trip out to the hub vocabulary and back. That
table is written from the guides' live markup rather than from the shim's own
adapters, so a typo in a mapping fails the suite instead of agreeing with
itself.

---

# Newsletter

| Path | Contents |
| --- | --- |
| `newsletter/index.html` | The archive: every issue, with search and an audience filter |
| `newsletter/issues/index.json` | The manifest. The archive reads only this |
| `newsletter/issues/_template/` | Copy this to start an issue. Not published |
| `newsletter/issues/<slug>/index.html` | The shell. Identical everywhere but five meta lines |
| `newsletter/issues/<slug>/issue.md` | The issue: front matter plus Markdown |
| `newsletter.css` | Newsletter styles; depends on tokens in `lyceum.css` |
| `newsletter-render.js` | How an issue.md becomes an issue. Shared by the published page and the composer |
| `newsletter-issue.js` | The published page: fetch, render, previous/next |
| `newsletter-archive.js` | Archive logic |
| `mediumisthemassage.html`, `.js` | The drafting desk. Named unobviously on purpose |

## Publishing an issue

Open **`mediumisthemassage.html`** and write. It is not linked from the navigation — a
drafting desk is not a destination for students — so bookmark it.

1. Fill in the title and dek. The folder name follows the title until you touch
   it; it becomes the issue's web address, so it is worth choosing.
2. Write. The toolbar handles sections, glosses, quotes, lists, rules,
   footnotes, links, and figures, so no syntax has to be remembered.
3. Press **Choose the newsletter folder** once and point it at `newsletter/`.
   Chrome and Edge remember it for the session.
4. Press **Save issue**. It writes `issues/<folder>/issue.md`, that issue's
   `index.html` with all seven meta tags filled in, and the updated manifest.
5. Commit in GitHub Desktop.

`node build/check-issues.js` still exists and still validates the same things.
It is now a second opinion rather than the only guard: the composer will not
emit a mismatch between front matter and manifest, because it writes both.

### Doing it by hand

Copy `_template/` to `issues/<slug>/`, edit the seven marked meta lines at the
top of its `index.html`, write `issue.md`, add the entry to `index.json`, and
run the validator. This is what the composer automates; it still works.

## What the composer guarantees

The preview is not a rendering *like* the published page. `newsletter-render.js`
holds the single implementation of how an `issue.md` becomes an issue, and both
the composer and every published issue load it. A change to footnote handling
or contents building changes both at once, so the preview cannot drift into a
comfortable lie. A test asserts it: it renders the emitted markdown through the
same function and compares the result to the preview, character for character.

The writing surface is two layers. A `<pre>` underneath carries the text with
its structural marks dimmed; a transparent `<textarea>` on top carries the
caret, the selection, and the spellchecker. Every property that affects where a
glyph lands is declared once for both, so they cannot fall out of register.
Color is the only difference — a change in weight or size would move the text.

**One deliberate divergence.** Raw HTML passes through `marked` untouched, which
is how the `<figure>` block works. The composer's preview renders such markup but
refuses to *run* it: scripts are stripped and inline event handlers removed. Text
arrives in a composer by paste, and that page holds both the saved draft and,
once a folder is chosen, permission to write into the newsletter directory. An
inline `onclick` would do nothing in the preview and something on the published
page, which is a good reason not to write one.

## The lock

Optional, and off by default. Open the composer, press **Set a passphrase**,
choose one, and paste the line it gives you into `mediumisthemassage.js`:

```js
var PASSPHRASE = "sha256-…";
```

The passphrase itself is never stored, never sent, and never shown again — only
its hash goes in the file. Once set, the desk asks on arrival and then remembers
for twelve hours. Changing the passphrase invalidates every remembered unlock.

**What it is, and is not.** A lock on a cupboard door, not on a vault. The page
and its script are public files on a public site; anyone who reads the source
can walk around the check. The repository is public too, so the unobvious
filename hides the page from someone guessing URLs, not from anyone who thinks
to look at the repository. The hash means the passphrase is not sitting in plain
view, and nothing more.

It is deliberately **not** listed in `robots.txt`. That file is public, so a
Disallow line is a short directory of the parts of a site somebody did not want
found. The page carries a `noindex` meta tag instead, which is also the correct
mechanism: Google's guidance is that a page blocked in `robots.txt` can never be
crawled, so its `noindex` is never read, and it can still be indexed from an
external link.

That is enough, because there is nothing here worth taking. **The composer
cannot publish.** It writes only to a folder the person at the keyboard has
personally granted through a browser permission prompt — their own machine.
A student who got past the gate could write a fake issue and save it to their
own laptop. The repository, and therefore the site, is untouched.

So the lock is for clarity rather than defence: it tells anyone who wanders in
that this is not a page for them. The real protection is that the tool has no
power over anything but the disk of whoever is using it.

## The draft

One draft at a time, in the browser's own storage, so a closed tab is not a lost
afternoon. It is a convenience and not a store: an issue exists once it is saved
to disk. **Start a new issue** clears it.

## Front matter

```
---
number: 3
date: 2026-10-06
title: The title of the issue
dek: One or two lines of summary.
audience: students | faculty | both
tags: reading, databases
---
```

`number` drives previous and next links and must be unique. `date` is
`YYYY-MM-DD`, rendered as a long American date and parsed as UTC so it does not
slip a day west of the meridian. `audience` sets the badge and the archive
filter; `both` appears under every setting.

The same five values must also appear in `index.json`. That duplication is
deliberate — the archive renders from one small file rather than fetching every
issue — and `check-issues.js` keeps the two in step.

## Markdown

GitHub-flavoured, with two local conventions.

**Contents glosses.** A brace at the end of an H2 becomes the gloss in the
contents list and is stripped from the heading:

```
## Links and recommendations {a wide net this month}
```

The contents list is built only when an issue has two or more H2s.

**Footnotes.** marked has no footnote support, so `newsletter-issue.js` handles
`[^id]` references and definitions itself before parsing. Notes are renumbered
in order of first appearance, collected at the foot, and given return links.
Definitions may sit anywhere in the file.

Raw HTML passes through unescaped, which is how the `<figure>` block in the
template works.

## A note on markup

`lyceum.css` styles the bare `header`, `nav`, and `footer` elements for the site
chrome. The newsletter therefore builds its masthead, contents, colophon, and
issue navigation as `div` elements carrying `role="navigation"` where
appropriate, rather than as semantic landmarks that would inherit the site
header's flex layout. Changing them back to `<nav>` or `<header>` breaks the
layout.

## Before launch

The archive's title, description, and dek are written. What is left:

- The two `sample-` issue folders and their manifest entries. Delete both once
  there is real copy.
- `COLOPHON_HTML` at the top of `newsletter-issue.js` — empty by default, in
  which case no colophon renders. Optional.
- No `feed.xml` yet. The manifest has everything an RSS feed needs.
