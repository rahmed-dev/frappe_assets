/**
 * `{type: "rows", items: [{name, tone, status, why, links, count, rate, series, drill}]}`
 *
 * A list where each entry carries a state, a reason and a figure — the shape a
 * "what is going wrong" panel keeps arriving at. `tone` is a trend word or a
 * tone name (see TRENDS), or omit it and pass `series` to have the trend decide.
 *
 * The first panel with a **mount** phase other than `chart`, and the reason the
 * phase was generalised: a sparkline is a canvas, so it cannot be a string, and
 * before v0.4.0 the controller had to know by name that a `rows` panel produces
 * something called a spark.
 */

import * as fmt from "../../ui/format.js";
import { tone as tone_of } from "../../ui/tone.js";
import { host } from "../../core/host.js";
import { engine, has_engine } from "../../charts/adapter.js";
import { token } from "../../charts/helpers.js";

export const name = "rows";

/**
 * The direction words a `rows` panel understands, on top of the tones.
 *
 * A trend is not a status: "rising" is only bad news because the panel counts
 * things going wrong, and the word the reader needs is the direction, not the
 * verdict. So these keep their own labels and borrow a tone for the colour.
 *
 * A `rows` item may name either — `tone: "rising"` and `tone: "danger"` both
 * work — because a panel listing failures thinks in directions and a panel
 * listing states does not, and neither should have to translate.
 *
 * The labels are stored untranslated and run through the host at read time. A
 * `__()` at module scope resolves once, at import — which on a Desk page is
 * before the user's language is necessarily settled, and in a test is before any
 * host exists at all.
 */
const TRENDS = {
	quiet: { tone: "quiet", label: "Quiet" },
	rising: { tone: "danger", label: "Rising" },
	easing: { tone: "success", label: "Easing" },
	steady: { tone: "warning", label: "Steady" },
};

/**
 * The classes and the default label for a name that may be a trend or a tone.
 *
 * A tone has no label of its own — `danger` is a colour, not a word for a
 * reader — so one falls back to nothing and the pill is left off. Printing the
 * tone name is the tempting alternative and it is wrong: `DANGER` in a pill
 * where the caller meant to say `Suspended` reads as a system message.
 */
function reading(name) {
	const trend = TRENDS[name];
	return {
		...tone_of(trend ? trend.tone : name),
		label: trend ? host("rows").t(trend.label) : "",
	};
}

export function render(node, pass) {
	const rows = node.items.map((item) => {
		const tone = reading(item.tone || fmt.trend(item.series));
		const text = item.status || tone.label;
		const status =
			item.status === false || !text
				? ""
				: `<span class="dd-pill ${tone.pill}">${fmt.esc(text)}</span>`;

		const links = (item.links || [])
			.map((link) => `<a href="${fmt.esc(link.href)}">${fmt.esc(link.label)}</a>`)
			.join("");

		const why = item.why
			? `<div class="dd-row-why" title="${fmt.esc(item.why)}">${fmt.esc(item.why)}</div>
				${links ? `<div class="dd-row-links">${links}</div>` : ""}`
			: "";

		const rate = item.rate ? `<div class="dd-row-rate">${fmt.esc(item.rate)}</div>` : "";

		// A flat series has nothing to plot, so the cell is left empty rather than
		// drawing a straight line that implies a measurement was taken and was zero.
		// No mount slot is claimed at all in that case: an element with no
		// `data-dd-mount` is one the mount phase never looks at.
		const spark = (item.series || []).some((value) => value > 0);
		const slot = spark
			? ` data-dd-mount="${pass.defer(name, { item, token: tone.token })}"`
			: "";

		return `
			<div class="dd-row ${tone.row}" ${pass.drill(item.drill, { item })}>
				<span class="dd-stripe"></span>
				<div class="dd-row-main">
					<div class="dd-row-name">${fmt.esc(item.name)}${status}</div>
					${why}
				</div>
				<div class="dd-spark"${slot}></div>
				<div class="dd-row-figures">
					<div class="dd-row-count">${fmt.count(item.count)}</div>
					${rate}
				</div>
			</div>`;
	});

	return rows.join("");
}

/**
 * Draw the sparkline.
 *
 * Skipped rather than thrown when no charting engine is loaded. A sparkline is
 * an ornament on a row whose number is already printed beside it, so a dashboard
 * that never imported an engine should still get its `rows` panel — unlike a
 * `chart` panel, which is nothing but the picture and says so loudly.
 */
export function mount(el, data) {
	if (!has_engine()) {
		return null;
	}
	const series = data.item.series;
	engine().sparkline(el, {
		values: series,
		labels: data.item.labels || series.map((_, index) => index + 1),
		color: token(data.token, "#a1a1aa", el),
	});
	return () => engine().dispose(el);
}
