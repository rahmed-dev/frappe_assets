/**
 * Chart helpers that belong to the design system, not to a charting engine.
 *
 * Everything here resolves design tokens into literal values, or turns a list of
 * readings into axis numbers. None of it imports a charting library, which is
 * the point: these are what the barrel exports, so an app that draws no charts
 * can still reach for `bounds()` without pulling in ~550 KB of engine.
 *
 * WHY ANY OF THIS EXISTS
 * A canvas cannot consume `var(--dd-text)`; it needs a literal value. And a
 * canvas does not restyle itself when the Desk theme flips the way the DOM
 * around it does. So colours are resolved at render time, and the engine adapter
 * rebuilds every live chart when `data-theme` changes. Every dashboard would
 * otherwise rediscover both, and the second one would be discovered as a bug
 * report about dark mode.
 */

import { tone as tone_of } from "../ui/tone.js";

/**
 * The element a token should be resolved against.
 *
 * `.dd-page` is where the design system declares its `--dd-*` block, so the
 * value has to be read from inside one. **From the chart's own**, which is the
 * part that used to be wrong: this walked the document and took the first
 * `.dd-page` it found. With two dashboards open — exactly what the controller's
 * `namespace` option exists to support — every chart on the second one resolved
 * its colours from the first, and a page that overrode a token got a chart that
 * ignored the override. Silently, because a canvas cannot report a colour it
 * disagrees with.
 *
 * The document-wide lookup survives only as the fallback for a caller with no
 * element to offer, which after that change is a caller building a palette
 * before anything is mounted.
 */
function scope(where) {
	return (
		(where && where.closest && where.closest(".dd-page")) ||
		document.querySelector(".dd-page") ||
		document.body
	);
}

/**
 * A design token's literal value, or the fallback.
 *
 * Two ways a token can fail to produce a colour: undefined, or defined as its
 * own unresolved `var(...)` reference, which a canvas can use no better than an
 * empty string. Both are treated as unset, because a canvas ignores a bad colour
 * *silently* and neither may reach the engine.
 */
export function token(name, fallback, where) {
	const value = getComputedStyle(scope(where)).getPropertyValue(name).trim();
	return !value || value.startsWith("var(") ? fallback : value;
}

export function is_dark() {
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
export function palette(where) {
	const dark = is_dark();
	const token_here = (name, fallback) => token(name, fallback, where);
	return {
		ink: token_here("--dd-text", dark ? "#f4f4f5" : "#18181b"),
		muted: token_here("--dd-text-muted", dark ? "#a1a1aa" : "#71717a"),
		line: token_here("--dd-border", dark ? "#2f2f2f" : "#e4e4e7"),
		surface: token_here("--dd-surface", dark ? "#1f1f1f" : "#ffffff"),
		accent: token_here("--dd-accent", dark ? "#fafafa" : "#18181b"),
		success: token_here("--dd-success", dark ? "#22c55e" : "#16a34a"),
		danger: token_here("--dd-danger", dark ? "#ef4444" : "#dc2626"),
		warning: token_here("--dd-warning", dark ? "#f59e0b" : "#d97706"),
		info: token_here("--dd-info", dark ? "#3b82f6" : "#2563eb"),
		series: [
			token_here("--dd-series-1", dark ? "#fafafa" : "#18181b"),
			token_here("--dd-series-2", dark ? "#c4c4cc" : "#52525b"),
			token_here("--dd-series-3", dark ? "#94949e" : "#8a8a93"),
			token_here("--dd-series-4", dark ? "#6a6a74" : "#b8b8bf"),
			token_here("--dd-series-5", dark ? "#46464e" : "#dcdce0"),
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
 * or a flat series with no step to give it height. Handing the engine its own
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
 * Merge `over` onto `under`, recursing into plain objects only.
 *
 * Arrays are replaced wholesale rather than merged element-wise: `series` and
 * `data` are arrays, and merging those by index produces a chart that is a blend
 * of the last two renders.
 */
export function merge(under, over) {
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
