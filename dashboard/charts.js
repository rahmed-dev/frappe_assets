/**
 * ECharts, themed from the design tokens and kept in step with the Desk theme.
 *
 * WHY ECHARTS AND WHY ONLY ONE ENGINE
 * It is the most capable option that installs as a normal dependency, and its
 * `option` object is already a declarative spec — so `{type: "chart", option}`
 * hands the caller a real charting grammar instead of a smaller one invented
 * here. Click events carry the full datum, which is what makes drill-down from a
 * chart possible at all. A second engine alongside it would double the bundle
 * and give every dashboard two dialects to pick between.
 *
 * Tree-shaken on purpose: `echarts/core` plus only what `use()` lists below. A
 * new series type means one more entry there — not a switch to the ~1 MB
 * umbrella build, which is a change nobody notices making and everybody pays for.
 *
 * WHY THIS FILE EXISTS RATHER THAN CALLING ECHARTS DIRECTLY
 * A canvas cannot consume `var(--dd-text)`; it needs a literal value. And a
 * canvas does not restyle itself when the Desk theme flips the way the DOM
 * around it does. So colours are resolved at render time and every live chart is
 * rebuilt by hand when `data-theme` changes. Every dashboard would otherwise
 * rediscover both, and the second one would be discovered as a bug report about
 * dark mode.
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
import { tone as tone_of } from "./tone.js";

// The registered set is what `demo/index.html` draws, and the two are meant to
// stay in step: a gallery advertising a chart the toolkit cannot render is a
// promise that fails at the worst moment, halfway through building a dashboard.
//
// Registering all eleven costs about 150 KB over the three the funnel needs
// (565 -> 715 KB minified, measured). It is affordable only because this bundle
// is NOT in `app_include_js` — a dashboard page pulls it with `frappe.require`,
// so the weight lands on the pages that draw charts and nowhere else. Putting
// this bundle in a global include is what would make the number matter.
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

/** Every chart currently mounted, so the theme watcher can rebuild them. */
const live = new Set();

/**
 * A design token's literal value, or the fallback.
 *
 * Resolved against `.dd-page`, because that element is where the design system
 * declares its `--dd-*` block. Reading `document.body` — the obvious choice —
 * returns nothing at all, and every chart silently falls back.
 *
 * Two ways a token can fail to produce a colour: undefined, or defined as its
 * own unresolved `var(...)` reference, which a canvas can use no better than an
 * empty string. Both are treated as unset, because a canvas ignores a bad colour
 * *silently* and neither may reach ECharts.
 */
export function token(name, fallback) {
	const host = document.querySelector(".dd-page") || document.body;
	const value = getComputedStyle(host).getPropertyValue(name).trim();
	return !value || value.startsWith("var(") ? fallback : value;
}

function is_dark() {
	return document.documentElement.getAttribute("data-theme") === "dark";
}

/**
 * The resolved palette handed to every chart builder.
 *
 * The fallbacks are picked per theme rather than being one light-mode set: a
 * single fixed fallback puts light text on a dark chart, and that failure shows
 * up only in dark mode. They mirror §1 and §15 of `dash.scss` — renaming a token
 * there without updating here degrades silently, so the two must be edited
 * together.
 */
export function palette() {
	const dark = is_dark();
	return {
		ink: token("--dd-text", dark ? "#f4f4f5" : "#18181b"),
		muted: token("--dd-text-muted", dark ? "#a1a1aa" : "#71717a"),
		line: token("--dd-border", dark ? "#2f2f2f" : "#e4e4e7"),
		surface: token("--dd-surface", dark ? "#1f1f1f" : "#ffffff"),
		accent: token("--dd-accent", dark ? "#fafafa" : "#18181b"),
		success: token("--dd-success", dark ? "#22c55e" : "#16a34a"),
		danger: token("--dd-danger", dark ? "#ef4444" : "#dc2626"),
		warning: token("--dd-warning", dark ? "#f59e0b" : "#d97706"),
		info: token("--dd-info", dark ? "#3b82f6" : "#2563eb"),
		series: [
			token("--dd-series-1", dark ? "#fafafa" : "#18181b"),
			token("--dd-series-2", dark ? "#c4c4cc" : "#52525b"),
			token("--dd-series-3", dark ? "#94949e" : "#8a8a93"),
			token("--dd-series-4", dark ? "#6a6a74" : "#b8b8bf"),
			token("--dd-series-5", dark ? "#46464e" : "#dcdce0"),
		],
	};
}

/**
 * The literal colour a tone means, from an already-resolved palette.
 *
 * For the series that genuinely carries a verdict — a bar whose height IS the
 * reading and whose colour IS the grade. That is the sanctioned exception to the
 * monochrome ramp, and going through the tone map is what keeps the bar, the
 * pill beside it and the cell below it saying the same thing in the same red.
 */
export function colour(colours, name) {
	return colours[tone_of(name).palette];
}

