# frappe_assets

The Desk dashboard toolkit for Frappe/ERPNext apps. One thing, two directories.

| Directory | What it is | Consumed how |
|---|---|---|
| `dashboard/` | The toolkit — a design system plus a spec renderer | `yarn add` this repo, then import |
| `demo/` | The gallery: every panel and chart type on one page, no bench needed | `yarn demo`, open `demo/index.html` |

**This repo is a front-end package and nothing else.** Server Script bodies,
console snippets and framework notes moved to `rahmed-dev/dev_kb` under
`frappe/`. Do not add them back: yarn clones an **entire** git dependency —
`files: ["dashboard"]` does not apply — so anything here lands in the
`node_modules` of every app that wants the toolkit.

**This repo is public.** It is installed over plain HTTPS with no credentials,
which is what lets a fresh bench run `yarn install` for a consuming app. Nothing
site-specific, no keys and no customer data may land here. The last thing removed
from this repo was a diagnostic carrying a real employee's name and id.

**Changing anything under `dashboard/` means re-running `yarn demo` and looking
at the gallery.** It is the only place the chart types nobody has used yet are
visible at all, and the bugs it has caught were invisible on the one dashboard
that exists — most recently a toned table cell that rendered in body ink because
`tbody td` outspecified it, which looked exactly like the tone never being
passed. Both themes, every time.

---

## How an app consumes `dashboard/`

```bash
cd apps/<your_app>
yarn add rahmed-dev/frappe_assets
```

Then two thin bundle files in the app — that is the whole integration:

```js
// <app>/public/js/dash.bundle.js
export * from "frappe-assets/dashboard";
```

```scss
// <app>/public/scss/dash.bundle.scss
@use "~frappe-assets/dashboard/dash.scss";
```

### Why those two files have to exist

Frappe's esbuild only picks up files matching `public/**/*.bundle.{js,scss,…}`
inside an app (`frappe/esbuild/esbuild.js`). It will not build anything out of
`node_modules` directly. So each app needs a one-line bundle that re-exports
from here; the built asset then lands in the app's own `public/dist`, which is
what `app_include_js` / `app_include_css` and `frappe.require()` can address.

### Why `~` works in the SCSS import

`frappe/esbuild/sass_options.js` puts **every installed app's `node_modules`**
on `includePaths`, and its importer strips a leading `~`. So `~frappe-assets/…`
resolves from any app without a relative path. Do not use a relative
`../../node_modules/…` path instead — it breaks the moment the package is
hoisted to the bench root.

`echarts` is a **peer** dependency, not a direct one: the consuming app installs
it so there is exactly one copy in that app's bundle. It is optional — the
toolkit only touches it when a spec actually declares a `chart` panel.

---

## The one rule that matters: own the palette

`dashboard/dash.scss` declares its **own literal hex tokens** on the anchor
class `.dd-page`, and re-declares every themed one under
`[data-theme="dark"] .dd-page`. It does **not** build on Frappe's semantic
tokens. This is not stylistic preference — three of Frappe's tokens are traps:

- `--brand-color` resolves to `var(--primary)`, which is undefined. It paints
  **nothing**, in both themes.
- The numeric palette (`--gray-600`, `--red-500`, …) is **not** inverted for
  dark mode. A colour chosen against a light background stays that colour.
- `--card-bg` is identical to `--bg-color` in dark mode, so a card styled with
  it becomes invisible.

Anything added to `dash.scss` follows the same discipline: a new colour is a new
token in §1 **and** a re-tuned value in the dark block. The dark block wins by
specificity — `(0,2,0)` beats `(0,1,0)` — so it is purely additive and never
needs `!important`.

The palette is **monochrome**, and that reaches the charts. `--dd-series-1..5`
is a grey ramp, ordered by contrast against the surface rather than by
lightness, and it is what `base_option` hands ECharts as its `color` array. The
status colours are **not** in it: the slices of a donut and the bands of a stack
are categories, and painting them red and green asserts something about them
that is not true. A series that genuinely means "failed" says so by taking
`colours.danger` through the `(colours) => option` form of `chart()`.

A mono ramp costs you hue as a separator, so charts have to earn separation some
other way — dash a second line, drop the pale end of the ramp where labels sit
on the fill. The gallery has a worked example of each.

