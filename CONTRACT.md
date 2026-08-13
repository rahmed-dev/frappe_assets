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

Since v0.3.0 that gap is closed from the other side: `test/contract` parses the
tables in §3 and §4 of **this file** and fails if any name in them is missing
from the stylesheet or from the code that emits it. The tables are therefore
machine-read as well as human-read. Keep them as tables, keep every name in
backticks, and expand rather than abbreviate — `· ` shorthand and prose like
"and the matching `-bg` variant" are not parseable and silently shrink what is
checked.

---

## 1. JavaScript — the root `index.js` exports

Imported as `frappe-assets` (the barrel) or `frappe-assets/dashboard` (the
dashboard module alone).

### Core

| Export | Kind | Promise |
|---|---|---|
| `host` | function | `(what?)` → the installed host adapter, resolving `DeskHost` on first use |
| `setHost` | function | `(host)` → the previous host |
| `resetHost` | function | `()` — forget the installed host |
| `DeskHost` | class | The Frappe implementation of the host interface (§5) |
| `TestHost` | class | The dependency-free implementation, for tests and the gallery |
| `Registry` | class | `(kind, normalise?)` with `define · redefine · get · find · has · names · all` |
| `Emitter` | class | `on · once · off · emit · clear`; `on` returns its own unbinder |
| `Pass` | class | `(spec, {drill})` — one render pass, carrying `drills` and `mounts` |
| `panels` | Registry | The panel registry — `panels.define(name, {render, mount?, unmount?})` |
| `esc` | function | `(value)` → HTML-safe string |
| `slug` | function | `(value)` → a string safe in an `id` and in a CSS selector |
| `attr` | function | `(name, value)` → a whole attribute, or `""` |
| `unwrap` | function | `(element \| jQuery \| selector)` → `Element` |
| `delegate` | function | `(root, type, selector, handler)` → an unbinder |
| `listen` | function | `(target, type, handler, options?)` → an unbinder |
| `fill` | function | `(element, html)` — replace contents with trusted HTML |
| `DdError` | class | Base error, carrying `code` |
| `UnknownPanelError` | class | `code: "unknown_panel"` |
| `UnknownDefinitionError` | class | `code: "unknown_definition"` |
| `DuplicateDefinitionError` | class | `code: "duplicate_definition"` |
| `NoChartEngineError` | class | `code: "no_chart_engine"` |
| `NoHostError` | class | `code: "no_host"` |

### UI

| Export | Kind | Promise |
|---|---|---|
| `tone` | function | `(name)` → the tone's classes and tokens, falling back to `quiet` |
| `tones` | Registry | The tone registry — `tones.define(name, {token, palette})` |
| `TONES` | object | The five built-in tone definitions |
| `columns_of` | function | `(value, fallback)` → a column count clamped to what the stylesheet paints |
| `fmt` | namespace | `esc · blank · count · percent · date · duration · delta · trend` |

### Charts

The helpers only. They resolve design tokens and axis bounds and import no
engine, so an app can reach for `bounds()` without loading one.

| Export | Kind | Promise |
|---|---|---|
| `palette` | function | `(where?)` → the resolved colour object |
| `token` | function | `(name, fallback, where?)` |
| `colour` | function | `(colours, tone)` |
| `markers` | function | `(list, colours)` |
| `bounds` | function | `(values, {include, pad, step})` |
| `merge` | function | `(under, over)` → a deep merge that replaces arrays wholesale |
| `engines` | Registry | The chart-engine registry |
| `engine` | function | `()` → the engine to draw with; throws `NoChartEngineError` when none is loaded |
| `has_engine` | function | `()` → whether a chart can be drawn at all |
| `use_engine` | function | `(name)` — choose, when more than one is registered |

### Data

| Export | Kind | Promise |
|---|---|---|
| `State` | class | Constructor `(options)`; `get()`, `range()`, `filters()`, `value(f)`, `set(patch)`, `set_preset(days)`, `preset(list)`, `reset()`, `on(handler)` → unbinder, `destroy()` |
| `RANGE_KEYS` | array | `["from_date", "to_date"]` — the two keys a range is made of |
| `Resource` | class | Constructor `(options)`; `reload(params)`, `refetch()`, `invalidate(params)`, `abort()`, `follow(state)`, `start_polling()`, `stop_polling()`, `on(event, handler)` → unbinder, `destroy()`. Fields `data`, `error`, `loading`, `loaded`, `params` |
| `resource` | function | `(options)` → a `Resource`, for a page that would rather not write `new` |
| `key_of` | function | `(params)` → the stable cache key for a params object |

