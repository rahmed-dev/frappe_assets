/**
 * The ECharts adapter.
 *
 * **This module has a side effect on purpose**: importing it registers the
 * engine. That is the whole interface —
 *
 *     import "frappe-assets/charts/echarts";
 *
 * in a consuming app's bundle, and every `{type: "chart"}` panel works. Without
 * it the barrel never mentions ECharts, so a dashboard with no charts does not
 * carry the engine. `package.json` lists this file in `sideEffects` for the same
 * reason `demo/**` is listed: under a blanket `false`, a bundler is entitled to
 * delete a bare import, and the registration would go with it.
 *
 * WHY ECHARTS
 * It is the most capable option that installs as a normal dependency, and its
 * `option` object is already a declarative spec — so `{type: "chart", option}`
 * hands the caller a real charting grammar instead of a smaller one invented
 * here. Click events carry the full datum, which is what makes drill-down from a
 * chart possible at all.
 *
 * Tree-shaken on purpose: `echarts/core` plus only what `use()` lists below. A
 * new series type means one more entry there — not a switch to the ~1 MB
 * umbrella build, which is a change nobody notices making and everybody pays for.
 */

import * as echarts from "echarts/core";
import {
	BarChart,
	LineChart,
	PieChart,
	ScatterChart,
	FunnelChart,
	SankeyChart,
	TreemapChart,
	SunburstChart,
	HeatmapChart,
	GaugeChart,
	RadarChart,
} from "echarts/charts";
import {
	GridComponent,
	LegendComponent,
	TooltipComponent,
	DataZoomComponent,
	VisualMapComponent,
	MarkLineComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { engines } from "./adapter.js";
import { palette, merge } from "./helpers.js";

// The registered set is what `demo/index.html` draws, and the two are meant to
// stay in step: a gallery advertising a chart the toolkit cannot render is a
// promise that fails at the worst moment, halfway through building a dashboard.
//
// Registering all eleven costs about 150 KB over the three the funnel needs
// (565 -> 715 KB minified, measured). Since v0.4.0 that 715 KB lands only on an
// app that imports this file at all, which is what made the 150 KB affordable
// rather than something to keep re-litigating.
echarts.use([
	BarChart,
	LineChart,
	PieChart,
	ScatterChart,
	FunnelChart,
	SankeyChart,
	TreemapChart,
	SunburstChart,
	HeatmapChart,
	GaugeChart,
	RadarChart,
	GridComponent,
	LegendComponent,
	TooltipComponent,
	DataZoomComponent,
	VisualMapComponent,
	MarkLineComponent,
	CanvasRenderer,
]);

/**
 * Register a series type this adapter does not ship with.
 *
 * The extension path for an app that wants, say, the graph or candlestick
 * series: `use_series(GraphChart)` beside its own import from `echarts/charts`.
 * That keeps the weight on the app that asked for it.
 */
export function use_series(...modules) {
	echarts.use(modules.flat());
}

/** Every chart currently mounted, so the theme watcher can rebuild them. */
const live = new Set();

/**
 * The chart furniture every chart shares: axes, gridlines, tooltip, text.
 *
 * Deep-merged UNDER the caller's option, so anything stated explicitly wins.
 * This is the "beautiful by default" part — a caller who passes nothing but
 * `series` still gets a chart that matches the page, and the ones who care can
 * override any of it.
 */
function base_option(colours, over) {
	// Whether the caller named an axis is what decides if this is a chart drawn on
	// a grid. It has to be decided, not assumed: ECharts draws an `xAxis`/`yAxis`
	// it is given even when no series uses one, so handing the axis furniture to a
	// pie or a funnel frames it in a pair of empty rulers. `trigger: "axis"` is the
	// same mistake in the tooltip — on a pie it points at nothing and shows an
	// empty box on hover.
	const cartesian = Boolean(over && (over.xAxis || over.yAxis));

	const common = {
		animationDuration: 300,
		textStyle: { color: colours.muted, fontSize: 11 },
		tooltip: {
			trigger: cartesian ? "axis" : "item",
			backgroundColor: colours.surface,
			borderColor: colours.line,
			borderWidth: 1,
			padding: [6, 10],
			textStyle: { color: colours.ink, fontSize: 11 },
			axisPointer: { type: "line", lineStyle: { color: colours.line } },
		},
		// The categorical ramp, never the status colours. A caller whose series
		// really does mean "failed" says so by passing `itemStyle.color` from the
		// palette — which is what the `(colours) => option` form of `chart()` is
		// for, and what keeps red meaning red on this surface.
		color: colours.series,
	};

	// The legend does NOT inherit the root `textStyle`, and ECharts' own default
	// is a fixed dark grey — so a legend is legible on the light theme by luck and
	// invisible on the dark one. It has to be coloured explicitly.
	//
	// Only when the caller asked for one, though. Merely DECLARING `legend` is
	// enough to make ECharts draw it for any series whose data carries names, so
	// styling it unconditionally hangs a legend across the top of every funnel and
	// pie that never wanted one.
	if (over && over.legend) {
		common.legend = {
			textStyle: { color: colours.muted, fontSize: 11 },
			icon: "roundRect",
			itemWidth: 10,
			itemHeight: 10,
			itemGap: 14,
		};
	}

	if (!cartesian) {
		return common;
	}

	return Object.assign(common, {
		grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
		xAxis: {
			axisLine: { lineStyle: { color: colours.line } },
			axisTick: { show: false },
			axisLabel: { color: colours.muted },
			splitLine: { show: false },
		},
		yAxis: {
			axisLine: { show: false },
			axisTick: { show: false },
			axisLabel: { color: colours.muted },
			splitLine: { lineStyle: { color: colours.line, type: "dashed" } },
		},
	});
}

/**
 * Mount (or re-mount) a chart on `el` and keep it themed and sized.
 *
 * `build` is re-run on a theme change rather than the option patched, because
 * the colour values it closed over are stale the moment the theme moves.
 */
function mount(el, build, on_click) {
	watch_theme();
	echarts.dispose(el);
	const chart = echarts.init(el, null, { renderer: "canvas" });
	const entry = { el, chart, build };

	chart.setOption(build(palette(el)));
	live.add(entry);

	if (on_click) {
		chart.on("click", on_click);
	}
	// ECharts measures its container once at init and never again on its own.
	if (typeof ResizeObserver !== "undefined") {
		entry.observer = new ResizeObserver(() => chart.resize());
		entry.observer.observe(el);
	}
	return chart;
}

function retheme() {
	for (const entry of live) {
		// A dashboard that re-rendered left its old canvases detached. Disposing
		// them here rather than tracking every render keeps the set from growing
		// for the life of the Desk session.
		if (!entry.el.isConnected) {
			entry.observer?.disconnect();
			echarts.dispose(entry.el);
			live.delete(entry);
			continue;
		}
		entry.chart.setOption(entry.build(palette(entry.el)), true);
	}
}

/**
 * Tear one chart down.
 *
 * The mount phase calls this before re-mounting, and `Dashboard#destroy` calls
 * it for every live chart. Disposing the ResizeObserver matters as much as the
 * canvas: an observer on a detached element keeps that element, its canvas and
 * whatever the option closed over alive for the rest of the Desk session.
 */
function dispose(el) {
	for (const entry of live) {
		if (entry.el === el) {
			entry.observer?.disconnect();
			live.delete(entry);
		}
	}
	echarts.dispose(el);
}

/**
 * Start following the Desk theme, once, on the first chart mounted.
 *
 * Desk stamps the resolved theme onto `<html>`, and watching that attribute is
 * what makes a canvas follow the toggle — nothing else will move it. A canvas
 * cannot restyle itself the way the DOM around it does.
 *
 * Installed lazily rather than at import. `package.json` annotates this package
 * as side-effect-free apart from two named files, and an observer constructed at
 * module scope made that claim untrue in a way that mattered: importing anything
 * from the barrel touched `document.documentElement`, so the package could not
 * be imported without a DOM — which is exactly what a test, a build step or a
 * server-rendered digest is. Deferring it to the first mount costs one boolean.
 */
let watching = false;

function watch_theme() {
	if (watching || typeof MutationObserver === "undefined") {
		return;
	}
	watching = true;
	new MutationObserver(retheme).observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-theme"],
	});
}

