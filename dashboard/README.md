# Desk dashboard toolkit

A dashboard is a **spec** — a plain data structure — plus a `fetch`. The toolkit
turns that into a working Frappe Desk page: markup, theming, date ranges,
refresh, loading and error states, ⓘ explainers, drill-down, and charts.

```js
frappe.pages["my-dashboard"].on_page_load = function (wrapper) {
	frappe.require("my_dash.bundle.js").then(() => {
		myapp.dash.dd.page(wrapper, {
			title: __("My Dashboard"),
			filters: [{ fieldname: "company", fieldtype: "Link", options: "Company" }],
			method: "myapp.api.summary",
			spec: (data, state) => ({ ... }),
		});
	});
};
```

`dd.page` builds the Desk page, the state, the resource and the controller, and
is idempotent per wrapper — Desk calls `on_page_load` once per route entry, and a
second controller on one wrapper means two sets of handlers and two fetches per
date change. Everything it does stays available as a class: `new Dashboard(page,
options)` against a page you made yourself is still the whole API.

A Desk page's own JS is loaded raw and **cannot `import`**, which is why the
toolkit arrives through a built bundle on a namespace. See the repo `CLAUDE.md`
for the two-file integration.

## Dashboard options

| Option | Default | |
|---|---|---|
| `fetch(state, {signal})` | — | **required** unless `method` is given. Returns a promise of your data. `signal` aborts a request the page has already superseded; ignoring it is fine. |
| `method` | — | A whitelisted method name, called through the host and resolving to its `message`. The short form of `fetch`. |
| `spec(data, state)` | — | **required.** Pure function returning the spec below. |
| `filters` | `[]` | Declared filters — see below. Each becomes a Desk control and a key in `state`. |
| `presets` | `[7, 30, 90]` | Quick-range chips. `[]` omits the strip. |
| `default_days` | `30` | Opening window. |
| `dated` | `true` | `false` drops the date fields entirely. |
| `sync` | `true` | `false` leaves the query string alone. |
| `cache` | `0` | ms an identical question is answered from the last answer. |
| `poll` | `0` | ms between automatic reloads. Ticks are skipped while the tab is hidden. |
| `realtime` | `""` | A `frappe.realtime` event that triggers a reload. |
| `state` / `resource` | — | Bring your own, for two dashboards driven by one filter bar. A passed-in one is not destroyed with the dashboard. |
| `page_class` | `""` | Extra class on the page body, for page-local CSS. |
| `namespace` | `"dd"` | Only matters if two dashboards can be open at once. |
| `on` | `{}` | Lifecycle handlers by event name — see below. |

The second argument to `fetch` and `spec` is the **whole state** — the date
window and every filter that is set. With no filters declared that is the same
`{from_date, to_date}` it has always been, which is why an existing page needs no
edits.

## Filters

```js
filters: [
	{ fieldname: "company", fieldtype: "Link", options: "Company", label: __("Company") },
	{ fieldname: "status", fieldtype: "Select", options: ["Open", "Closed"], default: "Open" },
]
```

Declaring one is the whole job. It becomes a Desk control in the page head, a key
in what `fetch` receives, a parameter in the query string — so a filtered
dashboard is a link somebody can send — and, for a drill that asks, a filter on
the list it opens. `dashboard.state` is the object underneath: `get()`,
`range()`, `filters()`, `set(patch)`, `reset()`, and `on(handler)` firing once per
patch.

Only declared keys are read back off a URL. The object built from a query string
is handed to a whitelisted method, and accepting undeclared keys would let a link
decide what arguments that method receives.

## Panel states

Any node may say it has nothing to draw yet:

```js
{ type: "table", state: "loading" }
{ type: "table", state: "empty", message: __("No orders in this range.") }
{ type: "table", state: "error", message: error.message }
```

`loading` is a skeleton that holds the panel's space, so the page does not jump
when the answer lands. `empty` and `error` look **different** on purpose: both
are an absence of numbers, and a page that paints them alike teaches its readers
to read a failed query as a quiet month. Give each panel its own `Resource` and
one failing query stops blanking the other five.

## Lifecycle events

`new Dashboard(page, {on: {...}})`, or `dashboard.on(event, handler)`, which
returns its own unbinder. A handler that throws is reported through the host and
does not stop the others; this sits on the render and fetch path, and a logging
callback must not be able to take the page down.

| Event | Payload | When |
|---|---|---|
| `before_fetch` | `{range, state}` | a request is about to go out |
| `after_fetch` | `{range, state, data}` | it landed, and it is the newest one |
| `before_render` | `{spec}` | before the previous render is torn down |
| `after_render` | `{spec, body}` | markup written; the mount phase has not run yet |
| `error` | `{error, panel?}` | a fetch failed, or a panel failed to mount |
| `destroy` | `{}` | `destroy()` was called |

