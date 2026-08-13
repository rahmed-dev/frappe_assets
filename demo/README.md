# Gallery

Every panel and every chart type the dashboard toolkit can draw, on one page,
with sample data. Use it to pick a chart before building a dashboard, and to
check that a change to `dashboard/` did not break something you were not
looking at.

```bash
yarn install     # once
yarn demo        # rebuild after any change under dashboard/
```

Then open `demo/index.html`. No server needed — the bundle is an IIFE and the
`<script>` tag carries no `type="module"` precisely so that `file://` works.
`?theme=dark` opens straight into the dark palette; the button in the corner
toggles it live.

## What it proves

It imports the real `dashboard/` modules. Nothing is reimplemented, so a panel
that draws here draws on a Desk page and a panel that breaks here is broken
there too. Three things are only checkable from this page:

- the dark palette, on every chart type rather than the two a given dashboard
  happens to use
- the theme toggle rebuilding live canvases (`charts.js` watches `data-theme`
  on `<html>`; a canvas cannot restyle itself)
- the entrance and bar animations, which need a first paint to exist at all

## Files

| File | |
|---|---|
| `index.html` | page shell, theme button, and the only CSS the gallery owns |
| `gallery.js` | sample data, one option per chart type, the spec, the mount loop |
| `gallery.scss` | one `@use` of `ui/styles/dash.scss` — nothing else |
| `frappe-stub.js` | the five Frappe globals the toolkit reads |
| `build.mjs` | esbuild + sass; writes the two gitignored bundles |

## Things that will bite

**`frappe-stub.js` must stay listed in the root `sideEffects` array.** It is a
bare import for its side effects alone, and under a blanket `"sideEffects":
false` esbuild deletes the import — the page then dies on the first `__()` with
a blank screen and one console line.

**Chart options here are examples, not the toolkit's opinion.** Where an option
sets a colour, a dash pattern or a label position, there is a comment saying
what forced it. Most of those are consequences of the monochrome ramp: two grey
lines need a dash to be told apart, a treemap needs the dark end of the ramp to
keep one label colour legible. Copy the reasoning, not the numbers.

**The stub's `set_route` logs instead of navigating.** Drill targets are
therefore visible in the console and nowhere else. Drill-down itself — the click
and keyboard binding — lives in `controller.js` and is not exercised here.
