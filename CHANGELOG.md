# Changelog

Semver as defined in [`CONTRACT.md`](CONTRACT.md) — while this package is `0.x`,
a breaking change moves the **minor** digit.

Every release carries a **Consumer action** line. `None` means: bump the tag,
`yarn install`, `bench build`, done.

---

## v0.5.0 — 2026-08-13

**Data and state.** A dashboard stops being "two date fields and a callback".
Filters are declared rather than built, the state they hold is in the URL so a
filtered dashboard is a link somebody can send, and the request behind it is an
object with a sequence guard, an abort, an optional cache and an optional poll
rather than a promise the controller watches.

**Consumer action: none for an existing page.** A v0.4.0 `Dashboard` with no
`filters` declared behaves as it did — `fetch` receives the same
`{from_date, to_date}` and `spec` receives the same second argument. Two
controller internals were removed and one option gained a meaning; see
[`MIGRATING-0.4-to-0.5.md`](MIGRATING-0.4-to-0.5.md).

### Added

- **`data/state.js` — `State`.** The date window plus **declared** filters:
  `{fieldname, fieldtype, options, label, default}`. The controller builds a Desk
  control per declaration, and every control writes into one object rather than
  into four places per filter in every consuming app.
- **URL sync.** The active state is written to the query string with
  `replaceState`, and read back — route options first, then the query string — on
  arrival. Only **declared** keys are read: the object built from a URL is handed
  to a whitelisted method, and accepting undeclared keys would let a link decide
  what that method receives.
- **`data/resource.js` — `Resource`.** `fetch` or `method`, with the sequence
  guard and the abort moved out of the controller, plus a TTL `cache`, a `poll`
  that skips ticks while the tab is hidden and catches up on return, an optional
  `realtime` event, and `follow(state)` to drive one from the other.
- **Per-panel states.** Any node may carry `state: "loading" | "empty" |
  "error"`, plus `message`, `label` and `height`. One failing query stops
  blanking the other five panels. `empty` and `error` are painted differently on
  purpose — a surface that paints them alike teaches its readers to read a failed
  query as a quiet month.
- **`desk/page.js` — `dd.page(wrapper, options)`.** `make_app_page`, the state,
  the resource, the controller and the teardown in one call, and idempotent per
  wrapper so a re-entered Desk page cannot stack a second controller. Every part
  stays available as a class.
- **Drills inherit the page's filters**, opt-in with `inherit: true` or
  `inherit: ["company"]`. Opt-in because a dashboard filter is a fieldname on
  what the backend aggregates and the list a figure opens is often a different
  doctype — a list view that errors on an unknown field would turn every drill on
  the page into a dead end the moment somebody added a filter.
- `query()`, `set_query(params)` and `make_page(wrapper, options)` on the host
  interface; `.dd-state`, `.dd-state-loading`, `.dd-state-empty` and
  `.dd-state-error` in `dash.scss`.
- 66 tests, and the contract suite now reads `core/spec.js` as a class emitter.

### Changed

- `fetch(params, {signal})` and `spec(data, params)` receive the **whole** state,
  not only the range. With no filters declared that object is the same two dates
  it always was.
- `before_fetch` and `after_fetch` carry `{range, state, …}`. `range` still holds
  what it held, so a v0.4.0 handler keeps working.
- The Refresh button now defeats the cache. A button that can return the answer
  already on screen is a button that teaches people to press it twice.
- `Dashboard#destroy()` releases a state and resource it built, and only aborts
  ones that were passed in — those belong to the caller, and a second dashboard
  may be sharing them.

### Fixed

- The `suspended` flag is gone, and with it the class of bug it patched. A preset
  moves two dates as **one** state patch, so the pair can no longer fetch twice
  and render the first answer against the second window.
- A drill built at render time could carry the window it was drawn for rather
  than the one on screen. The context is built at follow time.

## v0.4.0 — 2026-08-13

**The kernel.** Panels stop being a `const` object nobody outside this repo can
add to, and become a registry. The chart queue becomes a general deferred-mount
phase, so a panel can have live behaviour without being `{type: "html"}`. The
charting engine moves behind an interface and out of the barrel.

**Consumer action: required if you draw charts.** One import line, and one
renamed property for an app that mounts charts by hand. See
[`MIGRATING-0.3-to-0.4.md`](MIGRATING-0.3-to-0.4.md). Nothing in the spec
vocabulary moved: a v0.3.0 spec renders identically.

### Added

- **`panels` registry.** `panels.define(name, {render, mount?, unmount?})`. The
  twelve built-ins are twelve `define` calls, so an app's thirteenth is the same
  kind of thing. `define` throws on a name already taken; `redefine` is the
  deliberate override.
- **The mount phase.** A panel claims a slot with `pass.defer(name, data)`,
  stamps `data-dd-mount` into its markup, and is handed the element after layout.
  Whatever `mount` returns, if a function, is the teardown — run before every
  redraw and on `destroy()`. Charts and sparklines are now two ordinary users of
  this rather than the only two things it could do.
