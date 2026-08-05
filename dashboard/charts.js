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
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
	GridComponent,
	LegendComponent,
	TooltipComponent,
	DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
	BarChart,
	LineChart,
	PieChart,
	GridComponent,
	LegendComponent,
	TooltipComponent,
	DataZoomComponent,
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
	};
}

/**
 * The chart furniture every chart shares: axes, gridlines, tooltip, text.
 *
 * Deep-merged UNDER the caller's option, so anything stated explicitly wins.
 * This is the "beautiful by default" part — a caller who passes nothing but
 * `series` still gets a chart that matches the page, and the ones who care can
 * override any of it.
 */
function base_option(colours) {
	return {
		animationDuration: 300,
		textStyle: { color: colours.muted, fontSize: 11 },
		grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
		tooltip: {
			trigger: "axis",
			backgroundColor: colours.surface,
			borderColor: colours.line,
			borderWidth: 1,
			padding: [6, 10],
			textStyle: { color: colours.ink, fontSize: 11 },
			axisPointer: { type: "line", lineStyle: { color: colours.line } },
		},
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
		color: [colours.accent, colours.info, colours.success, colours.warning, colours.danger],
	};
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
	const build = (colours) =>
		merge(base_option(colours), typeof option === "function" ? option(colours) : option);
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
