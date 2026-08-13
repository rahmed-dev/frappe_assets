/**
 * The charting engine seam.
 *
 * The `chart` panel knows it needs a picture drawn in an element. It does not
 * know which library draws it, and — since v0.4.0 — the barrel does not import
 * one. An engine registers itself when its module is imported, and the panel
 * asks this file for whichever is current.
 *
 * ## Why the engine is a separate entry point
 *
 * ECharts is about 550 KB minified with the eleven series types this toolkit
 * registers. Before v0.4.0 that arrived with `import ... from "frappe-assets"`,
 * so a dashboard of KPIs, bars and a table — a common shape, and the shape of
 * the first two pages this was extracted from — paid for a charting engine it
 * never called. One import line in the consuming app's bundle is a fair price
 * for making that opt-in.
 *
 * It also stops being a single-vendor decision. A consuming app can register its
 * own engine and a `chart` panel spec keeps working; that is the difference
 * between a toolkit and a framework.
 *
 * ## Why not lazy `import()` instead
 *
 * The obvious alternative — keep one entry point and dynamically import the
 * engine on first use — buys nothing here. Frappe's esbuild produces one file
 * per `*.bundle.js` with code splitting off, and esbuild inlines a dynamic
 * import into the same output file when it cannot split. The bytes stay in the
 * bundle and every call site becomes async for no saving. A separate entry point
 * is the only version of this that is real.
 *
 * ## What an engine must provide
 *
 *   chart(el, option, on_click) → handle   a full chart; `option` may be an
 *                                          object or `(palette) => object`
 *   sparkline(el, {values, labels, color}) a bare trend line for a table cell
 *   dispose(el)                            tear one down; the mount phase calls
 *                                          this on every redraw
 *   retheme()                              rebuild every live chart from the
 *                                          current palette
 *   toDataURL(el)                          optional, for v0.6.0's PNG export
 */

import { Registry } from "../core/registry.js";
import { NoChartEngineError } from "../core/errors.js";

export const engines = new Registry("chart engine");

let selected = null;

/**
 * Choose an engine by name, when more than one is registered.
 *
 * Rarely needed: with a single engine loaded, `engine()` picks it. This exists
 * for the app that registers its own alongside the built-in one and wants the
 * `chart` panel to use theirs.
 */
export function use_engine(name) {
	selected = engines.get(name);
	return selected;
}

/**
 * The engine to draw with.
 *
 * Falls through to "the only one registered" rather than demanding a choice
 * nobody has to make: importing the ECharts entry point is already the choice.
 */
export function engine() {
	if (selected) {
		return selected;
	}
	const all = engines.all();
	if (all.length === 1) {
		selected = all[0];
		return selected;
	}
	throw new NoChartEngineError(engines.names());
}

/** Whether a chart can be drawn at all — for a caller that would rather skip. */
export function has_engine() {
	return Boolean(selected) || engines.all().length === 1;
}

/** Forget the selection. Tests only; a page selects once and keeps it. */
export function reset_engine() {
	selected = null;
}