### Dashboard

| Export | Kind | Promise |
|---|---|---|
| `VERSION` | string | The package version this build came from |
| `Dashboard` | class | Constructor `(page, options)`; options as documented in `dashboard/README.md § Dashboard options`. Also `refresh(force)`, `destroy()`, `on(event, handler)`, `off(event, handler)`, `range()`, `filters()`, and the `state` and `resource` it was built with |
| `render` | function | `(container, spec)` → `{drills, mounts}`. Writes into the container. Never fetches |
| `render_to_string` | function | `(spec)` → `{html, drills, mounts}`. Pure — no DOM required |
| `page` | function | `(wrapper, options)` → a `Dashboard`, having built the Desk page. Idempotent per wrapper |
| `drill` | function | `(descriptor, context)` |
| `dd` | object | The same exports gathered on one namespace object, for a page that cannot destructure |

### The other public entry points

| Specifier | What it is |
|---|---|
| `frappe-assets/dashboard` | the dashboard module alone |
| `frappe-assets/charts/echarts` | the ECharts engine. **Importing it is the interface** — it registers itself, and `{type: "chart"}` does not work without it. Also exports `chart`, `sparkline`, `use_series` and `EChartsEngine` |
| `~frappe-assets/ui/styles/dash.scss` | the stylesheet, from an app's SCSS bundle |

Nothing else is public. Importing an internal module by path —
`frappe-assets/core/spec.js` — is not supported; `package.json` `exports` is
written to make that fail.

## 2. The spec vocabulary

**`dashboard/README.md` is the specification, and all of it is contract**: panel
type names, every documented key on every panel, the tone names, and the `drill`
descriptor shapes.

In particular these, because they are the ones that get "tidied":

- Panel types: `kpis · fields · card · bars · rows · table · chart · text ·
  section · split · grid · html`
- KPI delta: `{value, good, unit}` — a reading, not markup
- Table cell object: `{ value, tone, pill, tag }`; table row: `tone`, `drill`
- Tone names: `success · warning · danger · info · quiet`, plus the `rows`
  panel's directions `rising · easing · steady · quiet`
- Drill descriptor: `{ doctype, filters, date_field, inherit }` | `{ route }` |
  `(context) => …`, with `context = { item, range, filters, state, point }`.
  `inherit` is `true` or a list of fieldnames, and is **opt-in**: a page filter
  is a fieldname on what the backend aggregates, and the list a figure opens is
  often a different doctype
- Panel state: any node may carry `state: "loading" | "empty" | "error" | "ready"`
  plus `message`, `label` and `height`. A node in any state but `ready` renders
  the placeholder and the panel never sees it
- Filter declaration: `{fieldname, fieldtype, options, label, default}`

Adding an **optional** key is a minor bump. Renaming one, removing one, or
changing what an existing value does is major.

## 3. CSS class names a page may key on

A Desk page ships its own stylesheet, and page-local rules have to attach to
something. These class names are stable. `{tone}` expands over every name in
`TONES`.

| Class | What it marks |
|---|---|
| `.dd-page` | the dashboard body — the anchor for every token |
| `.dd-host` | the Desk page wrapper (carries the width cap) |
| `.dd-card` | a card |
| `.dd-table` | a `table` panel |
| `.dd-num` | a numeric cell |
| `.dd-cell-{tone}` | a toned cell |
| `.dd-row-{tone}` | a toned row |
| `.dd-pill` | a pill |
| `.dd-pill-{tone}` | a toned pill |
| `.dd-tag` | a cell tag |
| `.dd-bar` | a `bars` row |
| `.dd-bar-label` | a `bars` row's label |
| `.dd-state` | a panel standing in for one that has no numbers |
| `.dd-state-loading` | that panel while it is loading |
| `.dd-state-empty` | that panel with nothing to show |
| `.dd-state-error` | that panel after a failed query |

Every other `dd-` class is internal.

