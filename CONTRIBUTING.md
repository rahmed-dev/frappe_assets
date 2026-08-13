# Working on this library

How the toolkit is built, how to change it without breaking a deployed page, and
how a consuming app takes a new version.

Read `CONTRACT.md` first — it says what may not move. `CLAUDE.md` holds the
design rules and the Desk/ECharts traps the code works around; this file is
process.

---

## 1. How the library is written

### The shape

```
index.js          the public surface — the barrel an app imports
core/
  host.js         the ONE seam where Desk exists: DeskHost | TestHost
  registry.js     Registry — how a consumer extends the vocabulary
  spec.js         the render kernel: Pass, the panels registry, the mount queue
  events.js       Emitter — the lifecycle hooks
  escape.js       esc / slug / attr. No dependencies, by design
  dom.js          unwrap / delegate / listen / fill. The jQuery replacement
  errors.js       DdError and friends, each carrying a stable `code`
  version.js      the release this build came from
data/
  state.js        State — the date window, the declared filters, the URL
  resource.js     Resource — fetch, sequence guard, abort, cache, poll, realtime
ui/
  tone.js         the one status vocabulary, as a registry
  format.js       value -> display string
  layout.js       columns_of — a fact about what the stylesheet paints
  styles/dash.scss  the design system: own tokens, own dark block
charts/
  helpers.js      palette / token / colour / markers / bounds. NO engine import
  adapter.js      what a charting engine must provide, and its registry
  echarts.js      the ECharts adapter. Its own entry point; registers on import
dashboard/
  index.js        the dashboard module's own entry
  controller.js   STATE: page chrome, date range, fetch, refresh, mount phase
  render.js       PURE: header, caveat, footer, and the two entry points
  panels/         one file per panel type, registered by panels/index.js
  drill.js        a spec's drill descriptor -> a Desk route
desk/
  page.js         dd.page() — Desk page scaffolding in one call
demo/             the gallery — every panel and chart on one page, no bench
test/             unit, render, DOM and contract suites
```

Imports only ever point downward: `desk -> dashboard -> charts -> ui -> data ->
core`. Nothing in
`core/` imports from anywhere above it, `charts/helpers.js` imports no charting
engine, and nothing anywhere imports `frappe`, `__` or `$` except `core/host.js`.

### The three ideas everything follows from

**A dashboard describes itself as data.** A page builds a spec — a plain object —
and `render` turns it into markup. A page never writes HTML. This is why a panel
can be changed for every dashboard at once, and why the output can be checked
without a browser.

**Pure and stateful are separated.** `render_to_string(spec)` is a total
function of its input: same spec, same markup, no network, no clock, no Desk
page object, no DOM. Everything that fetches, remembers or reacts lives in
`controller.js`. Keep that line — it is what makes any of this verifiable, and
since v0.3.0 it is what the render suite actually exercises.

**The environment is injected, never reached for.** `frappe`, `__` and `$`
appear in `core/host.js` and nowhere else. Everything that needs translation,
routing, dates, a server call or a paint hook goes through `host()`. That is
what lets the same code run under `TestHost` in a test, in the gallery, and
one day in whatever renders a printed digest.

**The library owns its own look.** `dash.scss` declares literal hex tokens on
`.dd-page` and re-declares the themed ones under `[data-theme="dark"]`. It does
not build on Frappe's semantic tokens; `CLAUDE.md` lists the three that are
traps. A new colour is a new token in the light block **and** a tuned value in
the dark block, or it is not done.

### Two rules that are easy to break by accident

- **Everything user-supplied goes through `fmt.esc`.** The single exception is
  `{type: "html"}`, which is documented as unescaped and is a last resort. If a
  panel is one optional field short of doing a job, add the field — do not send
  a consumer back to raw HTML. That has happened once and it put values scraped
  off a supplier's portal into hand-escaped strings on three tables.
- **A tone is a fact about a value, never decoration.** `quiet` paints nothing
  on purpose: a value nobody graded must not read as fine.

---

## 2. Making a change

### Adding a panel type

1. Write `dashboard/panels/<name>.js`, exporting `name` and `render(node, pass)`.
   `render` returns a string and escapes every value it did not generate itself.
   Never interpolate a spec value into a class attribute — `slug` it, because a
   space there is a second class rather than a broken one.
2. Add it to the list in `dashboard/panels/index.js`.
3. If it needs live behaviour, export `mount(el, data, context)` too. Claim its
   slot in `render` with `pass.defer(name, data)` and stamp the index into
   `data-dd-mount`. **Return a teardown function** — the controller runs it
   before the next draw, and a panel that holds an observer without one keeps its
   element alive for the rest of the Desk session.
4. Style it in `ui/styles/dash.scss` using existing tokens where they fit.
5. Add it to `demo/gallery.js` — this is not optional, see §3.
6. Add a case to `test/render/panels.test.js`, including one asserting that a
   value carrying `<img src=x onerror=…>` does not reach the page as markup.
7. Document it in `dashboard/README.md § Panels`.
8. **Minor** bump.

A panel that only one dashboard could ever want does not belong here. Since
v0.4.0 a consuming app defines its own with `panels.define(name, panel)` — the
same shape, the same mount phase — and the gallery draws one to prove it.

### Adding a chart series type

One entry in `echarts.use()` in `charts/echarts.js`, plus a gallery panel drawing
it. An app that wants a series this adapter does not ship calls `use_series()`
with its own import instead, which keeps the weight on the app that asked.

