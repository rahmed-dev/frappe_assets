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
import { host } from "../../core/host.js";
import { save_data_url, stamp, tools_html } from "../../ui/export.js";

export const name = "chart";

/**
 * `export: true`, or `{filename, label}`, puts a PNG button over the chart.
 *
 * The picture is what the reader is actually trying to send to somebody, and
 * before this the way to do that was a screenshot — which arrives at whatever
 * the sender's window happened to be, with half a card either side of it.
 * `toDataURL` is optional on the engine interface, so a registered engine that
 * cannot do it draws no button rather than a button that does nothing.
 */
function export_options(node) {
	if (!node.export) {
		return null;
	}
	const given = node.export === true ? {} : node.export;
	return {
		filename: given.filename || name,
		label: given.label || host(name).t("PNG"),
	};
}

export function render(node, pass) {
	const slot = pass.defer(name, node);
	const style = node.height ? ` style="--dd-chart-height: ${Number(node.height)}px"` : "";
	const chart = `<div class="dd-chart" data-dd-mount="${slot}"${style}></div>`;
	const exporting = export_options(node);
	if (!exporting) {
		return chart;
	}
	// The chart element itself stays empty markup with nothing but the engine in
	// it. A button inside it would be a child the engine did not put there, sized
	// by the engine's own layout and cleared by whatever it does on dispose.
	const tools = tools_html(exporting.label, host(name).t("Download this chart as a PNG"));
	return `<div class="dd-chart-panel">${tools}${chart}</div>`;
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

	const exporting = export_options(node);
	const panel = el.closest(".dd-chart-panel");
	const button = panel ? panel.querySelector(".dd-export") : null;
	const on_export = () => {
		const url = engine().toDataURL ? engine().toDataURL(el) : null;
		if (!save_data_url(url, stamp(exporting.filename, "png"))) {
			// Nothing to save means the engine had no picture to give — a chart that
			// never mounted, or one whose element is hidden. Silence here would be the
			// same "button that does nothing" this panel takes trouble to avoid.
			host(name).warn("this chart has nothing to export yet");
		}
	};
	if (button && exporting) {
		button.addEventListener("click", on_export);
	}

	return () => {
		if (button && exporting) {
			button.removeEventListener("click", on_export);
		}
		engine().dispose(el);
	};
}
