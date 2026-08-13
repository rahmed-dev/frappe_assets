/**
 * `{type: "table", columns: [{label, key, numeric, align}], rows: [{..., tone, drill}]}`
 *
 * A cell is `row[col.key]`, and it is either a plain value or
 * `{value, tone, pill, tag}`:
 *
 *   `tone`  a name from `ui/tone.js` — the ink shifts to say the value itself is
 *           the finding (out of range, disagreeing with another system)
 *   `pill`  render it as a pill instead of tinted text, for a cell holding a
 *           STATE rather than a reading — `Suspended`, `Learned`
 *   `tag`   a short word after the value, smaller and quieter — what the value
 *           also is, where the cell is still the value: `DS+US` beside a channel
 *           number that carries upstream too
 *
 * A ROW takes `tone` as well, tinting the whole row. That is for a fact about
 * the record rather than about one reading — the four channels out of sixteen
 * that transmit, the rows this import skipped. It is not a second way to say
 * what a cell already says: colouring a row because one cell in it is bad
 * spreads a verdict across six readings that were fine.
 *
 * All of it is optional and a bare value behaves exactly as it always has.
 *
 * This exists because the alternative was worse. Every cell here goes through
 * `fmt.esc`, so a table that needed one coloured cell had no way to say so and
 * had to be rebuilt as `{type: "html"}` — the escape hatch that is "NOT escaped,
 * by definition". Colour was making callers hand-roll their own escaping, and
 * three tables on one page did exactly that, one of them printing values scraped
 * off a supplier's portal. A tone is not worth an XSS, and neither is a tag.
 */

import * as fmt from "../../ui/format.js";
import { tone as tone_of } from "../../ui/tone.js";

export const name = "table";

/** `right` and `center` are opt-in; a column says nothing and gets the default. */
const ALIGN = { right: "dd-num", center: "dd-mid" };

function align_class(col) {
	return ALIGN[col.align] || (col.numeric ? "dd-num" : "");
}

export function render(node, pass) {
	const head = node.columns
		.map((col) => `<th class="${align_class(col)}">${fmt.esc(col.label)}</th>`)
		.join("");

	const body = node.rows
		.map((row) => {
			const cells = node.columns
				.map((col) => {
					const raw = row[col.key];
					const cell = raw && typeof raw === "object" ? raw : { value: raw };
					const painted = tone_of(cell.tone);
					const tag = cell.tag ? `<span class="dd-tag">${fmt.esc(cell.tag)}</span>` : "";
					if (cell.pill) {
						return `<td class="${align_class(col)}"><span class="dd-pill ${painted.pill}">${fmt.esc(cell.value)}</span>${tag}</td>`;
					}
					return `<td class="${align_class(col)} ${cell.tone ? painted.cell : ""}">${fmt.esc(cell.value)}${tag}</td>`;
				})
				.join("");
			const painted = tone_of(row.tone);
			return `<tr class="${row.tone ? painted.row : ""}" ${pass.drill(row.drill, { item: row })}>${cells}</tr>`;
		})
		.join("");

	return `<table class="dd-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