Dark mode is detected from `[data-theme]` on `<html>`. `frappe.ui.set_theme()`
resolves "automatic" to a concrete value *before* stamping that attribute, so
`[data-theme="dark"]` covers Light, Dark and Automatic. **Never style on
`data-theme-mode`** — that holds the user's *choice*, so it can literally read
`"automatic"`.

---

## One tone vocabulary — `dashboard/tone.js`

`success · warning · danger · info · quiet`, and every surface reads from it: a
table cell, a KPI dot, a `rows` stripe, a pill, a chart series through
`colour(palette, tone)`. Before it there were three vocabularies for the same
idea — trend words in the renderer, bare `dd-kpi-dot-*` class names, and the
palette's own keys — so nothing could share a colour with anything else and a
new panel copied a class name and hoped.

A tone states a **fact about the value**, never decoration; that is the same
rule as the colour policy above, and this map is how a panel obeys it. `quiet`
is the absence of a verdict and paints nothing: a value nobody graded must not
read as "fine". Unknown names fall back to `quiet` instead of throwing, which is
the opposite of what an unknown *panel type* does — a panel type is hand-written
and a typo is a bug, while a tone usually arrives from a backend where an
ungraded state is ordinary.

Adding a tone means an entry there **and** the matching `dd-pill-*`, `dd-cell-*`,
`dd-row-*` rules, or the map promises a colour the stylesheet does not paint.

## `{type: "html"}` is a last resort, and colour is not a reason to use it

Every other panel escapes through `fmt.esc`. When the `table` panel could not
express a coloured cell, three tables on one consuming page were rebuilt as raw
HTML strings for that alone — one of them printing values scraped off a
supplier's portal, hand-escaping per call site. If a panel is one optional field
short of doing the job, add the field.

## Class prefix

Everything is `dd-` (dashboard), anchored on `.dd-page`. Tokens are `--dd-*`.

The prefix is short on purpose but must never be dropped: this stylesheet is
loaded globally into the Desk by every consuming app, so an unprefixed
`.card` or `.row` here would restyle half of Frappe. Avoid `fa-` if a prefix is
ever reconsidered — that is Font Awesome's.

---

## Desk-page gotchas this toolkit works around

- **`Page.load_assets`** (`frappe/core/doctype/page/page.py`) loads a Desk
  page's own `.js`/`.css` by filename, raw, with no `import`. Load order against
  `app_include_css` is not controllable, so page-local CSS must never rely on
  beating the shared sheet — scope it under a distinct media query or a page
  class instead.
- **`page.custom_actions` and `page.add_field()` render in the Desk page head,
  outside the page-body wrapper.** Tokens scoped to `.dd-page` do not resolve
  there. Controls that need the design system must render *inside* the body.
- **`.layout-main-section` has no horizontal padding of its own.** `.dd-page`
  supplies the gutter; without it, cards sit flush against the sidebar.
- **The measure is capped on the page WRAPPER, not on `.dd-page`.** The
  controller stamps `dd-host` on `page.wrapper` and §2 caps both of Desk's
  `.container` elements — head and body — at `--dd-measure` (1180px). It has to
  be the wrapper for the same reason as the gotcha above: the date fields and
  the primary action live in the page head, so capping only the body centres the
  dashboard and strands the controls that drive it on the left edge. A page
  overrides the width by redeclaring `--dd-measure` on `.dd-host`.
- **Any width cap must carry frappe's `body:not(.full-width)` guard.** Desk's
  **Toggle Full Width** command (avatar menu → Display, and the command palette)
  only flips `body.full-width` and remembers it in
  `localStorage.container_fullwidth`. Every capped surface in Desk — form
  layout, Workspaces, tree view, grid row modal — opts in with that guard, and a
  surface that omits it silently ignores the toggle. This is a state class with
  a UI attached, not one of the semantic tokens this toolkit refuses to build
  on, so the "own the palette" rule does not apply to it. The measure itself
  stays ours: frappe's `--page-max-width` is 900px, sized for one form column,
  and five KPI cards inside that come out 165px wide.
