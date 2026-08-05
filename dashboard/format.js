/**
 * Formatting helpers shared by every panel.
 *
 * These are here rather than in each dashboard because the *reading* rules are
 * the reusable part: a missing population is a dash and not a zero, a delta of
 * exactly nothing is neither good nor bad news. Restating those per page is how
 * two dashboards in the same app end up disagreeing about what "—" means.
 */

/** Anything user- or data-supplied that reaches an HTML string goes through this. */
export const esc = (value) => frappe.utils.escape_html(value == null ? "" : String(value));

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
export const date = (value) => frappe.datetime.str_to_user(value);

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
	if (hours < 1) {
		return __("{0} min", [Math.round(hours * 60)]);
	}
	if (hours < 48) {
		return __("{0} h", [Math.round(hours * 10) / 10]);
	}
	return __("{0} d", [Math.round((hours / 24) * 10) / 10]);
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
 */
export function delta(value, good, unit) {
	if (value == null) {
		return "";
	}
	const rising = value > 0;
	const tone = value === 0 ? "flat" : rising === (good === "up") ? "up" : "down";
	const arrow = value === 0 ? "" : rising ? "▲ " : "▼ ";
	const suffix = unit ? ` ${unit}` : "";
	return `<span class="dd-delta dd-delta-${tone}">${arrow}${Math.abs(value)}${esc(suffix)}</span>`;
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
