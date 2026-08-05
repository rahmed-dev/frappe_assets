# Desk dashboard toolkit

A dashboard is a **spec** — a plain data structure — plus a `fetch`. The toolkit
turns that into a working Frappe Desk page: markup, theming, date ranges,
refresh, loading and error states, ⓘ explainers, drill-down, and charts.

```js
frappe.pages["my-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("My Dashboard") });

	frappe.require("my_dash.bundle.js").then(() => {
		new myapp.dash.Dashboard(page, {
			fetch: (range) =>
				frappe.call({ method: "myapp.api.summary", args: range }).then((r) => r.message),
			spec: (data, range) => ({ ... }),
		});
	});
};
```

A Desk page's own JS is loaded raw and **cannot `import`**, which is why the
toolkit arrives through a built bundle on a namespace. See the repo `CLAUDE.md`
for the two-file integration.

## Dashboard options

| Option | Default | |
|---|---|---|
| `fetch(range)` | — | **required.** Returns a promise of your data. |
| `spec(data, range)` | — | **required.** Pure function returning the spec below. |
| `presets` | `[7, 30, 90]` | Quick-range chips. `[]` omits the strip. |
| `default_days` | `30` | Opening window. |
| `dated` | `true` | `false` drops the date fields entirely. |
| `page_class` | `""` | Extra class on the page body, for page-local CSS. |
| `namespace` | `"dd"` | Only matters if two dashboards can be open at once. |

## The spec

```js
{
  title:   "Visit to paid order",
  meta:    ["1 Jul – 31 Jul"],        // strings under the title
  presets: [7, 30, 90],               // renders the chips; the controller wires them
  caveat:  "A visit is a session…",   // the "read this before you trust it" line
  explain: { key: [title, body] },    // ⓘ copy, referenced by `explain: "key"`
  blocks:  [ …panels… ],
  footer:  [{ label, href }],
}
```

### Panels

Every panel is `{type, …}`. Anything with a `drill` becomes clickable.

**`kpis`** — the headline rail.
```js
{ type: "kpis", columns: 5, items: [
    { label, value, sub, delta, dot: "danger"|"warning"|"success"|"info", explain, drill } ] }
```
`value` is a **formatted string** — run it through `fmt` first. `delta` is HTML
from `fmt.delta(n, "up"|"down", unit)`; the second argument names the direction
that is *good news*, which differs per card.

**`bars`** — proportion bars. HTML, not a chart: a chart auto-scales its axis, sizes
to its container rather than its rows, and hides the value in a tooltip.
```js
{ type: "bars", scale, legend: [keptLabel, lostLabel], items: [
    { label, kept, lost, count, rate, drill } ] }
```
`scale` is what one full-width track represents, and it is **one number for the
whole panel**. Scaling each row to its own value draws a column of identical
full-width bars and hides the drop the panel exists to show. Omitted, it defaults
to the largest count — right for a distribution, wrong for a funnel, which should
pass its first stage.

**`rows`** — a list where each entry carries a state, a reason and a figure.
```js
{ type: "rows", items: [
    { name, count, rate, why, links: [{label, href}], series: [], labels: [],
      tone: "quiet"|"rising"|"easing"|"steady", status, drill } ] }
```
Omit `tone` and pass `series`, and the trend decides it — second half against
first half, not the last two points, because one quiet day is noise. A `series`
with anything in it draws a sparkline; a flat one draws nothing rather than a
straight line implying a measurement that was taken and was zero.

**`table`**
```js
{ type: "table", columns: [{ label, key, numeric }], rows: [{ …, drill }] }
```

**`chart`** — an ECharts option, passed through untouched.
```js
{ type: "chart", height: 240, option: <object | (palette) => object>, drill }
```
The toolkit supplies the theme, the tooltip, the resize observer, and re-themes
the canvas when the Desk theme flips. Pass a **function** when a series needs a
semantic colour (`palette.danger`) and must still follow the theme. `drill`
receives the clicked datum.

**`card`** — a titled box around any panel.
`{ type: "card", title, hint, explain, body: <panel | panel[]> }`

**`split`** — two panels side by side. An array in a column stacks its members,
which is how a tall panel is paired with two short ones without leaving a band of
empty card under the shorter side.
`{ type: "split", columns: [panel | panel[], panel | panel[]] }`

**`grid`** — equal columns. `{ type: "grid", columns: 3, blocks: [...] }`

**`section`** — a titled break. `{ type: "section", title, explain }`

**`text`** — `{ type: "text", text, style: "caveat" | "empty" }`

**`html`** — the escape hatch. **Not escaped.** `{ type: "html", html }`

An unknown `type` throws rather than rendering nothing — a silently skipped panel
looks like a backend that returned no data, and the wrong half of the stack gets
debugged.

## Drill-down

```js
drill: { doctype: "Sales Order", filters: { docstatus: 1 } }
drill: { doctype: "…", filters: {…}, date_field: "creation" }  // range injected
drill: { route: ["Form", "Sales Order", "SO-0001"] }
drill: (context) => { … }        // context: { item, range, point }
```

Drillable elements get a pointer, a hover and focus state, `role="link"`,
`tabindex="0"` and Enter/Space activation. Real anchors inside a drillable row
still win, so a row can carry its own links.

**The date range is opt-in, via `date_field`.** A list filter compares *stored*
timestamps; if your aggregation works in the reader's timezone and the site
stores another, a date filter opens a list that disagrees with the row just
clicked. Injecting it silently would make that mismatch the default.

The hover hint says "Open the underlying records" rather than naming a count,
because a dashboard figure is usually an aggregate — distinct sessions, distinct
customers — while the list it opens is rows. Set `drill.hint` when a descriptor
really does open exactly the counted records.

## `fmt`

`esc` · `count` · `percent` · `date` · `duration(hours)` · `delta(value, good, unit)`
· `trend(series)`

`count` is `Number(v).toLocaleString()` and **not** `frappe.format(v, {fieldtype:
"Int"})` — that returns HTML, which prints as literal markup wherever a string
was expected.

`percent(null)` is `"—"`, never `"0%"`: a rate with no population is a claim the
data does not support.

## Styling

`dash.scss` owns its palette on `.dd-page`, with an explicit `[data-theme="dark"]`
block. Read the repo `CLAUDE.md` before adding a colour — Frappe's semantic
tokens carry three traps this deliberately avoids.

Page-local CSS goes in the page's own stylesheet, scoped under `page_class`. If a
rule would read sensibly on another dashboard, it belongs in `dash.scss` instead.
