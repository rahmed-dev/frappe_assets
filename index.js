/**
 * The package barrel — everything a consuming app is allowed to depend on.
 *
 * A Desk page's own JS is loaded raw and cannot `import`, so an app re-exports
 * this from one `*.bundle.js` of its own and reaches it on a namespace. That
 * bundle is the only integration code an app writes; see the repo `CLAUDE.md`.
 *
 * The stylesheet is a separate import — `@use "~frappe-assets/ui/styles/dash.scss"`
 * from an app's SCSS bundle — because CSS and JS take different paths through
 * the build, and a page can legitimately want the design system without the
 * renderer.
 *
 * THE CHARTING ENGINE IS NOT HERE, on purpose. `import "frappe-assets/charts/echarts"`
 * in the same bundle file is what makes `{type: "chart"}` work. ECharts is about
 * 550 KB minified and before v0.4.0 it arrived with the barrel, so a dashboard of
 * KPIs, bars and a table paid for an engine it never called — which is the shape
 * of most of them. See `charts/adapter.js` for why this is an entry point rather
 * than a lazy `import()`.
 *
 * THE NAMESPACE OBJECT
 * `dd` gathers the same exports into one value, so a page that reached the
 * bundle as `myapp.dash` can write `myapp.dash.dd.panels.define(...)` without
 * destructuring first. It is a convenience over the named exports, never a
 * second source of truth — every property on it is one of the exports below.
 */

// ---------------------------------------------------------------------- core
export { host, setHost, resetHost, DeskHost, TestHost } from "./core/host.js";
export { Registry } from "./core/registry.js";
export { Emitter } from "./core/events.js";
export { Pass, panels } from "./core/spec.js";
export { esc, slug, attr } from "./core/escape.js";
export { unwrap, delegate, listen, fill } from "./core/dom.js";
export {
	DdError,
	UnknownPanelError,
	UnknownDefinitionError,
	DuplicateDefinitionError,
	NoChartEngineError,
	NoHostError,
} from "./core/errors.js";

// ------------------------------------------------------------------------ ui
export { tone, tones, TONES } from "./ui/tone.js";
export { columns_of } from "./ui/layout.js";
export * as fmt from "./ui/format.js";

// -------------------------------------------------------------------- charts
// The helpers only. They resolve design tokens and axis bounds and import no
// engine, so an app can reach for `bounds()` without loading one.
export { palette, token, colour, markers, bounds, merge } from "./charts/helpers.js";
export { engines, engine, has_engine, use_engine } from "./charts/adapter.js";

// ---------------------------------------------------------------------- data
export { State, RANGE_KEYS } from "./data/state.js";
export { Resource, resource, key_of } from "./data/resource.js";

// ----------------------------------------------------------------- dashboard
export { VERSION } from "./core/version.js";
export { page } from "./desk/page.js";
export { Dashboard } from "./dashboard/controller.js";
export { render, render_to_string } from "./dashboard/render.js";
export { follow as drill } from "./dashboard/drill.js";

import * as core_host from "./core/host.js";
import { Registry } from "./core/registry.js";
import { Emitter } from "./core/events.js";
import { Pass, panels } from "./core/spec.js";
import * as escape from "./core/escape.js";
import * as dom from "./core/dom.js";
import { tone, tones, TONES } from "./ui/tone.js";
import { columns_of } from "./ui/layout.js";
import * as fmt from "./ui/format.js";
import * as chart_helpers from "./charts/helpers.js";
import * as chart_adapter from "./charts/adapter.js";
import { State, RANGE_KEYS } from "./data/state.js";
import { Resource, resource, key_of } from "./data/resource.js";
import { VERSION } from "./core/version.js";
import { page } from "./desk/page.js";
import { Dashboard } from "./dashboard/controller.js";
import { render, render_to_string } from "./dashboard/render.js";
import { follow } from "./dashboard/drill.js";

export const dd = {
	VERSION,
	// core
	host: core_host.host,
	setHost: core_host.setHost,
	resetHost: core_host.resetHost,
	DeskHost: core_host.DeskHost,
	TestHost: core_host.TestHost,
	Registry,
	Emitter,
	Pass,
	panels,
	esc: escape.esc,
	slug: escape.slug,
	attr: escape.attr,
	dom,
	// ui
	tone,
	tones,
	TONES,
	columns_of,
	fmt,
	// charts
	palette: chart_helpers.palette,
	token: chart_helpers.token,
	colour: chart_helpers.colour,
	markers: chart_helpers.markers,
	bounds: chart_helpers.bounds,
	engines: chart_adapter.engines,
	engine: chart_adapter.engine,
	has_engine: chart_adapter.has_engine,
	use_engine: chart_adapter.use_engine,
	// data
	State,
	RANGE_KEYS,
	Resource,
	resource,
	key_of,
	// dashboard
	page,
	Dashboard,
	render,
	render_to_string,
	drill: follow,
};
