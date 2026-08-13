/**
 * The panels that arrange other panels: `card`, `split`, `grid`, `section`.
 *
 * Kept together because none of them renders data — each one is a box, a break
 * or a set of columns whose whole job is to call `pass.node()` on something
 * else. Splitting them into four files would be four headers and no content.
 */

import * as fmt from "../../ui/format.js";
import { columns_of } from "../../ui/layout.js";

/** `{type: "card", title, hint, explain, body: <node|node[]>}` */
export const card = {
	name: "card",
	render(node, pass) {
		const hint = node.hint ? `<div class="dd-card-hint">${fmt.esc(node.hint)}</div>` : "";
		return `
			<div class="dd-card">
				<div class="dd-card-head">
					<h5 class="dd-card-title">${fmt.esc(node.title)}${pass.explainer(node.explain)}</h5>
					${hint}
				</div>
				${pass.node(node.body)}
			</div>`;
	},
};

/**
 * `{type: "split", columns: [node|node[]]}` — two panels read side by side.
 *
 * An array in a column stacks its members, which is how a tall panel is paired
 * with two short ones without leaving a band of empty card under the shorter
 * side.
 */
export const split = {
	name: "split",
	render(node, pass) {
		const columns = node.columns.map(
			(column) =>
				`<div class="dd-stack">${pass.node(Array.isArray(column) ? column : [column])}</div>`,
		);
		return `<div class="dd-split">${columns.join("")}</div>`;
	},
};

/** `{type: "grid", columns: n, blocks: [...]}` — equal columns. */
export const grid = {
	name: "grid",
	render(node, pass) {
		return `<div class="dd-grid dd-grid-${columns_of(node.columns)}">${pass.node(node.blocks)}</div>`;
	},
};

/** `{type: "section", title, explain}` — a titled break between groups of panels. */
export const section = {
	name: "section",
	render(node, pass) {
		return `<div class="dd-section-title">${fmt.esc(node.title)}${pass.explainer(node.explain)}</div>`;
	},
};