/**
 * A full chart from a caller-supplied ECharts option.
 *
 * `option` may be an object or a function of the palette — the function form is
 * what a caller needs to colour a series semantically (a danger-red line) and
 * still follow the theme.
 */
export function chart(el, option, on_click) {
	const build = (colours) => {
		const over = typeof option === "function" ? option(colours) : option;
		return merge(base_option(colours, over), over);
	};
	return mount(el, build, on_click);
}

/**
 * A bare trend line for a table cell — no axes, no grid, no legend.
 *
 * The endpoint carries the only symbol: on a line this short the shape of the
 * tail is the whole message, and marking where it ends is what separates
 * "settling down" from "still climbing".
 */
export function sparkline(el, config) {
	const last = config.values.length - 1;

	return mount(el, (colours) => ({
		animation: false,
		grid: { left: 1, right: 3, top: 3, bottom: 1 },
		tooltip: {
			trigger: "axis",
			backgroundColor: colours.surface,
			borderColor: colours.line,
			textStyle: { color: colours.ink, fontSize: 11 },
			formatter: ([point]) => `${config.labels[point.dataIndex]}: ${point.value}`,
		},
		xAxis: {
			type: "category",
			data: config.labels,
			show: true,
			axisLabel: { show: false },
			axisLine: { show: false },
			axisTick: { show: false },
			splitLine: { show: false },
		},
		yAxis: { type: "value", show: false, min: 0 },
		series: [
			{
				type: "line",
				data: config.values,
				smooth: 0.3,
				symbol: "circle",
				symbolSize: (value, params) => (params.dataIndex === last ? 5 : 0),
				lineStyle: { width: 1.5, color: config.color },
				itemStyle: { color: config.color },
				areaStyle: { color: config.color, opacity: 0.12 },
			},
		],
	}));
}

/** The adapter, as `charts/adapter.js` describes it. */
export const EChartsEngine = {
	name: "echarts",
	chart,
	sparkline,
	dispose,
	retheme,
	toDataURL: (el) => echarts.getInstanceByDom(el)?.getDataURL({ pixelRatio: 2 }),
};

engines.define("echarts", EChartsEngine);
