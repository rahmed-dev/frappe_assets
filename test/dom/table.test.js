/**
 * @vitest-environment happy-dom
 *
 * The `table` panel's mount phase: sorting, and the virtual window.
 *
 * Everything here is about the DOM after a click, which is exactly the half the
 * render suite cannot see. Note what is NOT re-derived on a sort: the row markup
 * is moved, never rebuilt, because `render` is the only place a value is escaped
 * and a second row-building path would be a second place for that to go wrong.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render_to_string } from "../../dashboard/render.js";
import { panels } from "../../core/spec.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

beforeEach(() => {
	resetHost();
	setHost(new TestHost());
	document.body.innerHTML = "";
});

const COLUMNS = [
	{ label: "Node", key: "node" },
	{ label: "Response", key: "response", numeric: true },
];

const ROWS = [
	{ node: "edge-01", response: "88 ms" },
	{ node: "edge-02", response: "—" },
	{ node: "edge-03", response: "42 ms" },
	{ node: "edge-04", response: "210 ms" },
];

/** Render one table panel into the document and run its mount, as the controller does. */
function draw(node) {
	const pass = render_to_string({ title: "T", blocks: [{ type: "table", ...node }] });
	document.body.innerHTML = `<div class="dd-page">${pass.html}</div>`;
	const el = document.querySelector("[data-dd-mount]");
	const entry = pass.mounts[Number(el.getAttribute("data-dd-mount"))];
	const teardown = panels.find(entry.panel).mount(el, entry.data, {});
	return { el, teardown };
}

const printed = (el) =>
	[...el.querySelectorAll("tbody tr:not(.dd-vspacer) td:first-child")].map((td) => td.textContent);

describe("sorting", () => {
	it("leaves the caller's order alone until something is clicked", () => {
		// `sort` describes the order the rows arrived in. Re-sorting them in the
		// browser would only be a chance to disagree with the backend that ordered
		// them.
		const { el } = draw({ sortable: true, sort: { key: "response", dir: "asc" }, columns: COLUMNS, rows: ROWS });
		expect(printed(el)).toEqual(["edge-01", "edge-02", "edge-03", "edge-04"]);
	});

	it("sorts on the first click and reverses on the second", () => {
		const { el } = draw({ sortable: true, columns: COLUMNS, rows: ROWS });
		const button = el.querySelectorAll(".dd-sort")[1];

		button.click();
		expect(printed(el).slice(0, 3)).toEqual(["edge-03", "edge-01", "edge-04"]);

		button.click();
		expect(printed(el).slice(0, 3)).toEqual(["edge-04", "edge-01", "edge-03"]);
	});

	it("keeps the blank last whichever way the arrow points", () => {
		const { el } = draw({ sortable: true, columns: COLUMNS, rows: ROWS });
		const button = el.querySelectorAll(".dd-sort")[1];

		button.click();
		expect(printed(el).at(-1)).toBe("edge-02");
		button.click();
		expect(printed(el).at(-1)).toBe("edge-02");
	});

	it("starts a different column ascending rather than inheriting the reversal", () => {
		const { el } = draw({ sortable: true, columns: COLUMNS, rows: ROWS });
		const [node, response] = el.querySelectorAll(".dd-sort");
		response.click();
		response.click();
		node.click();
		expect(printed(el)[0]).toBe("edge-01");
	});

	it("moves `aria-sort` with the order and leaves it on exactly one header", () => {
		const { el } = draw({ sortable: true, columns: COLUMNS, rows: ROWS });
		const [node, response] = el.querySelectorAll(".dd-sort");

		response.click();
		expect(el.querySelectorAll("[aria-sort]")).toHaveLength(1);
		expect(el.querySelectorAll("thead th")[1].getAttribute("aria-sort")).toBe("ascending");

		response.click();
		expect(el.querySelectorAll("thead th")[1].getAttribute("aria-sort")).toBe("descending");

		node.click();
		expect(el.querySelectorAll("thead th")[1].hasAttribute("aria-sort")).toBe(false);
		expect(el.querySelectorAll("thead th")[0].getAttribute("aria-sort")).toBe("ascending");
	});

	it("carries the escaping and the drill attributes through a sort", () => {
		// The rows are moved as the strings `render` produced. Rebuilding them here
		// is what this test exists to stop somebody doing.
		const { el } = draw({
			sortable: true,
			columns: COLUMNS,
			rows: [
				{ node: '<img src=x onerror="alert(1)">', response: "9 ms", drill: { doctype: "Node" } },
				{ node: "edge-09", response: "1 ms" },
			],
		});
		el.querySelectorAll(".dd-sort")[1].click();
		expect(el.querySelector("tbody").innerHTML).not.toContain("<img");
		expect(el.querySelectorAll("tbody [data-dd-drill]")).toHaveLength(1);
	});

	it("releases its listener on teardown", () => {
		const { el, teardown } = draw({ sortable: true, columns: COLUMNS, rows: ROWS });
		teardown();
		el.querySelectorAll(".dd-sort")[1].click();
		expect(printed(el)).toEqual(["edge-01", "edge-02", "edge-03", "edge-04"]);
	});
});