- **A Desk Page has no left rail unless something claims its route.** The rail
  is built from `Workspace Sidebar.items` — a different doctype from `Workspace`,
  whose `links` only draw the cards *inside* a workspace page. With no sidebar
  item whose `link_to` matches the route, `Sidebar.set_workspace_sidebar`
  resolves nothing, `setup()` never runs, and the rail renders **blank** —
  standard items and all, not merely stale. Arriving from a workspace hides it,
  because the rail already on screen is kept when nothing resolves, so this only
  shows up when the page's URL is opened directly. Consuming apps must write a
  `Workspace Sidebar Item`, not just a `Workspace Link`.
- **`frappe.format(v, {fieldtype: "Int"})` returns HTML**, not a string —
  `<div style='text-align: right'>2</div>`. Passing it to `.text()` prints the
  markup on the page. Use `Number(v).toLocaleString()`.
- **`frappe.require("<name>.bundle.js")`** resolves a built bundle by name
  without needing `app_include_js`.
- **Canvas cannot read `var(--token)`.** Chart colours must be resolved to
  concrete strings via `getComputedStyle` before being handed to ECharts, and
  re-resolved when the theme changes.

---

## ECharts traps `base_option` exists to absorb

Each of these is a default that looks fine on one chart and wrong on the next,
which is why they are handled centrally instead of per dashboard.

- **A declared `xAxis`/`yAxis` is drawn even when no series uses it.** Handing
  the axis furniture to a pie or a funnel frames it in two empty rulers. Whether
  the caller named an axis is what `base_option` uses to decide it is cartesian;
  the same flag picks `tooltip.trigger` (`"axis"` on a grid, `"item"` off it —
  an axis trigger on a pie shows an empty tooltip).
- **Merely declaring `legend` makes ECharts draw one**, for any series whose
  data carries names. So the legend is styled *only* when the caller asked for
  one — styling it unconditionally hangs a legend over every funnel and pie.
- **`legend` does not inherit the root `textStyle`**, and its default is a fixed
  dark grey. A legend is legible on the light theme by luck and invisible on the
  dark one unless its colour is set explicitly.
- **Adding a series type is one entry in `echarts.use()`**, never a switch to
  the umbrella build. The eleven currently registered cost ~150 KB over the
  three a single dashboard needs (565 → 715 KB minified). That is affordable
  only because this bundle is pulled with `frappe.require` and is **not** in
  `app_include_js`. Putting it in a global include is what would make the number
  matter.

---

## Motion

Two things move, both switched off together under `prefers-reduced-motion`
(`dash.scss` §13e holds the single block — do not add a second one):

- **Bars grow** from zero to the width the renderer wrote inline. The keyframe
  declares only `from`, so the implicit `to` is each bar's own width and one
  rule animates every bar without the renderer knowing. It re-runs on data
  change for free, because a refresh replaces the markup and these are new
  elements. This works because an animation outranks an inline style in the
  cascade — which is also why writing `width` inline stays safe.
- **Panels arrive** on the first paint only. `controller.js#draw` puts `dd-enter`
  on the page before the first render and takes it off before the second.
  Animating every refresh would be worse than animating none: a date change
  would read as a page load, and the slower the backend the more the animation
  would look like the delay.

Headless Chrome does not advance CSS animations under `--virtual-time-budget`,
so a screenshot of the gallery is a screenshot of frame 0 — everything past the
second panel is invisible. Pass `--force-prefers-reduced-motion` when capturing.
That is a screenshot artefact, not a bug, and it has already been mistaken for
one once.

---

## Working here

- The renderer is **pure**: `render(container, spec)` builds markup from data
  and never fetches. Fetching, ranges and state live in `controller.js`. Keep
  that split — it is what makes a panel testable.
- Handlers are **delegated** from the page body, because every refresh replaces
  the markup. The only two on `document` are outside-click and Escape, and they
  are namespaced and cleared first so re-entering a page cannot stack a copy.
- Anything drillable gets keyboard activation, not just a click handler.
- No CDN loads. A Desk page must work on a LAN-only deployment.
- **The package is `"sideEffects"`-annotated.** The toolkit is pure and may be
  tree-shaken, but `demo/**` is listed because `gallery.js` imports
  `frappe-stub.js` as a bare side-effect import. Under a blanket `false`,
  esbuild deletes that import and the gallery dies on its first `__()`.
- Run `yarn demo` and look at the page before calling a `dashboard/` change
  done. Both themes — half the defects here only exist in one of them.
