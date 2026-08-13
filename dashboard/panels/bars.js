/**
 * `{type: "bars", items: [{label, kept, lost, count, rate, drill}], scale, legend: [kept, lost]}`
 *
 * Proportion bars, as HTML rather than a chart: a chart auto-scales its axis,
 * sizes to its container rather than its rows, and hides the value in a tooltip.
 *
 * `scale` is the value one full-width track represents, and it is ONE number for
 * the whole panel on purpose. Scaling each row to its own value draws a column of
 * identical full-width bars and hides the very drop the panel exists to show.
 * Omitted, it defaults to the largest count — right for a distribution, wrong for
 * a funnel, which should pass its first stage.
 */

import * as fmt from "../../ui/format.js";

export const name = "bars";

/**
 * The hover tip for one bar: what the legend names, counted.
 *
 * Needs the legend, because the legend is what the two segments are called —
 * without it there is a kept number and a lost number and nothing on the page
 * saying which is which, and a tip that has to be decoded is worse than none.
 *
 * Sized to the two segments rather than the row's total on purpose: the total is
 * already printed in the figures column, and repeating it is what makes a
 * tooltip feel like noise.
 */
function bar_tip(legend, kept, lost) {
	if (!legend || kept == null) {
		return "";
	}
	const line = (key, label, value) =>
		`<span><span class="dd-key dd-key-${key}"></span>${fmt.esc(label)}<b>${fmt.count(value)}</b></span>`;

	return `<div class="dd-bar-tip">${line("kept", legend[0], kept)}${line("lost", legend[1], lost)}</div>`;
}

export function render(node, pass) {
	const scale = node.scale != null ? node.scale : Math.max(...node.items.map((i) => i.count), 0);

	const rows = node.items.map((item) => {
		// A zero scale means an empty range, not a division to guard around each
		// row: both widths collapse to 0 and the track shows as its empty self.
		const width = (value) => (scale ? (Math.max(value, 0) / scale) * 100 : 0);
		const rate = item.rate ? `<span class="dd-bar-rate">${fmt.esc(item.rate)}</span>` : "";
		const lost = item.lost || 0;
		return `
			<div class="dd-bar" ${pass.drill(item.drill, { item })}>
				<div class="dd-bar-label" title="${fmt.esc(item.label)}">${fmt.esc(item.label)}</div>
				<div class="dd-bar-track">
					<span class="dd-bar-kept" style="width: ${width(item.kept)}%"></span>
					<span class="dd-bar-lost" style="width: ${width(lost)}%"></span>
				</div>
				<div class="dd-bar-figures">
					<span class="dd-bar-count">${fmt.count(item.count)}</span>
					${rate}
				</div>
				${bar_tip(node.legend, item.kept, lost)}
			</div>`;
	});

	const legend = node.legend
		? `<div class="dd-legend">
				<span><span class="dd-key dd-key-kept"></span>${fmt.esc(node.legend[0])}</span>
				<span><span class="dd-key dd-key-lost"></span>${fmt.esc(node.legend[1])}</span>
			</div>`
		: "";

	return `<div class="dd-bars">${rows.join("")}</div>${legend}`;
}
