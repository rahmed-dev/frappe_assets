/**
 * Formatting helpers shared by every panel.
 *
 * These are here rather than in each dashboard because the *reading* rules are
 * the reusable part: a missing population is a dash and not a zero, a delta of
 * exactly nothing is neither good nor bad news. Restating those per page is how
 * two dashboards in the same app end up disagreeing about what "—" means.
 */

import { host } from "../core/host.js";
import { esc } from "../core/escape.js";

/**
 * Anything user- or data-supplied that reaches an HTML string goes through this.
 *
 * Re-exported from `core/escape.js` rather than defined here, and that module
 * has no host behind it. Every other function in this file is a *reading*
 * decision that a different environment could reasonably make differently; this
 * one is a safety property, and a safety property that can be swapped out is not
 * one.
 */
export { esc };

/**
 * A value that may be no value at all, read as an em dash.
 *
 * `""`, `null` and `undefined` are the obvious cases. The strings `"null"` and
 * `"undefined"` are here because they are what an upstream system prints once
 * its own formatting has already failed, and passing them through puts that
 * failure on the page dressed as data.
 *
 * `extra` is any further strings that mean "no reading" in one particular
 * source — a portal that answers `[N/A]`, an API that says `N/R`. Those belong
 * to their source and not to every dashboard, so a caller passes them in; a
 * shared list would eventually blank a value that legitimately reads that way
 * somewhere else.
 *
 * A dash, never a zero. "0 Mbps" is a measurement, an unanswered field is not,
 * and nothing downstream can tell them apart once they look alike.
 */
export function blank(value, extra) {
	if (value == null || value === "") {
		return "—";
	}
	const text = String(value);
	if (text === "null" || text === "undefined" || (extra || []).includes(text)) {
		return "—";
	}
	return text;
}

/**
 * A count, grouped for readability.
 *
 * Deliberately NOT `frappe.format(v, {fieldtype: "Int"})`. That returns *HTML* —
 * `<div style='text-align: right'>2</div>` — so it prints as literal markup
 * wherever the caller expected a string, and stretches whatever grid it lands in.
 */
export const count = (value) => (value == null ? "—" : Number(value).toLocaleString());

/**
 * A rate.
 *
 * Null is a dash, never `0%`: a percentage with no population is a claim the
 * data does not support, and "0% converted" reads as a failure when the truth is
 * that nobody arrived.
 */
export const percent = (value) => (value == null ? "—" : `${value}%`);

/** A date in the reader's format, not the database's. */
export const date = (value) => host("fmt.date").format_date(value);

/**
 * A duration given in hours, in whichever unit keeps it readable.
 *
 * The thresholds are about the reader, not the arithmetic: "0.4 h" and "2160
 * min" are both correct and neither is legible at a glance.
 */
export function duration(hours) {
	if (hours == null) {
		return "—";
	}
	const t = (text, args) => host("fmt.duration").t(text, args);
	if (hours < 1) {
		return t("{0} min", [Math.round(hours * 60)]);
	}
	if (hours < 48) {
		return t("{0} h", [Math.round(hours * 10) / 10]);
	}
	return t("{0} d", [Math.round((hours / 24) * 10) / 10]);
}

/**
 * The delta chip that sits beside a KPI value.
 *
 * `good` names the direction that is good news, because it differs per card: a
 * rising conversion rate is good, a rising failure count is not. Without it the
 * chip would have to guess, and it would guess wrong half the time.
 *
 * A delta of exactly zero is neutral — the good/bad reading only means something
 * once something actually moved.
 *
 * TAKES AN OBJECT, NOT THREE ARGUMENTS, AND WHY THAT CHANGED
 * Until v0.3.0 a spec carried `delta` as the **HTML string** this returned, and
 * the `kpis` panel interpolated it raw. That was the one place in the renderer
 * where a spec value reached the page without passing through `esc`, and nothing
 * marked it as such — a panel written next to it would copy the pattern and put
 * a genuine value through the same hole. Now the spec carries the reading
 * (`{value, good, unit}`), the panel calls this, and the "everything is escaped"
 * rule has no exception outside `{type: "html"}`.
 */
export function delta(spec) {
	if (!spec || spec.value == null) {
		return "";
	}
	const { value, good, unit } = spec;
	const rising = value > 0;
	const tone = value === 0 ? "flat" : rising === (good === "up") ? "up" : "down";
	const arrow = value === 0 ? "" : rising ? "▲ " : "▼ ";
	const suffix = unit ? ` ${unit}` : "";
	return `<span class="dd-delta dd-delta-${tone}">${arrow}${esc(Math.abs(value))}${esc(suffix)}</span>`;
}

/**
 * Which way a short series is heading: second half against first half.
 *
 * Not the last two points — one quiet day is noise, and a dashboard that calls
 * that "improving" is worse than one that says nothing. Returns a `tone` name the
 * `rows` panel maps to its stripe and pill classes.
 */
export function trend(series) {
	if (!series || !series.length) {
		return "quiet";
	}
	const half = Math.floor(series.length / 2);
	const sum = (values) => values.reduce((a, b) => a + b, 0);
	const earlier = sum(series.slice(0, half));
	const later = sum(series.slice(half));

	if (later > earlier) {
		return "rising";
	}
	if (later < earlier) {
		return "easing";
	}
	return "steady";
}