- **`core/events.js` — lifecycle events.** `before_fetch`, `after_fetch`,
  `before_render`, `after_render`, `error`, `destroy`, via
  `new Dashboard(page, {on})` or `dashboard.on(event, handler)`, which returns
  its own unbinder. A throwing handler is reported and does not stop the others.
- **`charts/adapter.js` — the engine seam.** `engines.define(name, engine)`,
  `use_engine(name)`, `has_engine()`. An app can register a different engine and
  a `{type: "chart"}` spec keeps working.
- `Emitter`, `Pass`, `panels`, `columns_of`, `merge`, `engines`, `engine`,
  `has_engine`, `use_engine` and `NoChartEngineError` on the barrel.
- `ROADMAP.md`, and 28 tests covering the registry, the mount phase, the events
  and what a dashboard does with no charting engine loaded at all.

### Changed

- **ECharts is its own entry point**: `import "frappe-assets/charts/echarts"`.
  Measured with esbuild, minified: the barrel alone is **23 KB**, the barrel plus
  the engine is **736 KB**. Before this release everyone paid the second number,
  including the dashboards made of KPIs, bars and a table — which is most of
  them. `chart` and `sparkline` are exported from that module now; `palette`,
  `token`, `colour`, `markers` and `bounds` stay on the barrel.
- `render_to_string(spec)` returns `{html, drills, mounts}` rather than
  `{html, drills, charts}`, and the markup carries `data-dd-mount` rather than
  `data-dd-chart`. An entry is `{panel, data}` — no `kind` to switch on.
- A `rows` item with a flat series claims no slot at all, instead of rendering
  `data-dd-chart=""` for a loop to skip.
- `render.js` is now the page furniture and the two entry points. The walk is
  `core/spec.js`; the panels are `dashboard/panels/*.js`; the chart helpers are
  `charts/helpers.js`. None of that is contract, and none of it changes output.

### Fixed

- A panel that throws while mounting no longer stops the rest of the page
  mounting. The failure is reported through the host and on the `error` event.
- The mount phase checks that its queue is still the current one before running.
  A preset clicked twice quickly could otherwise mount into elements a later
  render had already replaced — drawing charts nobody can see and leaking each of
  them.
- The contract suite's export check was vacuous: it filtered the promised names
  down to the ones that existed before asserting they existed. It now reads the
  first cell of each table row, so a promised-but-missing export fails.
- The contract suite reads `dashboard/panels/` as a directory, so a new panel's
  class names cannot go unchecked because nobody added the file to a list.

## v0.3.0 — 2026-08-13

**The package stops being a toolkit and starts being a framework.** Everything
environmental now sits behind one host adapter, the module layout admits that
`dashboard/` is one module rather than the whole package, and there is a test
suite — including one that reads `CONTRACT.md` and fails when a promised CSS
class or custom property goes missing.

**Consumer action: required.** This release moves file paths and changes two
call signatures. See [`MIGRATING-0.2-to-0.3.md`](MIGRATING-0.2-to-0.3.md) — it is
four edits and none of them is subtle. v0.2.0 keeps working on its tag for as
long as you leave an app pinned to it.

### Added

- **`core/host.js` — the host adapter.** `DeskHost` wraps Frappe's globals;
  `TestHost` implements the same interface against nothing. `frappe`, `__` and
  `$` are now referenced from exactly one file in the package, which is what
  lets the renderer run in a test, a build step or a printed digest.
- **`core/registry.js` — the extension seam.** `tones` is the first registry:
  an app can `tones.define("stale", {...})` instead of forking. Panels, formats,
  chart engines and drill kinds follow in 0.4.0.
- **A test suite** — 200 assertions across unit, render and contract suites, run
  in CI along with the gallery build and a version-agreement check.
- **`render_to_string(spec)`** — the render pass stopping short of the DOM, for
  anything that has no document to write into.
- **`Dashboard#destroy()`** — releases handlers, aborts the in-flight request
  and removes the body.
- **`core/dom.js`, `core/escape.js`, `core/errors.js`** — the kernel the rest is
  built on. Errors now carry a stable `code`.
- **`LICENSE`** — the package claimed MIT and shipped no licence file.

### Fixed

- **A stale response could overwrite a newer one.** Responses land in the order
  the network returns them, so clicking 7d → 30d → 90d on a page with unequal
  query times could finish showing the 7d numbers under a lit 90d chip, with
  nothing on screen saying so. Every request now takes a sequence number and
  only the newest may draw; the superseded one is aborted rather than left
  running against the database.
- **Charts resolved their colours from the wrong page.** `token()` took the
  first `.dd-page` in the document, so with two dashboards open — the case the
  `namespace` option exists to support — the second one's charts painted with
  the first one's palette, and a page overriding a token got a chart that
  ignored it. Silently, because a canvas cannot report a colour it disagrees
  with. It now resolves from the chart's own page.
