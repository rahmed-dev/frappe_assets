/**
 * `{type: "chart", option, height, drill}`
 *
 * `option` is an ECharts option object, passed through untouched — it is already
 * a declarative spec, so wrapping it in a second one of our own would only be a
 * smaller version of the same thing with more to learn and less to reach for.
 * The toolkit supplies the theme, the resize and the drill; the shape of the
 * chart stays the caller's business.
 *
 * The engine is reached through `charts/adapter.js` rather than imported here.
 * That is what keeps a charting library out of the barrel: this panel is always
 * registered, and an app that never writes `{type: "chart"}` never loads one.
 */

import { engine } from "../../charts/adapter.js";

export const name = "chart";

export function render(node, pass) {
	const slot = pass.defer(name, node);
	const style = node.height ? ` style="--dd-chart-height: ${Number(node.height)}px"` : "";
	return `<div class="dd-chart" data-dd-mount="${slot}"${style}></div>`;
}

/**
 * Draw it, and turn an ECharts click into a drill.
 *
 * The chart's `drill` may be a descriptor or a function; either way it is handed
 * the clicked datum, which is what a chart drill is for — "these 14 failures on
 * the 3rd" is a different query from "all failures".
 *
 * `engine()` throws when nothing is loaded, and deliberately: a chart panel is
 * nothing but the picture, so failing silently would leave a labelled empty box
 * that reads as a backend returning no data.
 */
export function mount(el, node, context) {
	// The range and the active filters are merged in by the controller's `follow`,
	// so a panel only has to say what it knows that the page does not: which point
	// was clicked.
	const on_click = node.drill
		? (params) => context.follow(node.drill, { point: params, item: params.data })
		: null;

	engine().chart(el, node.option, on_click);
	return () => engine().dispose(el);
}