**A page-local rule must not rely on beating the shared sheet by specificity
alone.** `Page.load_assets` loads a page's CSS by filename with no controllable
order against `app_include_css`. Scope under the page's own `page_class` and
state enough of the structural selector to win — see `dash.scss` on why
`.dd-page .dd-table tbody td` outspecifies a lone modifier class.

## 4. CSS custom properties a page may read

All are declared on `.dd-page` and re-declared in the dark block. Listed one per
row rather than abbreviated, because this table is parsed by the contract test
and a `· ` shorthand would quietly shrink what it checks.

| Token | Group |
|---|---|
| `--dd-text` | colour |
| `--dd-text-muted` | colour |
| `--dd-text-subtle` | colour |
| `--dd-surface` | colour |
| `--dd-surface-alt` | colour |
| `--dd-border` | colour |
| `--dd-border-strong` | colour |
| `--dd-border-subtle` | colour |
| `--dd-accent` | colour |
| `--dd-success` | status |
| `--dd-success-bg` | status |
| `--dd-success-fg` | status |
| `--dd-warning` | status |
| `--dd-warning-bg` | status |
| `--dd-warning-fg` | status |
| `--dd-danger` | status |
| `--dd-danger-bg` | status |
| `--dd-danger-fg` | status |
| `--dd-info` | status |
| `--dd-info-bg` | status |
| `--dd-info-fg` | status |
| `--dd-neutral-bg` | status |
| `--dd-neutral-fg` | status |
| `--dd-series-1` | series ramp |
| `--dd-series-2` | series ramp |
| `--dd-series-3` | series ramp |
| `--dd-series-4` | series ramp |
| `--dd-series-5` | series ramp |
| `--dd-space-1` | space |
| `--dd-space-2` | space |
| `--dd-space-3` | space |
| `--dd-space-4` | space |
| `--dd-space-6` | space |
| `--dd-space-8` | space |
| `--dd-text-xs` | type |
| `--dd-text-sm` | type |
| `--dd-text-base` | type |
| `--dd-text-md` | type |
| `--dd-text-xl` | type |
| `--dd-radius-sm` | shape |
| `--dd-radius-md` | shape |
| `--dd-radius-pill` | shape |
| `--dd-shadow-xs` | elevation |
| `--dd-shadow-md` | elevation |
| `--dd-measure` | layout — override it on `.dd-host` to widen a page |

Names not on this list are internal — `--dd-bar-*`, `--dd-enter-*`,
`--dd-ease-*`, `--dd-bar-delay` and friends exist for the stylesheet's own use.

**Write the name exactly.** A misspelt custom property does not error; it falls
through to the `var()` fallback, so the page keeps working and quietly stops
following the design system. Both real cases found so far were this:
`--dd-font-sm` (the token is `--dd-text-sm`) and `--dd-radius` (`--dd-radius-md`).

## 5. The host interface

A consumer may install its own host, so the method set is contract. `DeskHost`
and `TestHost` both implement all of it.

| Method | Promise |
|---|---|
| `t(text, args)` | Translation, with `{0}`-style interpolation |
| `route(...args)` | Navigate; accepts an array or positional parts |
| `route_options` | Get/set the options Frappe carries between pages |
| `query()` | The current query string as a plain object |
| `set_query(params)` | Rewrite it, without adding a history entry |
| `make_page(wrapper, options)` | Desk's page scaffolding |
| `today()` | `YYYY-MM-DD` |
| `add_days(date, days)` | `YYYY-MM-DD` |
| `format_date(value)` | A stored date in the reader's format |
| `call(method, args, {signal})` | Resolves to the method's `message`; honours the abort signal |
| `on_realtime(event, handler)` | Returns an unsubscribe function |
| `after_paint(callback)` | Run once the markup written this tick has been laid out |
| `warn(message)` / `error(error)` | Diagnostics |

`esc` is deliberately **not** on this interface. A safety property that can be
swapped out is not one.

## 6. The registries

| Registry | Holds | Consumer may |
|---|---|---|
| `tones` | tone definitions | `define` a new tone, and ship the matching `dd-pill-*` / `dd-cell-*` / `dd-row-*` rules |
| `panels` | panel types | `define` a panel, `redefine` a built-in deliberately |
| `engines` | charting engines | `define` an engine implementing §8, and select it with `use_engine` |

A panel is `{render(node, pass), mount?(el, data, context), unmount?(el, data)}`.
A bare function is accepted as shorthand for `{render}`.