- **The KPI delta was interpolated unescaped.** It was the one spec value in the
  renderer that reached the page without passing through `esc`, and nothing
  marked it as an exception. The spec now carries the reading and the panel
  renders it.
- **An explainer key containing a space produced a broken selector.**
  `#dd-explain-net revenue` parses as a descendant combinator and matches
  nothing, so the ⓘ button opened no panel and no fault was reported anywhere.
  Keys are slugged.
- **The package was not actually side-effect-free.** `charts.js` constructed a
  MutationObserver at module scope, so importing anything touched
  `document.documentElement`. The theme watcher now installs on the first chart
  mounted.

### Changed

- **Module layout.** `tone.js` and `format.js` moved to `ui/`, `dash.scss` to
  `ui/styles/`, `version.js` to `core/`. A root `index.js` is the new barrel and
  also exposes everything on a `dd` namespace object.
- **`fmt.delta` takes an object.** `fmt.delta(12, "up", "%")` becomes
  `fmt.delta({value: 12, good: "up", unit: "%"})`, and a `kpis` item's `delta`
  key now holds that object rather than the rendered HTML.
- **The renderer no longer needs jQuery.** `render()` accepts an element, a
  jQuery object or a selector; the controller is native throughout.
- **Grid column counts are clamped** to the 1–5 the stylesheet defines, instead
  of interpolating whatever the spec held into a class name.

---

## v0.2.0 — 2026-08-13

**The first tagged release.** Everything before this was consumed off the `main`
branch, which is what this release exists to end: consuming apps now depend on a
tag, so a deployed page can be pinned to a toolkit known to render it correctly.

### Added

- **Toned table cells.** A `table` cell may be `{value, tone, pill}` instead of a
  bare value — `tone` shifts the ink for a cell whose value is itself a finding,
  `pill: true` renders a state as a pill.
- **A cell `tag`** — a short quiet word after the value (`DS+US` beside a channel
  number), escaped like everything else.
- **A table row `tone`**, tinting the whole row, for a fact about the record
  rather than a verdict on it.
- **`fields` panel** — a label/value grid, for what a record says about itself.
  Distinct from `kpis`, which sets its value large because a KPI is a figure the
  reader lands on.
- **Chart helpers exported:** `markers(list, colours)` for dashed reference
  lines, `bounds(values, {include, pad, step})` for axis limits that keep both
  the readings and the thresholds on screen, `colour(palette, tone)` for a series
  whose colour is its grade.
- **`fmt.blank(value, extra)`** — reads `""`, `null`, `undefined` and the strings
  `"null"` / `"undefined"` as an em dash, plus whatever `extra` strings a
  particular source uses for "no reading".
- **A column `align`** on the `table` panel.

### Changed

- **One tone vocabulary, in `tone.js`:** `success · warning · danger · info ·
  quiet`, read by cells, KPI dots, `rows` stripes, pills and chart series alike.
  Before this there were three vocabularies for the same idea and nothing could
  share a colour with anything else.
- The page measure is capped on the page **wrapper** (`.dd-host`), not on
  `.dd-page`, so the date fields and the primary action in the Desk page head are
  centred with the dashboard rather than stranded on the left edge.
- The width cap honours Desk's **Toggle Full Width**, via frappe's
  `body:not(.full-width)` guard.
- The chart series ramp is monochrome `--dd-series-1..5`. Status colours are not
  in it: the slices of a donut are categories, and painting them red and green
  asserts something about them that is not true.

### Removed

- **`snippets/` and the Server Script bodies** — moved to
  [`rahmed-dev/dev_kb`](https://github.com/rahmed-dev/dev_kb) under `frappe/`.
  They were text to paste, not a package, and yarn clones an entire git
  dependency, so every app installing the toolkit was also getting them in
  `node_modules`.

### Documentation

- [`CONTRACT.md`](CONTRACT.md) — what a consuming app may depend on, and what is
  free to change under it. The CSS class names and custom properties a page's own
  stylesheet keys on are now stated as contract; they were load-bearing already
  and had no build-time check of any kind.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how the library is written, how to add
  or fix something, how to cut a release, how an app upgrades and rolls back.

**Consumer action:** move the dependency from `#main` to `#v0.2.0`, then
`yarn install`, `bench build --app <app>`, `bench --site <site> clear-cache`.
No spec changes are required — everything above is additive, and a page written
against the untagged `main` of 2026-08-13 renders identically.

---

## Earlier, untagged — 2026-08-05

The toolkit's first month, consumed directly off `main`. Recorded for
completeness; there is no tag to pin and no reason to want one.

- `9e6fef5` the Desk dashboard toolkit — controller, renderer, charts, design
  system
- `96fccf2` the spec reference, and an honest drill hint
- `15e5500` the gallery, bar animation and hover counts, the monochrome ramp
- `dfd5006` the readable measure via `.dd-host`
- `4d7ffb8` Toggle Full Width support
