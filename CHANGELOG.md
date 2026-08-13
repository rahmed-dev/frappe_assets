# Changelog

Semver as defined in [`CONTRACT.md`](CONTRACT.md) — while this package is `0.x`,
a breaking change moves the **minor** digit.

Every release carries a **Consumer action** line. `None` means: bump the tag,
`yarn install`, `bench build`, done.

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
