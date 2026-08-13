/**
 * What a table cell is worth when its column is sorted.
 *
 * A cell prints a string by design — `fmt` runs before the spec is built — so
 * the panel has to decide what `"210 ms"` and `"—"` mean in an order. Getting
 * that wrong is not a crash: it is a table that looks sorted and is not, which
 * nobody reports because there is nothing to report.
 */

import { describe, it, expect } from "vitest";
import { sort_key, order_by } from "../../dashboard/panels/table.js";

const NUM = { key: "n", numeric: true };
const TEXT = { key: "s" };

describe("sort_key", () => {
	it("prefers what the caller said the cell is worth", () => {
		// The printed word carries no order — alphabetically "Breached" leads and
		// "Slow" trails, which is backwards. `sort` is how a column says so.
		expect(sort_key({ s: { value: "Breached", sort: 2 } }, TEXT)).toBe(2);
	});

	it("reads a number out of a formatted figure on a numeric column", () => {
		expect(sort_key({ n: "1,126" }, NUM)).toBe(1126);
		expect(sort_key({ n: "210 ms" }, NUM)).toBe(210);
		expect(sort_key({ n: "-3.4%" }, NUM)).toBe(-3.4);
	});

	it("does not invent numbers on a text column", () => {
		expect(sort_key({ s: "edge-02" }, TEXT)).toBe("edge-02");
	});

	it("treats a blank, an em dash and an unparseable figure as absent", () => {
		expect(sort_key({ n: undefined }, NUM)).toBeNull();
		expect(sort_key({ n: "" }, NUM)).toBeNull();
		expect(sort_key({ s: "—" }, TEXT)).toBeNull();
		expect(sort_key({ n: "n/a" }, NUM)).toBeNull();
	});
});

describe("order_by", () => {
	const rows = [{ n: "88 ms" }, { n: "—" }, { n: "42 ms" }, { n: "210 ms" }];

	it("sorts ascending and descending on the parsed figure", () => {
		expect(order_by(rows, NUM, "asc").slice(0, 3)).toEqual([2, 0, 3]);
		expect(order_by(rows, NUM, "desc").slice(0, 3)).toEqual([3, 0, 2]);
	});

	it("keeps blanks last in BOTH directions", () => {
		// Reversing this with the arrow is what opens an ascending column with nine
		// em dashes and buries the answer the reader clicked for.
		expect(order_by(rows, NUM, "asc").at(-1)).toBe(1);
		expect(order_by(rows, NUM, "desc").at(-1)).toBe(1);
	});

	it("breaks a tie on the row's original position", () => {
		const tied = [{ s: "b" }, { s: "a" }, { s: "a" }];
		expect(order_by(tied, TEXT, "asc")).toEqual([1, 2, 0]);
	});

	it("returns indices, because the row markup has to move with the rows", () => {
		expect(order_by(rows, NUM, "asc")).toHaveLength(rows.length);
	});
});
