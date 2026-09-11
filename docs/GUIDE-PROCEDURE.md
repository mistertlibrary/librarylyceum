# Creating a new Lyceum guide

Every guide in the Lyceum family is its own repository, served from
`mistertlibrary.github.io/<slug>/`, and shares a frame with the hub:
fonts, favicon, reading preferences, top bar, and footer. Inside that
frame, each guide keeps its own look.

## 1. Intake

Complete the intake form (`lyceum-guide-intake.html`) and hand the brief
to Claude. Blank fields come back as open questions before any build
begins.

## 2. Slug and repository

- Lowercase letters, numbers, and hyphens only.
- Create `mistertlibrary/<slug>` and enable GitHub Pages from `main`.
- The slug appears in three places: the repository name, the `og:url`
  tag, and the `guides.csv` row. Change all three together or none.

## 3. Build from the starter

Copy `private-tools/guide-starter/index.html` into the new repository and
replace every `{{TOKEN}}`. The starter lives outside every repository so it
never publishes. It already carries the network frame:

- **Reading preferences.** An inline script in the head applies saved
  settings before first paint. It reads and writes the hub keys directly:

  | Key | Values |
  |---|---|
  | `lyceum-size` | `small`, `medium`, `large` |
  | `lyceum-theme` | `light`, `dark`, `contrast` |
  | `lyceum-font` | `serif`, `sans`, `dyslexic` |

  A guide that uses these keys needs no entry in `lyceum-prefs.js`.
  Adapters exist only for older guides with their own keys.
- **Fonts.** Loaded from `/librarylyceum/fonts/`. No third-party
  requests. If the hub is unreachable, the fallback stack renders.
- **Favicon and share card.** Hub favicon; `og:` tags point at the
  guide's own URL and the hub's `og-image.png`.
- **Chrome.** Skip link; top bar reading "WEHS Library Lyceum research
  guides presents..." with the link to `/librarylyceum/guides.html`;
  Lyceum footer; the "Aa" panel in the bottom-right corner.
- **Page title.** `Guide Title — WEHS Library Lyceum`, matching the
  network convention.

Palette, hero, and section design are per-guide. Keep the frame intact.

Add `lyceum.json` at the repository root, modeled on a sibling guide's.
The hub's search build reads it from `../<slug>/lyceum.json`.

## 4. Content

- House style: centered headings, no em dashes in authored prose,
  Strunk and White concision, no code comments.
- Student-facing prose is Mister T's. Claude drafts only on request, and
  every draft passes through the two-column review tool first.
- Every factual claim is checked against at least two live,
  authoritative sources. Claims with one source are flagged; claims with
  none are cut.
- Citation style is chosen at intake.

## 5. Verify, then publish

1. Push the repository.
2. Load the live page. Confirm hub fonts load, the "Aa" panel saves and
   restores settings, and preferences carry over from the Lyceum.
3. Run the link check on every outbound URL, from school and home
   networks.
4. Test light, dark, and high-contrast themes and all three typefaces.

## 6. List it

Only after step 5, add one row to `librarylyceum/data/guides.csv`:

```
Title,URL,Description,Course,Subjects,Series
```

- Description is Mister T's wording, verbatim.
- Subjects come from `subjects.js`, pipe-separated.
- A guide listed before it is live sends students to a dead link.