describe("virtual", () => {
	const many = Array.from({ length: 500 }, (_, i) => ({
		node: `edge-${i}`,
		response: `${i} ms`,
	}));

	it("fills a body the render deliberately left empty", () => {
		const { el } = draw({ virtual: true, max_height: 200, columns: COLUMNS, rows: many });
		expect(el.querySelectorAll("tbody tr").length).toBeGreaterThan(0);
	});

	it("draws everything rather than nothing when there is no layout to measure", () => {
		// happy-dom has no box model, so `offsetHeight` is 0 — which is also what a
		// panel inside a hidden tab reports on a real page. A slow table beats an
		// empty one, and the next scroll re-measures.
		const { el } = draw({ virtual: true, max_height: 200, columns: COLUMNS, rows: many });
		expect(el.querySelectorAll("tbody tr:not(.dd-vspacer)")).toHaveLength(500);
	});

	it("still sorts", () => {
		const { el } = draw({ virtual: true, sortable: true, max_height: 200, columns: COLUMNS, rows: many });
		el.querySelectorAll(".dd-sort")[1].click();
		expect(printed(el)[0]).toBe("edge-0");
		el.querySelectorAll(".dd-sort")[1].click();
		expect(printed(el)[0]).toBe("edge-499");
	});

	it("draws nothing at all for no rows, rather than a spacer with no rows in it", () => {
		const { el } = draw({ virtual: true, max_height: 200, columns: COLUMNS, rows: [] });
		expect(el.querySelector("tbody").innerHTML).toBe("");
	});
});

/**
 * The CSV button.
 *
 * The file is built from the spec through the current order, not scraped out of
 * the DOM — which is the only way a virtual table can export the 460 rows that
 * are not currently in the document. A file that silently held the visible forty
 * would be worse than no button at all, so that is what the last case pins.
 */
describe("export", () => {
	let saved;
	let clicked;
	let filename;

	beforeEach(() => {
		saved = null;
		clicked = 0;
		filename = null;
		URL.createObjectURL = (blob) => {
			saved = blob;
			return "blob:test";
		};
		URL.revokeObjectURL = () => {};
		// The anchor is stubbed rather than let fly: a real `click()` on a download
		// link asks the environment to save a file, which happy-dom answers with a
		// navigation warning that has nothing to do with what is being tested.
		HTMLAnchorElement.prototype.click = function () {
			clicked += 1;
			filename = this.download;
		};
	});

	const text = async () => (await saved.text()).replace(/^\uFEFF/, "");

	const press = (el) => {
		const button = el.closest(".dd-table-panel").querySelector(".dd-export");
		button.click();
		return button;
	};

	it("writes the header and every row", async () => {
		const { el } = draw({ export: true, columns: COLUMNS, rows: ROWS });
		press(el);
		expect(clicked).toBe(1);
		expect(await text()).toBe(
			"Node,Response\r\nedge-01,88 ms\r\nedge-02,—\r\nedge-03,42 ms\r\nedge-04,210 ms",
		);
	});

	it("follows the order the reader sorted into", async () => {
		const { el } = draw({ export: true, sortable: true, columns: COLUMNS, rows: ROWS });
		el.querySelectorAll(".dd-sort")[1].click();
		press(el);
		const rows = (await text()).split("\r\n").slice(1);
		expect(rows[0]).toBe("edge-03,42 ms");
		expect(rows[3]).toBe("edge-02,—");
	});

	it("exports the value, never the private sort key", async () => {
		const { el } = draw({
			export: true,
			columns: COLUMNS,
			rows: [{ node: "edge-01", response: { value: "Breached", sort: 2 } }],
		});
		press(el);
		expect(await text()).toContain("Breached");
		expect(await text()).not.toContain(",2");
	});

	it("names the file after the caption and the day it was taken", () => {
		const { el } = draw({ export: true, caption: "Edge nodes", columns: COLUMNS, rows: ROWS });
		press(el);
		expect(filename).toBe("edge-nodes-2026-01-15.csv");
		// The anchor exists only for the length of the click.
		expect(document.querySelector("a")).toBe(null);
	});

	it("exports rows a virtual table is not currently drawing", async () => {
		const many = Array.from({ length: 500 }, (_, i) => ({ node: `edge-${i}`, response: `${i} ms` }));
		const { el } = draw({ export: true, virtual: true, max_height: 200, columns: COLUMNS, rows: many });
		press(el);
		expect((await text()).split("\r\n")).toHaveLength(501);
	});

	it("releases the button on teardown", () => {
		const { el, teardown } = draw({ export: true, columns: COLUMNS, rows: ROWS });
		teardown();
		press(el);
		expect(clicked).toBe(0);
	});
});
