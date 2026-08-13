# Roadmap

Where the framework is, and what is left. One section per release, in the order
they ship. A box is ticked only when the thing is written, tested, documented in
`CONTRACT.md` where it is public, and visible in the gallery where it is visual.

The rule for reading this file: **a release is a coherent unit, not a
checkpoint.** `next` may merge to `main` at the end of any section below and
leave a working tree; it may not merge in the middle of one, because half of a
kernel is worse than none of it.

Status legend: `[x]` done · `[~]` in progress · `[ ]` not started ·
`[-]` dropped, with the reason on the line.

---

## v0.3.0 — foundation, the bugs, and the break ✅ shipped on `next`

The kernel exists, the environment is injected rather than reached for, and the
contract is enforced by a test rather than by prose.

- [x] `core/host.js` — `DeskHost` / `TestHost`. `frappe`, `__` and `$` now
      appear in exactly one file
- [x] `core/escape.js` — `esc` / `slug` / `attr`, zero dependencies, deliberately
      not swappable through the host
- [x] `core/errors.js` — `DdError` and friends, each carrying a stable `code`
- [x] `core/registry.js` — `define` throws on a duplicate, `redefine` is the
      deliberate override
- [x] `core/dom.js` — `unwrap` / `delegate` / `listen` / `fill`; jQuery gone from
      the runtime
- [x] Moves: `ui/tone.js`, `ui/format.js`, `ui/styles/dash.scss`, `core/version.js`
- [x] `index.js` — the barrel and the `dd` namespace object
- [x] Vitest + happy-dom; unit, render, DOM and contract suites
- [x] Contract suite parses `CONTRACT.md` itself, so a silently renamed class or
      token fails a test instead of a page
- [x] GitHub Actions: `node --check`, gallery build, tests, version agreement
- [x] `LICENSE` — `package.json` claimed MIT and shipped no file
- [x] Fix: the stale-response race in `refresh()` (sequence guard + abort)
- [x] Fix: `token()` scoped with `closest()` — two dashboards no longer share
      one page's palette
- [x] Fix: the unescaped `item.delta`; `delta` became `{value, good, unit}`
- [x] Fix: the explainer `id` slugged — `#dd-explain-net revenue` matched nothing
- [x] Fix: the module-scope `MutationObserver` that made `sideEffects: false` a
      false claim
- [x] `MIGRATING-0.2-to-0.3.md`

**Left open:** the gallery has not been looked at by a human in both themes since
the refactor. `yarn test` proves the markup; it cannot see a colour.

---

## v0.4.0 — the kernel ✅ shipped on `next`

Panels stopped being a `const` object and became a registry a consuming app can
add to. The chart queue became a general deferred-mount phase, which is what lets
a panel have live behaviour without being `{type: "html"}`.

- [x] `core/events.js` — `Emitter`: `on` / `once` / `off` / `emit`, each `on`
      returning its own unbinder
- [x] `core/spec.js` — `Pass` and the `panels` registry, lifted out of
      `render.js`
- [x] Panel shape: `{name, render(node, pass), mount?(el, data, ctx), unmount?}`
- [x] The deferred **mount phase**, generalising the chart queue — every panel
      may claim a slot, not only a chart. `data-dd-mount` replaces
      `data-dd-chart`
- [x] `dashboard/panels/*.js` — one file per panel, registered together, so the
      built-in twelve and a consumer's thirteenth are the same kind of thing
- [x] `charts/helpers.js` — `palette` / `token` / `colour` / `markers` /
      `bounds`, pure and free of any engine import
- [x] `charts/adapter.js` — what a charting engine must provide, and the
      registry it registers into
- [x] `charts/echarts.js` — the ECharts adapter, on **its own entry point**.
      Measured: the barrel alone is 23 KB minified, the barrel plus the engine
      is 736 KB
- [x] Lifecycle events on `Dashboard`: `before_fetch` · `after_fetch` ·
      `before_render` · `after_render` · `error` · `destroy`
- [x] Teardown run before every redraw and on `destroy`, so a live panel cannot
      leak across a refresh
- [x] Gallery entry for a custom panel — the extension path is documented by
      being used
- [x] `CONTRACT.md` §6–§8: the registries, the lifecycle events, the engine
      interface
- [x] `CONTRIBUTING.md`: "adding a panel" is now "write a Panel, define it"
- [x] `MIGRATING-0.3-to-0.4.md`

**Left open:** same as v0.3.0 — the gallery has not been looked at by a human in
both themes since the refactor.

---

## v0.5.0 — data and state ✅ shipped on `next`

The data layer the toolkit had nothing of, and filters as a first-class thing
rather than two hard-coded date fields.

- [x] `data/resource.js` — `fetch` or `method`, sequence guard, abort, TTL
      cache, optional poll, optional `frappe.realtime` subscription through the
      host
- [-] In-flight dedupe — **dropped**, with the reasoning in the file. Inside one
      Resource the repeated ask is a Refresh button or a poll tick, and both mean
      "ask again"; the version worth having is a registry shared *between*
      resources and is not this release's
- [x] `data/state.js` — range plus **declared** filters
      (`{fieldname, fieldtype, options, label, default}`), rendered as controls
- [x] URL / `frappe.route_options` sync — a filtered dashboard becomes a
      shareable link. Only declared keys are read back
- [x] Active filters threaded into drill descriptors, opt-in per descriptor with
      `inherit`
- [x] Per-panel loading / empty / error state, so one failing query stops
      blanking the other five panels
- [x] `dd.page()` and `desk/page.js` — `make_app_page`, state, resource, render
      and teardown in one call, idempotent per wrapper, with every part still
      available as a class to compose by hand
- [x] `CONTRACT.md` §1 Data, §5 three new host methods, §6 mount context, §7
      event payloads
- [x] `MIGRATING-0.4-to-0.5.md`

**Left open:** as with 0.3.0 and 0.4.0 — the gallery has not been looked at by a
human in both themes. The three new `dd-state-*` surfaces are the first thing to
look at, since a placeholder is exactly the kind of low-contrast panel a dark
block gets wrong.

---

## v0.6.0 — reach

- [ ] Export: CSV from a `table`, PNG from a `chart` via the adapter's
      `toDataURL`
- [ ] Table: sort, sticky header, `<caption>` and `scope`, optional
      virtualisation
- [ ] New primitives: stat-with-sparkline, progress/goal bar, category bar,
      delta badge
- [ ] `@media print` block — a dashboard is printed more often than anyone plans
      for
- [ ] Generated `index.d.ts` from the panel schemas
- [ ] Dev-mode spec validator, tree-shaken out of a production build

---

## v1.0.0

Cut only when the spec vocabulary has stopped moving **and** the contract suite
is green. That is what makes the number mean something.

- [ ] No spec key renamed for two consecutive releases
- [ ] Every panel has a schema, and the validator is on by default in dev
- [ ] The gallery draws every panel, every chart type and every tone
- [ ] `CONTRACT.md` reviewed line by line against the code one last time

---

## Standing, every release

Not a release of their own — the checks that gate all of the above.

- [ ] `yarn test` green
- [ ] `yarn demo`, then **open the gallery in both themes and look at it**
- [ ] `node --check` on every changed file
- [ ] `CHANGELOG.md` entry with a **Consumer action** line
- [ ] Nothing site-specific in the diff — this repo is public and installs with
      no credentials
