# frappe_assets

Shared assets for Frappe / ERPNext apps.

- **`dashboard/`** — a Desk dashboard toolkit: a self-contained design system
  plus a spec-driven renderer, so a dashboard is a data structure rather than
  several hundred lines of hand-written markup. Installed as an npm package.
- **`server_scripts/`** — Server Script bodies, copy-pasted into a site.
- **`console_scripts/`** — `bench console` snippets.
- **`docs/`** — framework notes.

## Install the dashboard toolkit

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