- `render` is **pure** and returns a string. It escapes everything it did not
  generate itself, and it slugs anything reaching a class attribute — a panel
  written outside this repo is held to the same rule and nothing enforces it.
- `pass.defer(name, data)` claims a mount slot and returns the index to stamp
  into `data-dd-mount`.
- `mount` runs once the markup is on the page and has been laid out. Whatever it
  returns, if a function, is the teardown; otherwise `unmount` is used. One is
  run before every redraw and on `destroy()`.
- `context` is `{dashboard, state, range(), filters(), follow(descriptor, extra),
  emit(event, payload)}`. `follow` merges the page's range and filters in, so a
  panel only passes what it knows that the page does not.

`data-dd-mount` is the handshake between the two phases and is contract from
v0.4.0. It replaced `data-dd-chart`, which only a chart could use.

## 7. The lifecycle events

`new Dashboard(page, {on: {...}})` or `dashboard.on(event, handler)`, which
returns its own unbinder. A handler that throws is reported through the host and
does not stop the others — the emitter sits on the render and fetch path.

| Event | Payload | When |
|---|---|---|
| `before_fetch` | `{range, state}` | a request is about to go out |
| `after_fetch` | `{range, state, data}` | it landed, and it is the newest one |
| `before_render` | `{spec}` | before the previous render is torn down |
| `after_render` | `{spec, body}` | markup written; the mount phase has not run yet |
| `error` | `{error, panel?}` | a fetch failed, or a panel failed to mount |
| `destroy` | `{}` | `destroy()` was called |

Since v0.5.0 `range` carries the declared filters as well as the two dates, and
`state` is the same object under the name that says so. `range` is kept because a
handler written against v0.4.0 reads `payload.range.from_date` and that keeps
working; a handler that iterates the object now sees filters too.

A `State` has its own, separate notification: `state.on(handler)` fires once per
patch — one event for a preset that moved two dates, which is what stops a
listener fetching twice and rendering the first answer against the second window.

## 8. The chart engine interface

An app may register its own engine and a `{type: "chart"}` spec keeps working.

| Method | Promise |
|---|---|
| `chart(el, option, on_click)` | draw a full chart; `option` may be an object or `(palette) => object` |
| `sparkline(el, {values, labels, color})` | a bare trend line for a table cell |
| `dispose(el)` | tear one down, releasing observers as well as the canvas |
| `retheme()` | rebuild every live chart from the current palette |
| `toDataURL(el)` | optional; a data URL of the drawn chart |

## 9. What is explicitly NOT contract

- Module layout below the exported surface — which file a helper lives in, the
  split between `render.js` and `dashboard/panels/`.
- The generated HTML **structure**: element nesting, wrapper divs, attribute
  order. Key on the class names above, never on `> div > div`.
- Any `dd-` class or `--dd-*` token not listed in §3 / §4. `data-dd-mount` is
  the one data attribute that is contract; `data-dd-drill` and the rest are not.
- `demo/` — the gallery is a development tool. It is cloned into consumers as a
  side effect of yarn's git-dependency handling, and depending on it is a bug.
- `test/` — likewise.
- Exact colour values, spacing values, and the ECharts option defaults inside
  `base_option`. These are tuned; that is what tuning means.

---

## Version rules

Semver, with the following meaning for this package.

| Bump | When |
|---|---|
| **major** | Anything in §1–§8 changes meaning, is renamed or is removed. Also: any change that alters what an existing, unchanged spec renders. |
| **minor** | New panel, new optional key, new export, new token, new tone. Existing specs render identically. |
| **patch** | Bug fix, doc change, internal refactor. Existing specs render identically. |

The test is always the same: **take an untouched consuming page and this new
version — does anything the reader sees move?** If yes it is major, however
small the diff looked.

While the package is `0.x`, a major bump moves the **minor** digit — `0.2.0` to
`0.3.0` — because that is what semver says about zero-major packages, and
consumers pin exact tags anyway.

See `CONTRIBUTING.md` for how to make a change and cut a release,
`MIGRATING-0.2-to-0.3.md` and `MIGRATING-0.3-to-0.4.md` for what the two breaks
moved, `ROADMAP.md` for what is coming, and `CHANGELOG.md` for what each version
did.
