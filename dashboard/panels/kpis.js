/**
 * `{type: "kpis", columns: 5, items: [{label, value, sub, delta, dot, explain, drill}]}`
 *
 * The headline rail. `value` is a formatted string — run it through `fmt` first.
 *
 * `delta` is `{value, good, unit}` — a reading, not markup. Until v0.3.0 it was
 * the HTML string `fmt.delta()` returned, interpolated raw, and it was the only
 * spec value in the whole renderer that reached the page without passing through
 * `esc`. Nothing marked it as an exception, which is the part that mattered: the
 * next panel written beside this one would have copied the pattern.
 */

import * as fmt from "../../ui/format.js";
import { slug } from "../../core/escape.js";
import { columns_of } from "../../ui/layout.js";

export const name = "kpis";

export function render(node, pass) {
	const columns = columns_of(node.columns, node.items.length);
	const cards = node.items.map((item) => {
		// The dot names a tone, so it lands in a class name. Slugged rather than
		// escaped: `esc` would let a space through, and a space in a class
		// attribute is a second class, not a broken one — silently applying
		// whatever that other name happens to style.
		const dot = item.dot ? `<span class="dd-kpi-dot dd-kpi-dot-${slug(item.dot)}"></span>` : "";
		return `
			<div class="dd-kpi" ${pass.drill(item.drill, { item })}>
				${dot}
				<div class="dd-kpi-label">${fmt.esc(item.label)}${pass.explainer(item.explain)}</div>
				<div class="dd-kpi-value">${fmt.esc(item.value)}${fmt.delta(item.delta)}</div>
				<div class="dd-kpi-sub">${fmt.esc(item.sub)}</div>
			</div>`;
	});
	return `<div class="dd-grid dd-grid-${columns}">${cards.join("")}</div>`;
}