These exist so that timing a query, logging a failure or touching the markup
afterwards has somewhere honest to live. The alternative was wrapping `fetch` or
mutating `spec`, which makes two pure functions carry someone else's concern.

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
`value` is a **formatted string** — run it through `fmt` first. `delta` is a
reading, `{value, good: "up"|"down", unit}`; `good` names the direction that is
*good news*, which differs per card — a rising conversion rate is good, a rising
failure count is not. A delta of exactly zero is neutral and draws no arrow.

Until v0.3.0 this key held the HTML string `fmt.delta()` returned, and the panel
interpolated it raw — the one spec value in the whole renderer that reached the
page without passing through `esc`.

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

Pass `legend` and every row gains a hover tip naming the two segments and
counting them. Without it there is no tip: the legend is the only thing that
says which figure is which, and a tip that has to be decoded is worse than none.
The tip is anchored to the **row**, not the segments — a segment's width is a
percentage of `scale`, so exactly when a figure is small enough to be worth
hovering, its box is a few pixels wide or none at all.

Segments grow from zero on mount and grow again whenever the data changes, with
a small per-row stagger so a funnel draws top-down.

**`rows`** — a list where each entry carries a state, a reason and a figure.
```js
{ type: "rows", items: [
    { name, count, rate, why, links: [{label, href}], series: [], labels: [],
      tone: <trend or tone name>, status, drill } ] }
```
`tone` takes a direction — `quiet`, `rising`, `easing`, `steady` — or any tone
name from `tone.js`. A panel listing failures thinks in directions, one listing
states does not, and neither should have to translate.
Omit `tone` and pass `series`, and the trend decides it — second half against
first half, not the last two points, because one quiet day is noise. A `series`
with anything in it draws a sparkline; a flat one draws nothing rather than a
straight line implying a measurement that was taken and was zero.

**`fields`** — a label/value grid: what a record says about itself.
```js
{ type: "fields", columns: 4, items: [{ label, value, tone }] }
```
Not `kpis`. That panel sets its value large and heavy because a KPI is a figure
the reader is meant to land on; a serial number at that size claims to be the
headline of the page. `tone` tints a value that is itself a finding.

**`table`**
```js
{ type: "table",
  columns: [{ label, key, numeric, align: "right"|"center" }],
  rows: [{ …, tone, drill }] }
```
A cell is either a plain value or `{ value, tone, pill, tag }`. `tone` shifts the
ink, for a cell whose value **is** the finding — a reading out of range, a field
two systems disagree about. `pill: true` renders it as a pill instead, for a cell
holding a *state* rather than a measurement. `tag` prints a short quiet word
after the value — `DS+US` beside a channel number that carries upstream too —
where the cell is still the value and the tag says what it also is.

A **row** takes `tone` too, tinting the whole row. That is for a fact about the
record: the four channels of sixteen that transmit, the rows an import skipped.
It is not a second way to say what a cell already says — colouring a row because
one cell in it is bad spreads that verdict over six readings that were fine.

All of it is optional and a bare value behaves as it always has. Reach for these
rather than rebuilding the table as `{type: "html"}`: every cell here goes
through `fmt.esc`, and neither colour nor a tag is worth hand-rolling your own
escaping for.

**`chart`** — an ECharts option, passed through untouched.
```js
{ type: "chart", height: 240, option: <object | (palette) => object>, drill }
```
The toolkit supplies the theme, the tooltip, the resize observer, and re-themes
the canvas when the Desk theme flips. Pass a **function** when a series needs a
semantic colour (`palette.danger`) and must still follow the theme. `drill`
receives the clicked datum.

**The engine is a separate import.** `import "frappe-assets/charts/echarts";` in
your app's bundle file is what registers it; without it this panel throws
`NoChartEngineError` naming that line. A dashboard that draws no charts adds
nothing and carries no engine — 30 KB of bundle instead of 727 KB, measured.

Registered series types: **line, bar, pie, scatter, funnel, sankey, treemap,
sunburst, heatmap, gauge, radar** — plus the grid, legend, tooltip, dataZoom,
visualMap and markLine components. Anything else needs one more entry in
`echarts.use()` in `charts/echarts.js` and a panel added to the gallery, or
`use_series(YourChart)` in the consuming app. Every one of
them is drawn in `demo/index.html`; **look there before designing a dashboard**,
it is faster than guessing and it is the only place the unused ones are visible.

Two behaviours are inferred rather than configured, and both are load-bearing:
naming an `xAxis` or `yAxis` is what marks the chart as cartesian (it gets the
axis furniture and an axis-triggered tooltip; everything else gets neither), and
declaring `legend` is what makes one appear at all. The series colour ramp is
the monochrome `--dd-series-1..5`, never the status colours — see the repo
`CLAUDE.md` for why, and for what to do instead when a series really does mean
"failed".

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

### Writing your own panel

Since v0.4.0 the panel list is a registry, and a panel your app writes is the
same kind of thing as a built-in one. This is the answer whenever the vocabulary
is one field short — not `{type: "html"}`, which is unescaped by definition and
has already put values scraped off a supplier's portal into hand-escaped strings.

