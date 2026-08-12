/**
 * Desk dashboard toolkit — public surface.
 *
 * A consuming app re-exports this from one `*.bundle.js` of its own, because
 * Frappe's esbuild only picks up bundles that live inside an app's `public/`
 * (see the repo CLAUDE.md). That bundle is the only integration code an app
 * needs to write.
 *
 * The stylesheet is a separate import — `@use "~frappe-assets/dashboard/dash.scss"`
 * from an app's SCSS bundle — because CSS and JS take different paths through
 * the build and a page can legitimately want the design system without the
 * renderer.
 */

export { Dashboard } from "./controller.js";
export { render } from "./render.js";
export { chart, sparkline, palette, token, colour, markers, bounds } from "./charts.js";
export { follow as drill } from "./drill.js";
export { tone, TONES } from "./tone.js";
export * as fmt from "./format.js";
