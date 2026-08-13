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

Depend on a **tag**, never on a branch: `#main` means the next `yarn install`
silently takes whatever was pushed most recently, and there is then no way to ask
for the version a working page was built against.

```bash
cd apps/<your_app>
yarn add rahmed-dev/frappe_assets#v0.2.0 echarts
```

```js
// <app>/public/js/dash.bundle.js
export * from "frappe-assets/dashboard";
```

```scss
// <app>/public/scss/dash.bundle.scss
@use "~frappe-assets/dashboard/dash.scss";
```

## The rest of the documentation

| | |
|---|---|
| [`dashboard/README.md`](dashboard/README.md) | the spec reference — every panel and every key |
| [`CONTRACT.md`](CONTRACT.md) | what a consuming app may depend on, and what the version numbers mean |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | how the library is written, how to change it, how to release, how an app upgrades |
| [`CHANGELOG.md`](CHANGELOG.md) | what each version did, and what it asks of consumers |
| [`CLAUDE.md`](CLAUDE.md) | the design rules and the Desk/ECharts traps the toolkit works around |