/**
 * Horizontal reference lines — a threshold, a target, a contract minimum.
 *
 * `list` is `[{value, tone, label}]`. Returns `undefined` for an empty list, so
 * a caller can hand it straight to `series.markLine` without asking first.
 *
 * `silent` because a reference line is furniture: it has no datum behind it, and
 * a tooltip on one shows the number that is already printed next to it. Dashed
 * because a solid line at the same weight as a series reads as another series —
 * on a chart with one line, the eye picks the wrong one about half the time.
 *
 * ECharts draws a `markLine` **per series**, so a caller with several lines puts
 * this on one of them. Repeating it stacks identical dashes at the same height,
 * which is invisible until they disagree.
 */
export function markers(list, colours) {
	if (!list || !list.length) {
		return undefined;
	}

	return {
		silent: true,
		symbol: "none",
		data: list.map((marker) => {
			const ink = colour(colours, marker.tone);
			return {
				yAxis: marker.value,
				lineStyle: { type: "dashed", width: 1, color: ink },
				label: marker.label
					? { show: true, formatter: marker.label, position: "insideEndTop", color: ink }
					: { show: false },
			};
		}),
	};
}

/**
 * Axis bounds that leave every reading somewhere to be drawn.
 *
 * ECharts' own `scale: true` fits the axis to the data exactly, which is right
 * for a trend and wrong for bars: the smallest value lands on the floor with no
 * height at all and reads as zero.
 *
 * Options, all optional:
 *   `include`  values to pull into view — pass the marker heights, because a
 *              threshold outside the axis is a verdict the reader cannot see
 *   `pad`      fraction of the spread to add at each end (default 0.1), or
 *              `[below, above]` to pad the two ends differently. `[0, 0.1]` is
 *              the one every bar chart wants: bars are measured from a baseline,
 *              so padding under the baseline puts an axis label below zero on a
 *              quantity that cannot go there
 *   `step`     round the bounds outward to a multiple of this (default 0.5), and
 *              the floor for the padding, so a flat series still gets an axis.
 *              A padded bound is an arbitrary number already; printing it as
 *              9.5238 only makes it look like a measurement. `0` leaves the
 *              bounds unrounded.
 *
 * Falls back to `{scale: true}` when there is nothing to measure — no readings,
 * or a flat series with no step to give it height. Handing ECharts its own
 * default is better than inventing a range around a single number.
 */
export function bounds(values, options = {}) {
	const numbers = (values || []).filter((value) => typeof value === "number" && isFinite(value));
	if (!numbers.length) {
		return { scale: true };
	}

	const step = options.step != null ? options.step : 0.5;
	const all = numbers.concat(options.include || []);
	const low = Math.min(...all);
	const high = Math.max(...all);

	const asked = options.pad != null ? options.pad : 0.1;
	const [below, above] = Array.isArray(asked) ? asked : [asked, asked];
	// The floor at `step` is what gives a flat series an axis at all — there is no
	// spread to take a tenth of. An end the caller padded by zero stays at zero:
	// asking for no room below the baseline and getting half a unit of it is the
	// negative axis label this exists to prevent.
	const room = (fraction) => (fraction ? Math.max((high - low) * fraction, step) : 0);
	const min = low - room(below);
	const max = high + room(above);

	if (min === max) {
		return { scale: true };
	}
	if (!step) {
		return { min, max };
	}
	return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step };
}

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
 * Merge `over` onto `under`, recursing into plain objects only.
 *
 * Arrays are replaced wholesale rather than merged element-wise: `series` and
 * `data` are arrays, and merging those by index produces a chart that is a
 * blend of the last two renders.
 */
function merge(under, over) {
	if (!over) {
		return under;
	}
	const out = Object.assign({}, under);
	for (const [key, value] of Object.entries(over)) {
		const existing = out[key];
		const mergeable =
			value &&
			typeof value === "object" &&
			!Array.isArray(value) &&
			existing &&
			typeof existing === "object" &&
			!Array.isArray(existing);
		out[key] = mergeable ? merge(existing, value) : value;
	}
	return out;
}

/**
 * Mount (or re-mount) a chart on `el` and keep it themed and sized.
 *
 * `build` is re-run on a theme change rather than the option patched, because
 * the colour values it closed over are stale the moment the theme moves.
 */
function mount(el, build, on_click) {
	echarts.dispose(el);
	const chart = echarts.init(el, null, { renderer: "canvas" });
	const entry = { el, chart, build };

	chart.setOption(build(palette()));
	live.add(entry);

	if (on_click) {
		chart.on("click", on_click);
	}
	// ECharts measures its container once at init and never again on its own.
	if (window.ResizeObserver) {
		entry.observer = new ResizeObserver(() => chart.resize());
		entry.observer.observe(el);
	}
	return chart;
}

function retheme() {
	const colours = palette();
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
		entry.chart.setOption(entry.build(colours), true);
	}
}

// Desk stamps the resolved theme onto <html>. Watching that attribute is what
// makes a canvas follow the toggle; nothing else will move it.
new MutationObserver(retheme).observe(document.documentElement, {
	attributes: true,
	attributeFilter: ["data-theme"],
});

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