```js
import { panels, fmt } from "frappe-assets";

panels.define("gantt", {
  // Pure. Returns a string. Escapes everything it did not generate itself.
  render: (node, pass) =>
    `<div class="my-gantt" data-dd-mount="${pass.defer("gantt", node)}">
       ${fmt.esc(node.label)}
     </div>`,

  // Optional. Runs once the element is on the page and has been laid out —
  // which is what anything measuring its own container needs.
  // RETURN THE TEARDOWN: the controller runs it before the next draw, and a
  // panel that holds a listener or an observer without one keeps its element
  // alive for the rest of the Desk session.
  mount: (el, node, context) => {
    const chart = new Gantt(el, node.tasks);
    return () => chart.destroy();
  },
});
```

`context` is `{dashboard, range(), follow(descriptor, context), emit(event, payload)}`.
`follow` is the same drill machinery the built-in panels use.

`define` throws on a name already taken, naming it — silent last-one-wins is how
an app shadows `table` for every other page in the same Desk session and finds
out somewhere the definition is not. Replacing a built-in on purpose is
`redefine`, which reads that way at the call site.

The gallery draws one of these, so the extension point is exercised rather than
only described.

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

### Inheriting the page's filters

```js
{ doctype: "Sales Invoice", inherit: ["company"] }   // just this one
{ doctype: "Sales Invoice", inherit: true }          // every filter that is set
```

Opt-in, and this is the decision worth understanding rather than copying. A
dashboard filter is a fieldname on whatever the backend aggregates, and the list
a figure opens is frequently a different doctype. Passing `warehouse` to a list
of Sales Invoices produces a list view that errors on an unknown field — so an
automatic version would turn every drill on the page into a dead end the moment
somebody added a filter, a failure caused by a change nowhere near the drill.

A filter on the descriptor itself wins over an inherited one: the panel knows
something more specific than the page does.

The hover hint says "Open the underlying records" rather than naming a count,
because a dashboard figure is usually an aggregate — distinct sessions, distinct
customers — while the list it opens is rows. Set `drill.hint` when a descriptor
really does open exactly the counted records.

## `fmt`

`esc` · `blank(value, extra)` · `count` · `percent` · `date` · `duration(hours)`
· `delta({value, good, unit})` · `trend(series)`

`count` is `Number(v).toLocaleString()` and **not** `frappe.format(v, {fieldtype:
"Int"})` — that returns HTML, which prints as literal markup wherever a string
was expected.

`percent(null)` is `"—"`, never `"0%"`: a rate with no population is a claim the
data does not support.

`blank` reads `""`, `null`, `undefined` and the strings `"null"` / `"undefined"`
as an em dash — the last two because they are what an upstream system prints
once its own formatting has failed. Pass `extra` for the strings one particular
source uses for "no reading" (`["[N/A]", "[ERR]"]`); those belong to that source
and not to every dashboard.

## Tones

`success` · `warning` · `danger` · `info` · `quiet` — the one status vocabulary,
in `ui/tone.js`. A cell, a KPI dot, a `rows` stripe, a pill and a chart series all
read from it, which is what makes them agree.

A tone is a **fact about the value** — this reading is bad, these two records
disagree — never decoration. `quiet` is the absence of a verdict and carries no
colour at all: a value nobody graded must not read as "fine".

On a canvas, `colour(palette, tone)` gives the literal value — the sanctioned
exception to the monochrome series ramp, for a bar whose colour *is* its grade.
Unknown names fall back to `quiet` rather than throwing, because a tone usually
arrives from a backend and a state nobody has a rule for yet is ordinary.

## Chart helpers

Beside `chart()`, for the cartesian charts that carry a rule:

- `markers(list, colours)` — dashed reference lines from `[{value, tone, label}]`,
  or `undefined` for an empty list, so it can be passed unconditionally. ECharts
  draws a `markLine` **per series**: put it on one of them, or identical dashes
  stack invisibly until they disagree.
- `bounds(values, {include, pad, step})` — axis min/max that leave every reading
  somewhere to be drawn. `include` pulls the marker heights into view, because a
  threshold off the top of the chart is a rule the reader is judged by and cannot
  see. `pad` accepts `[below, above]`: bars want `[0, 0.1]` so the baseline stays
  at zero, a trend wants the default.

A consuming app may add its own tone rather than reach for `{type: "html"}` to
get a colour the vocabulary lacks:

```js
tones.define("stale", { token: "--dd-warning", palette: "warning" });
```

The classes are derived from the name — `dd-pill-stale`, `dd-cell-stale`,
`dd-row-stale` — and the app ships those three rules in its own stylesheet, or
the map promises a colour nothing paints.

## Styling

`ui/styles/dash.scss` owns its palette on `.dd-page`, with an explicit
`[data-theme="dark"]` block. Read the repo `CLAUDE.md` before adding a colour —
Frappe's semantic tokens carry three traps this deliberately avoids.

Page-local CSS goes in the page's own stylesheet, scoped under `page_class`. If a
rule would read sensibly on another dashboard, it belongs in `dash.scss` instead.