### Adding an option to an existing panel

Optional, with the old behaviour as the default when it is absent. Same steps:
gallery entry, README line, **minor** bump. A bare existing spec must render
byte-identically.

### Adding a tone

An entry in `ui/tone.js` **and** matching `dd-pill-*`, `dd-cell-*`, `dd-row-*`
rules in `ui/styles/dash.scss`, or the map promises a colour the stylesheet
never paints. Minor.

A consuming app adds one for itself with `tones.define(name, {token, palette})`
and ships the three rules in its own stylesheet. Adding one *here* is for a tone
every dashboard would want.

### Adding a chart series type, in detail

One entry in `echarts.use()` in `charts/echarts.js` — never a switch to the
umbrella build — plus a gallery panel drawing it. Minor. Note the bundle cost in
the commit message; the eleven registered types cost ~150 KB over the three a
single dashboard needs. Since v0.4.0 that weight lands only on an app that
imports `frappe-assets/charts/echarts` at all.

### Fixing a bug

Ask one question first: **does an existing, unchanged consumer page look
different afterwards?**

- No → **patch**. This is the ordinary case: a crash, a wrong tooltip, an
  escaping hole.
- Yes → it is not a patch even though it is a fix, because a consumer cannot
  tell your intent from their diff. **Major** (`0.x` → next minor digit), with a
  `Consumer action` line in the changelog saying what will move on screen.

### Renaming or removing anything in `CONTRACT.md`

Prefer not to. When it is genuinely necessary:

1. Keep the old name working, mapped to the new one.
2. `console.warn` once, naming the replacement.
3. Ship both for one release. Remove the old name in the next major.

For a **CSS class or token**, the deprecation lane is different: keep the old
selector in `dash.scss` aliased to the new rule, since a stylesheet cannot warn.
Grep every consuming app before deleting either.

---

## 3. Before calling a change done

- **`yarn test`.** Unit, render and contract suites. The contract suite reads
  `CONTRACT.md` itself, so a class or token renamed without updating that file
  fails here rather than on someone's screen. If you renamed one deliberately,
  the fix is to edit `CONTRACT.md` **and** bump accordingly — not to loosen the
  test.
- `node --check` on every changed JS file.
- **`yarn demo`, then open `demo/index.html` in both themes and look at it.**
  Mandatory after any `dashboard/` change. It is the only place the panels and
  chart types nobody has used yet are visible, and the bugs it has caught were
  invisible on the real dashboards — most recently a toned table cell that
  rendered in body ink because `tbody td` outspecified it, which looks exactly
  like the tone never being passed.
  Capture screenshots with `--force-prefers-reduced-motion`: headless Chrome
  freezes CSS animations at frame 0, so everything past the second panel appears
  blank. That is a screenshot artefact and has been mistaken for a bug once.
- If the change touches a panel that a consuming page uses, render that page's
  spec before and after and diff it. `render_to_string` plus a `TestHost` is the
  whole harness now — no browser, no stub — and it is how the last migration
  proved 217 table cells were unchanged.
- Nothing site-specific in the diff. **This repo is public** and installs over
  plain HTTPS with no credentials. No hostnames, customer names, employee names,
  ids or keys — the last thing removed from here was a diagnostic carrying a
  real employee's name.

---

## 4. Cutting a release

1. Decide the bump from `CONTRACT.md § Version rules`.
2. `package.json` `version` in the same commit as the change itself, never a
   separate "bump version" commit — the version is a fact about the code, and
   splitting them is how a tag ends up describing the wrong tree.
3. Add the `CHANGELOG.md` section. Every entry needs a **Consumer action** line;
   `None` is a fine value and is exactly what a reader is looking for.
4. Commit, then tag the same commit and push both:

```bash
git tag -a v0.3.0 -m "v0.3.0"
git push origin main --follow-tags
```

Tags are immutable once pushed. A mistake is a new version, never a moved tag —
a consumer's `yarn.lock` pins the commit a tag pointed at, and moving it means
two apps resolve the same version to different code.

---

## 5. How a consuming app upgrades

An app depends on a **tag**, never on `#main`:

```json
"frappe-assets": "git+https://github.com/rahmed-dev/frappe_assets.git#v0.2.0"
```

`#main` means every `yarn upgrade` silently takes whatever was pushed most
recently, and there is then no way to ask for the version a working page was
built against. That was the state before v0.2.0 and it is the reason this file
exists.

To take a new version:

1. Read the changelog from your current tag to the new one, in particular every
   **Consumer action** line.
2. Edit the tag in the app's `package.json`, then `yarn install` in the app
   directory. Commit the changed `yarn.lock` — it pins the resolved commit, and
   it is what makes another machine's install reproducible.
3. `bench build --app <app>` and `bench --site <site> clear-cache`. The build is
   not optional when the bundle content moved, and skipping clear-cache can
   leave a Desk page looking unchanged or missing.
4. Open every dashboard page in the app. Both themes if the release touched
   `dash.scss`.

**Rolling back is putting the old tag back and repeating steps 2–3.** Nothing on
the site is migrated by the toolkit and there is no state to unwind, which is
what makes pinning cheap.

### Knowing what is deployed

`index.js` exports `VERSION`, and the controller stamps `data-dd-version` on the
page wrapper. To answer "which toolkit is live on this site", inspect the
dashboard page's wrapper element — no bench access needed.
