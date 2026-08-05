# frappe_assets

Shared assets for Frappe/ERPNext apps. Three unrelated things live here; read
only the section you are working in.

| Directory | What it is | Consumed how |
|---|---|---|
| `dashboard/` | The Desk dashboard toolkit — a design system plus a spec renderer | `yarn add` this repo, then import |
| `server_scripts/` | Standalone Server Script bodies | Copy-pasted into a site's Server Script doc |
| `console_scripts/` | One-off `bench console` snippets | Pasted into a console, never run unattended |
| `docs/` | Framework notes | Read |

Everything below the first section is about `dashboard/` only. The snippet
directories are deliberately *not* a package — they are text to paste, and
turning them into code would imply a support contract this repo does not have.

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

Dark mode is detected from `[data-theme]` on `<html>`. `frappe.ui.set_theme()`
resolves "automatic" to a concrete value *before* stamping that attribute, so
`[data-theme="dark"]` covers Light, Dark and Automatic. **Never style on
`data-theme-mode`** — that holds the user's *choice*, so it can literally read
`"automatic"`.

---

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
- **`frappe.format(v, {fieldtype: "Int"})` returns HTML**, not a string —
  `<div style='text-align: right'>2</div>`. Passing it to `.text()` prints the
  markup on the page. Use `Number(v).toLocaleString()`.
- **`frappe.require("<name>.bundle.js")`** resolves a built bundle by name
  without needing `app_include_js`.
- **Canvas cannot read `var(--token)`.** Chart colours must be resolved to
  concrete strings via `getComputedStyle` before being handed to ECharts, and
  re-resolved when the theme changes.

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
