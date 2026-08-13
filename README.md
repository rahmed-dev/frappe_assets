# frappe_assets

The Desk **frontend framework** for Frappe / ERPNext apps: a self-contained
design system, a small kernel with documented seams, and a spec-driven dashboard
renderer — so a dashboard is a data structure rather than several hundred lines
of hand-written markup. Installed as an npm package. No Vue, no build step in
your app beyond the two files below.

- **`core/`** — the kernel: the host adapter, the registries, the render walk,
  the lifecycle emitter, escaping, DOM.
- **`ui/`** — the design system: the stylesheet, the tone vocabulary, the
  formatters.
- **`charts/`** — the design-token helpers, the engine interface, and the
  ECharts adapter behind its own entry point.
- **`dashboard/`** — the spec renderer, the page controller, one file per panel.
- **`demo/`** — the gallery: every panel and chart type on one page, no bench
  needed. `yarn demo`, then open `demo/index.html`.
- **`test/`** — unit, render and contract suites. `yarn test`.

The Server Script bodies, console snippets and framework notes that used to live
here have moved to **[rahmed-dev/dev_kb](https://github.com/rahmed-dev/dev_kb)**,
under `frappe/`. They were text to paste, not a package, and yarn clones an
entire git dependency — so every app installing this toolkit was also getting
them in `node_modules`.

## Install

Depend on a **tag**, never on a branch: `#main` means the next `yarn install`
silently takes whatever was pushed most recently, and there is then no way to ask
for the version a working page was built against.

```bash
cd apps/<your_app>
yarn add rahmed-dev/frappe_assets#v0.5.0

# only if your dashboards draw charts
yarn add echarts
```

```js
// <app>/public/js/dash.bundle.js
export * from "frappe-assets";

// Only if you draw charts. Importing this IS the interface — it registers the
// engine. Leaving it out keeps the bundle at 30 KB instead of 727 KB, measured.
import "frappe-assets/charts/echarts";
```

```scss
// <app>/public/scss/dash.bundle.scss
@use "~frappe-assets/ui/styles/dash.scss";
```

Then the page itself, in one call:

```js
frappe.pages["my-dashboard"].on_page_load = (wrapper) =>
	myapp.dash.dd.page(wrapper, {
		title: __("My Dashboard"),
		filters: [{ fieldname: "company", fieldtype: "Link", options: "Company" }],
		method: "myapp.api.summary",
		spec: (data, state) => ({ ... }),
	});
```

The filter becomes a Desk control, a key in what the backend receives, a
parameter in the URL — so the filtered page is a link somebody can send — and,
where a drill asks for it, a filter on the list that drill opens.

## The rest of the documentation

| | |
|---|---|
| [`dashboard/README.md`](dashboard/README.md) | the spec reference — every panel and every key |
| [`CONTRACT.md`](CONTRACT.md) | what a consuming app may depend on, and what the version numbers mean |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | how the library is written, how to change it, how to release, how an app upgrades |
| [`CHANGELOG.md`](CHANGELOG.md) | what each version did, and what it asks of consumers |
| [`ROADMAP.md`](ROADMAP.md) | what is built, what is next, and what a release still owes |
| [`MIGRATING-0.2-to-0.3.md`](MIGRATING-0.2-to-0.3.md) | the four edits v0.3.0 asks of an app on v0.2.0 |
| [`MIGRATING-0.3-to-0.4.md`](MIGRATING-0.3-to-0.4.md) | the one import line v0.4.0 asks for, and what it buys |
| [`MIGRATING-0.4-to-0.5.md`](MIGRATING-0.4-to-0.5.md) | nothing an existing page must change, and three things now worth deleting |
| [`CLAUDE.md`](CLAUDE.md) | the design rules and the Desk/ECharts traps the framework works around |
