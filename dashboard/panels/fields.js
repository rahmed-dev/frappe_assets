/**
 * `{type: "fields", columns: 4, items: [{label, value, tone}]}`
 *
 * A label-and-value grid — what a record says about itself. Deliberately not
 * `kpis`: that panel sets its value large and heavy because a KPI is a *figure*
 * a reader is meant to land on, and a serial number rendered at that size reads
 * as the most important thing on the page.
 *
 * `tone` tints the value for a field that is itself a finding.
 */

import * as fmt from "../../ui/format.js";
import { tone as tone_of } from "../../ui/tone.js";
import { columns_of } from "../../ui/layout.js";

export const name = "fields";

export function render(node) {
	const columns = columns_of(node.columns, node.items.length);
	const cells = node.items.map((item) => {
		const painted = tone_of(item.tone);
		return `
			<div class="dd-field">
				<div class="dd-field-label">${fmt.esc(item.label)}</div>
				<div class="dd-field-value ${item.tone ? painted.cell : ""}">${fmt.esc(item.value)}</div>
			</div>`;
	});
	return `<div class="dd-grid dd-grid-${columns}">${cells.join("")}</div>`;
}
