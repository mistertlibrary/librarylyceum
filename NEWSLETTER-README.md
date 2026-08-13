# Newsletter

Append this to the existing `README.md`, or keep it separate. Same rules as the
rest of the Lyceum: static files, no build step, no external network calls.

---

## File map

| Path | Contents |
| --- | --- |
| `newsletter/index.html` | The archive. Lists every issue, with search and an audience filter. |
| `newsletter/issues/index.json` | The manifest. The archive reads only this file. |
| `newsletter/issues/_template/` | Copy this folder to start a new issue. Not published; the validator skips it. |
| `newsletter/issues/<slug>/index.html` | The issue shell. Identical in every issue except five meta lines. |
| `newsletter/issues/<slug>/issue.md` | The issue itself. Front matter plus Markdown. |
| `newsletter.css` | Newsletter styles. Depends on tokens declared in `lyceum.css`. |
| `newsletter-archive.js` | Archive logic. |
| `newsletter-issue.js` | Front matter parser, footnote handling, contents builder, issue navigation. |
| `vendor-marked.js` | marked 18.0.9, MIT. Unmodified. |
| `MARKED-LICENSE.txt` | marked's license, kept beside the vendored copy. |
| `check-issues.js` | Validator. Run with `node check-issues.js` from the repo root. |

The shared chrome (skip link, accessibility panel, header, nav, footer) is
pasted into both page shells, matching `databases.html` exactly except for the
relative asset paths and the active nav item.

---

## Publishing an issue

1. Copy `newsletter/issues/_template/` to `newsletter/issues/<slug>/`.
2. Edit the six marked lines at the top of `index.html`: title, description,
   og:title, og:description, og:url, and the two twitter tags. They sit inside
   a marked block. Nothing else in that file changes, ever.
3. Write `issue.md`.
4. Add the issue to `newsletter/issues/index.json`.
5. Run `node check-issues.js`. It fails loudly if the front matter and the
   manifest disagree, if a placeholder survived step 2, if the og:url points at
   the wrong slug, or if an issue number repeats.
6. Commit.

---

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

`number` drives the previous and next links and must be unique. `date` must be
`YYYY-MM-DD` and is rendered as a long American date, parsed as UTC so that it
does not slip a day for readers west of the meridian. `audience` sets the badge
and controls the archive filter. An issue marked `both` appears under every
filter setting.

The same five values must appear in `index.json`. That duplication is
deliberate, so the archive renders from one small file rather than fetching
every issue. `check-issues.js` exists to keep the two in step.

---

## Markdown

Standard GitHub-flavored Markdown, with two local conventions.

**Contents glosses.** A brace at the end of an H2 becomes the gloss in the
contents list and is stripped from the heading itself.

```
## Links and recommendations {a wide net this month}
```

The contents list is built only when an issue has two or more H2s. Anchors are
generated from the heading text using the same `slug` helper as the catalog
pages.

**Footnotes.** marked has no footnote support, so `newsletter-issue.js` handles
`[^id]` references and `[^id]:` definitions itself before parsing. Notes are
renumbered in order of first appearance, collected at the foot of the issue,
and given return links. Definitions may sit anywhere in the file.

Raw HTML passes through unescaped, which is how the `<figure>` block in the
template works. Since you are the only author, this is a convenience rather
than a risk, but a stray tag will render rather than display.

---

## Script load order

The issue page loads three scripts, all deferred, which guarantees they
execute in document order:

```
vendor-marked.js -> lyceum.js -> newsletter-issue.js
```

The archive loads `lyceum.js` then `newsletter-archive.js`. It does not need
the parser.

`newsletter-issue.js` uses `window.Lyceum.escHtml` and `window.Lyceum.slug`.
`newsletter-archive.js` also uses `window.Lyceum.debounce`. No other shared
helpers are touched.

---

## Paths

Issue pages sit three levels below the repo root and reference shared assets as
`../../../`; the archive sits one level down and uses `../`. Because every
issue lives at the same depth, this never changes.

The only root-absolute URLs are the `og:` and `twitter:` meta tags, which is the
one place a repository rename would need attention, same as `404.html`.

## A note on markup

`lyceum.css` styles the bare `header`, `nav`, and `footer` elements for the site
chrome. The newsletter therefore builds its masthead, contents, colophon, and
issue navigation as `div` elements carrying `role="navigation"` where
appropriate, rather than as semantic landmarks that would inherit the site
header's flex layout. Changing them back to `<nav>` or `<header>` will break the
layout.

---

## Placeholders left for you

- The archive `<h1>` and its one-line description in `newsletter/index.html`,
  plus the three `PLACEHOLDER` description meta tags in the same file.
- `COLOPHON_HTML` at the top of `newsletter-issue.js`. Empty by default, in
  which case no colophon block renders.
- The two `sample-` issue folders and their manifest entries. Delete both once
  you have real copy.
