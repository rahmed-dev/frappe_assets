# The public contract

This file answers one question: **what may a consuming app depend on, and what
is free to change under it?**

Everything listed here is a promise. Breaking any of it is a **major** version
bump with a migration note in `CHANGELOG.md`. Everything *not* listed here is
internal — it may be renamed, split or deleted in a patch release, and an app
that reached into it gets to keep both pieces.

The reason this file exists: a Desk page depends on this toolkit through three
separate channels, and two of them have **no build-time check at all**. A
renamed JS export fails loudly. A renamed CSS class or custom property fails
silently — the page renders, and it is simply wrong until a human opens it.

---

## 1. JavaScript — the `index.js` exports

Imported as `frappe-assets/dashboard`.

| Export | Kind | Promise |
|---|---|---|
| `Dashboard` | class | Constructor `(page, options)`; options as documented in `dashboard/README.md § Dashboard options`. |
| `render` | function | `(container, spec)`. Pure — builds markup, never fetches. |
| `chart` | function | `(el, option, on_click)` |
| `sparkline` | function | `(el, config)` |
| `palette` | function | `()` → the resolved colour object |
| `token` | function | `(name, fallback)` |
| `colour` | function | `(colours, tone)` |
| `markers` | function | `(list, colours)` |
| `bounds` | function | `(values, {include, pad, step})` |
| `drill` | function | `(descriptor, context)` |
| `tone`, `TONES` | function / object | The tone vocabulary |
| `fmt` | namespace | `esc · blank · count · percent · date · duration · delta · trend` |

**`./dashboard/dash.scss` is also public**, imported from an app's SCSS bundle as
`@use "~frappe-assets/dashboard/dash.scss"`.

Nothing else is. Importing a module by path — `frappe-assets/dashboard/render.js`
— is not supported; `package.json` `exports` is written to make that fail.

## 2. The spec vocabulary

**`dashboard/README.md` is the specification, and all of it is contract**: panel
type names, every documented key on every panel, the tone names, and the `drill`
descriptor shapes.

In particular these, because they are the ones that get "tidied":

- Panel types: `kpis · fields · card · bars · rows · table · chart · text ·
  section · split · grid · html`
- Table cell object: `{ value, tone, pill, tag }`; table row: `tone`, `drill`
- Tone names: `success · warning · danger · info · quiet`, plus the `rows`
  panel's directions `rising · easing · steady · quiet`
- Drill descriptor: `{ doctype, filters, date_field }` | `{ route }` |
  `(context) => …`, with `context = { item, range, point }`

Adding an **optional** key is a minor bump. Renaming one, removing one, or
changing what an existing value does is major.

## 3. CSS class names a page may key on

A Desk page ships its own stylesheet, and page-local rules have to attach to
something. These class names are stable:

| Class | What it marks |
|---|---|
| `.dd-page` | the dashboard body — the anchor for every token |
| `.dd-host` | the Desk page wrapper (carries the width cap) |
| `.dd-card` | a card |
| `.dd-table` | a `table` panel |
| `.dd-num` | a numeric cell |
| `.dd-cell-{tone}` | a toned cell |
| `.dd-row-{tone}` | a toned row |
| `.dd-pill`, `.dd-pill-{tone}` | a pill |
| `.dd-tag` | a cell tag |
| `.dd-bar`, `.dd-bar-label` | a `bars` row and its label |

Every other `dd-` class is internal.

**A page-local rule must not rely on beating the shared sheet by specificity
alone.** `Page.load_assets` loads a page's CSS by filename with no controllable
order against `app_include_css`. Scope under the page's own `page_class` and
state enough of the structural selector to win — see `dash.scss` on why
`.dd-page .dd-table tbody td` outspecifies a lone modifier class.

## 4. CSS custom properties a page may read

All are declared on `.dd-page` and re-declared in the dark block.

- **Colour:** `--dd-text`, `--dd-text-muted`, `--dd-text-subtle`, `--dd-surface`,
  `--dd-surface-alt`, `--dd-border`, `--dd-border-strong`, `--dd-border-subtle`,
  `--dd-accent`
- **Status:** `--dd-success`, `--dd-warning`, `--dd-danger`, `--dd-info`, each
  with a `-bg` and `-fg` variant, plus `--dd-neutral-bg` / `--dd-neutral-fg`
- **Series ramp:** `--dd-series-1` … `--dd-series-5`
- **Space:** `--dd-space-1 · 2 · 3 · 4 · 6 · 8`
- **Type:** `--dd-text-xs · sm · base · md · xl`
- **Shape:** `--dd-radius-sm · md · pill`
- **Elevation:** `--dd-shadow-xs`, `--dd-shadow-md`
- **Layout:** `--dd-measure` (override it on `.dd-host` to widen a page)

Names not on this list are internal — `--dd-bar-*`, `--dd-enter-*`,
`--dd-ease-*`, `--dd-bar-delay` and friends exist for the stylesheet's own use.

**Write the name exactly.** A misspelt custom property does not error; it falls
through to the `var()` fallback, so the page keeps working and quietly stops
following the design system. Both real cases found so far were this:
`--dd-font-sm` (the token is `--dd-text-sm`) and `--dd-radius` (`--dd-radius-md`).

## 5. What is explicitly NOT contract

- Module layout under `dashboard/` — file names, which module a helper lives in,
  the split between `render.js` and `charts.js`.
- The generated HTML **structure**: element nesting, wrapper divs, attribute
  order. Key on the class names above, never on `> div > div`.
- Any `dd-` class or `--dd-*` token not listed in §3 / §4.
- `demo/` — the gallery is a development tool. It is cloned into consumers as a
  side effect of yarn's git-dependency handling, and depending on it is a bug.
- Exact colour values, spacing values, and the ECharts option defaults inside
  `base_option`. These are tuned; that is what tuning means.

---

## Version rules

Semver, with the following meaning for this package.

| Bump | When |
|---|---|
| **major** | Anything in §1–§4 changes meaning, is renamed or is removed. Also: any change that alters what an existing, unchanged spec renders. |
| **minor** | New panel, new optional key, new export, new token, new tone. Existing specs render identically. |
| **patch** | Bug fix, doc change, internal refactor. Existing specs render identically. |

The test is always the same: **take an untouched consuming page and this new
version — does anything the reader sees move?** If yes it is major, however
small the diff looked.

While the package is `0.x`, a major bump moves the **minor** digit — `0.2.0` to
`0.3.0` — because that is what semver says about zero-major packages, and
consumers pin exact tags anyway.

See `CONTRIBUTING.md` for how to make a change and cut a release, and
`CHANGELOG.md` for what each version did.
