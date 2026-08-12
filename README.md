# frappe_assets

The Desk **dashboard toolkit** for Frappe / ERPNext apps: a self-contained design
system plus a spec-driven renderer, so a dashboard is a data structure rather
than several hundred lines of hand-written markup. Installed as an npm package.

- **`dashboard/`** — the package.
- **`demo/`** — the gallery: every panel and chart type on one page, no bench
  needed. `yarn demo`, then open `demo/index.html`.

The Server Script bodies, console snippets and framework notes that used to live
here have moved to **[rahmed-dev/dev_kb](https://github.com/rahmed-dev/dev_kb)**,
under `frappe/`. They were text to paste, not a package, and yarn clones an
entire git dependency — so every app installing this toolkit was also getting
them in `node_modules`.

## Install

```bash
cd apps/<your_app>
yarn add rahmed-dev/frappe_assets echarts
```

```js
// <app>/public/js/dash.bundle.js
export * from "frappe-assets/dashboard";
```

```scss
// <app>/public/scss/dash.bundle.scss
@use "~frappe-assets/dashboard/dash.scss";
```

See [`dashboard/README.md`](dashboard/README.md) for the spec reference and
[`CLAUDE.md`](CLAUDE.md) for the design rules and the Desk gotchas the toolkit
works around.
