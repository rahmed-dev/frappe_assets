# Migrating from v0.3.0 to v0.4.0

Three edits, and only the first one is required of every app.

Nothing in the **spec vocabulary** moved. Every panel type, every key, every tone
name and every drill shape renders exactly as it did — a v0.3.0 spec is a v0.4.0
spec. No CSS class and no `--dd-*` token moved either.

---

## 1. Import the charting engine — required if you draw charts

```js
// <app>/public/js/dash.bundle.js
export * from "frappe-assets";
import "frappe-assets/charts/echarts";   // ← add this line
```

ECharts is no longer part of the barrel. Importing that module is what registers
the engine; without it, a `{type: "chart"}` panel throws `NoChartEngineError`
with the same line in its message, and a `rows` sparkline is quietly skipped
rather than drawn.

**If your dashboards draw no charts, add nothing and delete `echarts` from your
app's dependencies.** That is the point of the change. Measured with esbuild,
minified:

| Bundle | Size |
|---|---|
| the barrel alone | 23 KB |
| the barrel plus `charts/echarts` | 736 KB |

The barrel used to be the second number for everyone.

`chart()` and `sparkline()` are now exported from `frappe-assets/charts/echarts`
rather than from the barrel. `palette`, `token`, `colour`, `markers` and
`bounds` stay on the barrel — they resolve design tokens and axis numbers and
never touched the engine.

## 2. `render_to_string(spec).charts` is now `.mounts`

Only affects an app that calls the renderer by hand and mounts charts itself.
The array is no longer chart-specific: each entry is `{panel, data}`, where
`panel` is the name of the panel type that claimed the slot. The markup carries
`data-dd-mount="<index>"` where it used to carry `data-dd-chart`.

```js
// before
pass.charts.forEach(...)                    // and a switch on entry.kind

// after
body.querySelectorAll("[data-dd-mount]").forEach((el) => {
  const entry = pass.mounts[Number(el.getAttribute("data-dd-mount"))];
  panels.find(entry.panel)?.mount?.(el, entry.data, { range: () => ({}), follow: () => {} });
});
```

`new Dashboard(...)` does this itself and needs no change.

The empty-slot convention is gone with it. A `rows` item with a flat series used
to render `data-dd-chart=""` and the loop skipped it; now it renders no attribute
at all, so nothing has to know to skip anything.

## 3. Nothing else

`Dashboard`, `render`, `fmt`, `tones`, `drill`, the host interface and the
stylesheet import are all unchanged.

---

## What you gain

**A panel registry.** `panels.define(name, {render, mount, unmount})` — a panel
your app writes is the same kind of thing as a built-in one, so the next time a
table needs behaviour the toolkit has no key for, the answer is a panel rather
than `{type: "html"}` and hand-rolled escaping.

**A mount phase for every panel, not only charts.** `mount` is handed its element
after layout and returns its own teardown, which the controller runs before the
next draw. A sortable table, a map, an inline editor now have somewhere to live
that does not leak across a refresh.

**Lifecycle events.** `new Dashboard(page, {on: {after_fetch, after_render,
error, ...}})`, or `dashboard.on(...)` for the unbinder. Timing a query or
logging a failure no longer means wrapping `fetch` or mutating `spec`.

**A charting engine behind an interface.** Register your own with
`engines.define(name, engine)` and `use_engine(name)`; a `{type: "chart"}` spec
keeps working.

See `CONTRACT.md` §6–§8 for the exact shapes, all three of which are contract
from this release.
